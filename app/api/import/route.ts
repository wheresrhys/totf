import { Readable } from 'stream';
import csvParser from 'csv-parser';
import { pRateLimit } from 'p-ratelimit';
import { getGroupCookie } from '@/app/actions/group-cookie';
import { getAuthenticatedSupabaseClient } from '@/app/lib/auth/group-auth';
import {
	createRingSequenceLookup,
	createRingSequenceLinker,
	DemonRecordsBatchWriter,
	EncounterRowBatchWriter,
	ImportJobTracker,
	processEncounterRow,
	getDistinctLocationNames,
	findUnrecognisedLocationNames,
	CasualtyEncounterError,
	type DemonRow
} from '@/lib/demon-import';
import { dispatchStatsCacheRefreshEvents } from '@/modules/stats';
export const maxDuration = 300;

export type ImportProgressMessage = { type: 'progress'; processed: number };
export type ImportCompleteMessage = {
	type: 'complete';
	processed: number;
	successful: number;
	failed: number;
	skipped: number;
};
export type ImportTimeoutMessage = {
	type: 'timeout';
	processed: number;
	startDate: string | null;
	endDate: string | null;
};
export type ImportErrorMessage = { type: 'error'; message: string };
// The CSV named locations this group has no `Locations` row for, so the import
// was abandoned before any row was written (#1079).
export type ImportUnrecognisedLocationsMessage = {
	type: 'unrecognised_locations';
	locations: string[];
};
export type ImportMessage =
	| ImportProgressMessage
	| ImportCompleteMessage
	| ImportTimeoutMessage
	| ImportErrorMessage
	| ImportUnrecognisedLocationsMessage;

const TIMEOUT_MS = 280_000;

/**
 * Thrown in place of a chunk's domain-table writes once the 280s deadline has
 * passed. The check has to happen at the moment the rate limiter grants a slot —
 * not when a row is dispatched, which for a large upload is t≈0 for every row —
 * and since #959 that moment is inside the limited callback, whose only way out
 * is to throw. Since #1139 the limited callback is a whole chunk flush, so the
 * error abandons every row of that chunk rather than a single row. Never leaves
 * this module.
 */
class ImportDeadlineExceededError extends Error {
	constructor() {
		super('Import deadline exceeded');
		this.name = 'ImportDeadlineExceededError';
	}
}

