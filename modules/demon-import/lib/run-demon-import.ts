import { Readable } from 'node:stream';
import csvParser from 'csv-parser';
import { pRateLimit } from 'p-ratelimit';
import type { SupabaseClient } from '@supabase/supabase-js';
import { dispatchStatsCacheRefreshEvents } from '@/modules/stats';
import type { DemonRow, DemonImportUpdate } from '../types';
import { CasualtyEncounterError } from './row-validation';
import {
	findUnrecognisedLocationNames,
	getDistinctLocationNames
} from './locations';
import {
	createRingSequenceLinker,
	createRingSequenceLookup
} from './ring-sequences';
import { ImportJobTracker } from './import-job-tracker';
import { DemonRecordsBatchWriter } from './demon-records-batch-writer';
import { EncounterRowBatchWriter } from './encounter-batch-writer';
import { processEncounterRow } from './process-encounter-row';

/** Rows processed concurrently when a run doesn't override it. */
export const DEFAULT_IMPORT_CONCURRENCY = 30;

export interface RunDemonImportOptions {
	supabaseClient: SupabaseClient;
	ringingGroupId: number;
	/** Raw CSV bytes (web route) or already-materialized rows (CLI / regenerate-import). */
	source: Buffer | DemonRow[];
	/** Max rows processed concurrently. Defaults to {@link DEFAULT_IMPORT_CONCURRENCY}. */
	concurrency?: number;
	/** Wall-clock budget from the moment the run starts. Omit to never time out. */
	timeoutMs?: number;
	/** Merged into dispatchStatsCacheRefreshEvents's log context and this run's own failure log. */
	logContext?: Record<string, unknown>;
}

/**
 * Thrown in place of a chunk's domain-table writes once the deadline has
 * passed. The check has to happen at the moment the rate limiter grants a slot —
 * not when a row is dispatched, which for a large upload is t≈0 for every row —
 * and since the limited callback is a whole chunk flush, the error abandons
 * every row of that chunk rather than a single row. Never leaves this file.
 */
class ImportDeadlineExceededError extends Error {
	constructor() {
		super('Import deadline exceeded');
		this.name = 'ImportDeadlineExceededError';
	}
}

function parseDemonCsvBuffer(buffer: Buffer): Promise<DemonRow[]> {
	return new Promise((resolve, reject) => {
		const rows: DemonRow[] = [];
		Readable.from(buffer)
			.pipe(csvParser())
			.on('data', (row: DemonRow) => rows.push(row))
			.on('end', () => resolve(rows))
			.on('error', reject);
	});
}

/**
 * A `push`/`drain` queue bridging `performImport`'s plain callback-based
 * reporting (called from inside detached per-row promises, so it can't `yield`
 * directly) and `runDemonImport`'s `async function*` surface. Pushes between
 * `drain`'s wake-ups are plain array appends — single JS thread, no race — and
 * `drain` only returns once `close` has been called and the buffer is empty, so
 * the terminal update is always yielded before the generator ends.
 */
function createUpdateChannel<T>() {
	const buffered: T[] = [];
	// Holds the resolve function of the Promise `drain` is currently
	// suspended on, or null when nothing is suspended (`drain` is mid-`yield`,
	// or hasn't needed to wait yet). `push`/`close` call it to resume `drain`
	// without polling the buffer.
	let wakeUp: (() => void) | null = null;
	let closed = false;

	function push(item: T): void {
		buffered.push(item);
		// No-op if `drain` isn't currently suspended — the item just sits in
		// `buffered` for `drain`'s next loop iteration to pick up.
		wakeUp?.();
	}
	function close(): void {
		closed = true;
		wakeUp?.();
	}
	async function* drain(): AsyncGenerator<T> {
		while (true) {
			while (buffered.length > 0) yield buffered.shift()!;
			if (closed) return;
			// A Promise executor runs synchronously the instant the Promise is
			// constructed, so `wakeUp = resolve` happens immediately — before
			// `await` suspends anything below. That's what makes this safe
			// despite `push`/`close` running from separate call stacks: JS is
			// single-threaded, so either a `push` lands entirely before this
			// point (the item's already in `buffered`, the `while` above
			// already caught it, we never even get here) or entirely after
			// `wakeUp` has been assigned (it resolves this exact Promise).
			// There's no gap where `drain` is "about to wait" but `wakeUp`
			// isn't registered yet, so no wakeup can be lost.
			await new Promise<void>((resolve) => {
				wakeUp = resolve;
			});
			// Cleared so `wakeUp?.()` above correctly reflects "nothing is
			// waiting right now" — calling an already-resolved `resolve`
			// again is harmless, but a stale non-null `wakeUp` would make
			// that short-circuit a lie.
			wakeUp = null;
		}
	}
	return { push, close, drain };
}

