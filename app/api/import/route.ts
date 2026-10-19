import { Readable } from 'stream';
import csvParser from 'csv-parser';
import { pRateLimit } from 'p-ratelimit';
import { getGroupCookie } from '@/app/actions/group-cookie';
import { getAuthenticatedSupabaseClient } from '@/app/lib/auth/group-auth';
import {
	createUpserter,
	createRingSequenceLookup,
	createRingSequenceLinker,
	ImportJobTracker,
	processEncounterRow,
	getDistinctLocationNames,
	findUnrecognisedLocationNames,
	CasualtyEncounterError,
	type DemonRow
} from '@/lib/demon-import';

export const maxDuration = 300;

export type ImportProgressMessage = { type: 'progress'; processed: number };
export type ImportCompleteMessage = {
	type: 'complete';
	processed: number;
	successful: number;
	failed: number;
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

			const limit = pRateLimit({
				interval: 1000,
				rate: 30,
				concurrency: 30
			}) as <T>(fn: () => Promise<T>) => Promise<T>;

			let processed = 0;
			let successful = 0;
			let failed = 0;
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
				const upsert = createUpserter(supabaseClient);
				const lookupRingSequence = createRingSequenceLookup(supabaseClient);
				const linkRingSequence = createRingSequenceLinker(supabaseClient);

				await Promise.all(
					rows.map((row) =>
						limit(async () => {
							if (Date.now() > deadline) {
								timedOut = true;
								return;
							}
							try {
								const { visitDate } = await processEncounterRow(
									row,
									upsert,
									lookupRingSequence,
									ringingGroupId,
									linkRingSequence
								);
								successful++;
								if (startDate === null || visitDate < startDate)
									startDate = visitDate;
								if (endDate === null || visitDate > endDate)
									endDate = visitDate;
							} catch (err) {
								if (!(err instanceof CasualtyEncounterError)) failed++;
							}
							processed++;
							if (processed % 10 === 0) send({ type: 'progress', processed });
						})
					)
				);

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
						failed
					});
					send({ type: 'complete', processed, successful, failed });
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