export async function POST(request: Request): Promise<Response> {
	const ringingGroupId = await getGroupCookie();
	if (!ringingGroupId) {
		return new Response('Unauthorized', { status: 401 });
	}

	const formData = await request.formData();
	const file = formData.get('csv') as File | null;
	if (!file) {
		return new Response('Missing csv file', { status: 400 });
	}

	const buffer = Buffer.from(await file.arrayBuffer());
	const supabaseClient = await getAuthenticatedSupabaseClient();
	const deadline = Date.now() + TIMEOUT_MS;
	const encoder = new TextEncoder();

	const stream = new ReadableStream({
		async start(controller) {
			function send(message: ImportMessage): void {
				controller.enqueue(encoder.encode(JSON.stringify(message) + '\n'));
			}

			let processed = 0;
			let successful = 0;
			let failed = 0;
			let skipped = 0;
			let startDate: string | null = null;
			let endDate: string | null = null;
			let timedOut = false;
			// Null until the pre-flight has passed and the job row has been opened, so
			// the catch branch below knows whether there is anything to mark failed.
			let importJobId: number | null = null;

			const importJobTracker = new ImportJobTracker(supabaseClient);

			try {
				const rows: DemonRow[] = [];
				await new Promise<void>((resolve, reject) => {
					Readable.from(buffer)
						.pipe(csvParser())
						.on('data', (row: DemonRow) => rows.push(row))
						.on('end', resolve)
						.on('error', reject);
				});

				// Pre-flight: a `loc_id` the group has no Location for is far more
				// often a renamed site than a genuinely new one (#1048), and
				// importing it would fork the Locations row and duplicate every
				// encounter under it. Abort before the first write, so the whole
				// upload is a no-op and a plain re-upload is safe once the name has
				// been resolved.
				const unrecognisedLocations = await findUnrecognisedLocationNames(
					supabaseClient,
					getDistinctLocationNames(rows),
					ringingGroupId
				);
				if (unrecognisedLocations.length > 0) {
					send({
						type: 'unrecognised_locations',
						locations: unrecognisedLocations
					});
					return;
				}

				// Opened only once the pre-flight has passed, for the same reason the
				// writers below are: an aborted upload stays a complete no-op (#1079)
				// rather than leaving an orphan `in_progress` row behind for a run
				// that never wrote anything.
				importJobId = await importJobTracker.createImportJob(ringingGroupId);

				// Deliberately built only once the pre-flight has passed, so an
				// aborted import never even constructs the writers.
				// Every row is staged into DemonRecords before it is interpreted
				// into the domain tables (#959), batched so the per-row concurrency
				// below survives.
				const demonRecordsBatchWriter = new DemonRecordsBatchWriter(
					supabaseClient,
					{ importJobId, ringingGroupId }
				);

				// Wrapped around a whole chunk flush — never around a row's own
				// buffering call, whose DemonRecords staging write and whose chunk
				// must both stay unthrottled so a batch/chunk can fill (see
				// `DemonRecordsBatchWriter` and `EncounterRowBatchWriter`). Before
				// #1139 this capped concurrent per-row domain writes; it now caps
				// concurrent chunk flushes.
				const limit = pRateLimit({
					interval: 1000,
					rate: 30,
					concurrency: 30
				}) as <T>(fn: () => Promise<T>) => Promise<T>;
				const encounterRowBatchWriter = new EncounterRowBatchWriter(
					supabaseClient,
					{
						ringingGroupId,
						importJobId,
						lookupRingSequence: createRingSequenceLookup(supabaseClient),
						linkRingSequence: createRingSequenceLinker(supabaseClient),
						limitChunkFlush: (flushChunk) =>
							limit(() => {
								if (Date.now() > deadline)
									throw new ImportDeadlineExceededError();
								return flushChunk();
							})
					}
				);

				// Mapped (not awaited) first, so every row reaches
				// `writeDemonRecord` and the buffer holds exactly the trailing
				// partial batch by the time `flushRemaining` runs below.
				const pendingRows = rows.map(async (row) => {
					try {
						const { visitDate } = await processEncounterRow(
							row,
							demonRecordsBatchWriter,
							encounterRowBatchWriter
						);
						successful++;
						if (startDate === null || visitDate < startDate)
							startDate = visitDate;
						if (endDate === null || visitDate > endDate) endDate = visitDate;
					} catch (err) {
						// An abandoned row is neither a success nor a failure, and is
						// left out of `processed` exactly as it was before the deadline
						// check moved inside the limiter.
						if (err instanceof ImportDeadlineExceededError) {
							timedOut = true;
							return;
						}
						if (err instanceof CasualtyEncounterError) {
							skipped++;
						} else {
							failed++;
						}
					}
					processed++;
					if (processed % 10 === 0) send({ type: 'progress', processed });
				});

				await demonRecordsBatchWriter.flushRemaining();
				// Recorded once every staging batch has landed, and before the
				// still-pending domain-table writes are awaited: `affected_dates`
				// describes what is durably staged, independent of how the
				// domain-table import then goes.
				await importJobTracker.recordAffectedDates(
					importJobId,
					demonRecordsBatchWriter.getDistinctDates()
				);
				// Flushed before the rows are awaited, for the same reason the staging
				// buffer is: a row's promise is what settles when its chunk lands, so
				// awaiting the rows first would deadlock on the trailing chunk.
				await encounterRowBatchWriter.flushRemaining();

				await Promise.all(pendingRows);

				if (timedOut) {
					await importJobTracker.markImportJobTimedOut(importJobId, {
						processed,
						startDate,
						endDate
					});
					send({ type: 'timeout', processed, startDate, endDate });
				} else {
					await importJobTracker.completeImportJob(importJobId, {
						processed,
						successful,
						failed,
						skipped
					});
					await dispatchStatsCacheRefreshEvents(
						importJobId,
						ringingGroupId,
						demonRecordsBatchWriter.getDistinctDates(),
						encounterRowBatchWriter.getDistinctSpeciesIds()
					);
					send({ type: 'complete', processed, successful, failed, skipped });
				}
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				// `importJobId` is still null if the throw came from CSV parsing or the
				// location pre-flight, i.e. before any job row existed.
				if (importJobId !== null) {
					try {
						await importJobTracker.failImportJob(importJobId, message);
					} catch (failureRecordingError) {
						console.error(
							`Failed to mark ImportJobs row ${importJobId} as failed`,
							{ ringingGroupId, message },
							failureRecordingError
						);
					}
				}
				send({ type: 'error', message });
			} finally {
				controller.close();
			}
		}
	});

	return new Response(stream, {
		headers: { 'Content-Type': 'application/x-ndjson' }
	});
}