async function performImport(
	options: RunDemonImportOptions,
	push: (update: DemonImportUpdate) => void
): Promise<void> {
	const {
		supabaseClient,
		ringingGroupId,
		source,
		concurrency = DEFAULT_IMPORT_CONCURRENCY,
		timeoutMs,
		logContext
	} = options;
	const deadline = timeoutMs === undefined ? undefined : Date.now() + timeoutMs;

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
		const rows = Buffer.isBuffer(source)
			? await parseDemonCsvBuffer(source)
			: source;

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
			push({
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
		const demonRecordsBatchWriter = new DemonRecordsBatchWriter(
			supabaseClient,
			{ importJobId, ringingGroupId }
		);

		// Wrapped around a whole chunk flush — never around a row's own
		// buffering call, whose DemonRecords staging write and whose chunk
		// must both stay unthrottled so a batch/chunk can fill (see
		// `DemonRecordsBatchWriter` and `EncounterRowBatchWriter`).
		const limit = pRateLimit({
			interval: 1000,
			rate: 30,
			concurrency
		}) as <T>(fn: () => Promise<T>) => Promise<T>;
		// No deadline (CLI callers) means no deadline check at all, not a very
		// long one — matches `createRowLimiter`'s old CLI-only behaviour exactly.
		const limitChunkFlush =
			deadline === undefined
				? (flushChunk: () => Promise<void>) => limit(flushChunk)
				: (flushChunk: () => Promise<void>) =>
						limit(() => {
							if (Date.now() > deadline)
								throw new ImportDeadlineExceededError();
							return flushChunk();
						});
		const encounterRowBatchWriter = new EncounterRowBatchWriter(
			supabaseClient,
			{
				ringingGroupId,
				importJobId,
				lookupRingSequence: createRingSequenceLookup(supabaseClient),
				linkRingSequence: createRingSequenceLinker(supabaseClient),
				limitChunkFlush
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
				if (startDate === null || visitDate < startDate) startDate = visitDate;
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
			if (processed % 10 === 0) push({ type: 'progress', processed });
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
			push({ type: 'timeout', processed, startDate, endDate });
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
				encounterRowBatchWriter.getDistinctSpeciesIds(),
				logContext ?? {}
			);
			push({ type: 'complete', processed, successful, failed, skipped });
		}
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		// Logged here (not just sent as the `error` update's `.message`) per
		// this project's rule that every unexpected error is logged with
		// metadata — a stack trace can never reach the NDJSON consumer.
		console.error(
			'runDemonImport: row processing failed',
			{ ringingGroupId, ...logContext },
			err
		);
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
		push({ type: 'error', message });
	}
}

/** Runs one CSV import end to end, yielding a `DemonImportUpdate` as the run progresses. */
export async function* runDemonImport(
	options: RunDemonImportOptions
): AsyncGenerator<DemonImportUpdate> {
	const channel = createUpdateChannel<DemonImportUpdate>();
	const run = performImport(options, channel.push).finally(channel.close);
	yield* channel.drain();
	await run;
}
