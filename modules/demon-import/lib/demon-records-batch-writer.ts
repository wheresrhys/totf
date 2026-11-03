import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase.types';
import type { DemonRow } from '../types';
import {
	convertDateFormat,
	isRinglessRingNo,
	transformEmptyStringsToNull
} from './row-validation';

type DemonRecordsInsert =
	Database['public']['Tables']['DemonRecords']['Insert'];

/** Rows per `DemonRecords` insert. */
export const DEFAULT_DEMON_RECORDS_BATCH_SIZE = 100;

/** `demon_records_group_ring_date_time_unique` (#960). */
const DEMON_RECORDS_CONFLICT_TARGET =
	'ringing_group_id,ring_no,encounter_date,encounter_time';

type BufferedDemonRecord = {
	record: DemonRecordsInsert;
	/** Position in the run, for the batch-failure log only. */
	rowIndex: number;
	resolve: () => void;
	reject: (reason: unknown) => void;
};

/**
 * The staging row for one CSV row, or `null` when the row can't be staged at all
 * (most commonly a ringless casualty record). `raw_row` is deliberately the
 * untransformed row — the point of the table is a non-lossy copy of what was
 * submitted.
 */
function buildDemonRecord(
	rawRow: DemonRow,
	importJobId: number,
	ringingGroupId: number
): DemonRecordsInsert | null {
	const row = transformEmptyStringsToNull(rawRow) as DemonRow;
	if (isRinglessRingNo(row.ring_no) || !row.visit_date || !row.capture_time)
		return null;

	return {
		raw_row: rawRow,
		ring_no: row.ring_no,
		encounter_date: convertDateFormat(row.visit_date),
		encounter_time: row.capture_time,
		ringing_group_id: ringingGroupId,
		import_job_id: importJobId
	};
}

/**
 * Writes every imported CSV row into `DemonRecords` (#960) in batched multi-row
 * inserts, so a completeness/recovery record of what was submitted exists before
 * the row is interpreted into Species/Birds/Sessions/Encounters. One instance
 * per import run. See modules/demon-import/CLAUDE.md's "Design choices" for why
 * it's a class and why batching is interleaved with row processing.
 */
export class DemonRecordsBatchWriter {
	private readonly importJobId: number;
	private readonly ringingGroupId: number;
	private readonly batchSize: number;

	private buffer: BufferedDemonRecord[] = [];
	private rowsBuffered = 0;
	private readonly landedEncounterDates = new Set<string>();
	// Batches are chained rather than fired off in parallel, so they land in the
	// order they filled. That keeps the order rows are released in — and so the
	// order they enter the rate limiter and acquire their row ids — a function of
	// the CSV rather than of which insert happened to return first, which is what
	// `seed-e2e-data.ts`'s `concurrency: 1` determinism (#903) depends on.
	private batchChain: Promise<void> = Promise.resolve();

	constructor(
		private readonly supabaseClient: SupabaseClient,
		{
			importJobId,
			ringingGroupId,
			batchSize = DEFAULT_DEMON_RECORDS_BATCH_SIZE
		}: {
			importJobId: number;
			ringingGroupId: number;
			batchSize?: number;
		}
	) {
		this.importJobId = importJobId;
		this.ringingGroupId = ringingGroupId;
		this.batchSize = batchSize;
	}

	private async writeBatch(batch: BufferedDemonRecord[]): Promise<void> {
		const { error } = await this.supabaseClient
			.from('DemonRecords')
			.upsert<DemonRecordsInsert>(
				batch.map(({ record }) => record),
				{
					onConflict: DEMON_RECORDS_CONFLICT_TARGET,
					// ON CONFLICT DO NOTHING: re-importing an overlapping CSV is a
					// no-op per already-staged row, not an error and not a duplicate.
					ignoreDuplicates: true
				}
			);

		// Resolved/rejected rather than thrown: the failure belongs to this batch's rows.
		if (error) {
			console.error(
				'Failed to write a DemonRecords batch; its rows will not be imported',
				{
					importJobId: this.importJobId,
					ringingGroupId: this.ringingGroupId,
					rowCount: batch.length,
					rowIndices: batch.map(({ rowIndex }) => rowIndex)
				},
				error
			);
			for (const bufferedRecord of batch) bufferedRecord.reject(error);
			return;
		}

		for (const bufferedRecord of batch) {
			this.landedEncounterDates.add(bufferedRecord.record.encounter_date);
			bufferedRecord.resolve();
		}
	}

	private flushBufferedBatch(): void {
		if (this.buffer.length === 0) return;
		const batch = this.buffer;
		this.buffer = [];
		this.batchChain = this.batchChain.then(() => this.writeBatch(batch));
	}

	/**
	 * Buffers `rawRow` for the next `DemonRecords` insert and resolves once the
	 * whole batch containing it has landed — not when it was buffered. A row that
	 * can't be staged at all resolves immediately; see `buildDemonRecord`.
	 */
	writeDemonRecord(rawRow: DemonRow): Promise<void> {
		const record = buildDemonRecord(
			rawRow,
			this.importJobId,
			this.ringingGroupId
		);
		if (!record) return Promise.resolve();

		const rowIndex = this.rowsBuffered++;
		// The executor runs synchronously, so the row is buffered before this
		// returns — which is what lets a whole batch fill within one synchronous
		// dispatch pass over the rows.
		const batchLanded = new Promise<void>((resolve, reject) => {
			this.buffer.push({ record, rowIndex, resolve, reject });
		});
		if (this.buffer.length >= this.batchSize) this.flushBufferedBatch();
		return batchLanded;
	}

	/**
	 * Flushes the trailing partial batch and waits for every batch of the run to
	 * have landed. Call it once, after every row has been handed to
	 * `writeDemonRecord` but before awaiting any row's promise.
	 */
	async flushRemaining(): Promise<void> {
		this.flushBufferedBatch();
		// Nothing appends to the chain once the caller has stopped buffering rows
		// (`writeBatch` never does), so the chain as it stands here is the whole
		// run's worth of batches.
		await this.batchChain;
	}

	/** The distinct `encounter_date`s across every batch that has landed so far. */
	getDistinctDates(): string[] {
		return [...this.landedEncounterDates].sort();
	}
}
