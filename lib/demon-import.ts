import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase.types';
import type { ImportJobStatus, ResightingRecordType } from '@/app/models/db';
// Relative, not `@/`-aliased, for the same reason `app/lib/queue-dispatch.ts` imports
// its queue consumer relatively: these are value imports `lib/` needs at
// runtime (the CLI importer's `tsx` runner included), and `@/` alias
// resolution is scoped to tsconfig.json's `include`, which `lib/` sits outside
// of. The two `@/`-aliased imports above are `import type` only, erased before
// either runtime sees them, so they aren't subject to the same constraint.
import type { StatsTemporalUnit } from '@/app/models/temporal-unit';

type SpeciesInsert = Database['public']['Tables']['Species']['Insert'];
type BirdsInsert = Omit<
	Database['public']['Tables']['Birds']['Insert'],
	'last_encountered_timestamp'
>;
type EncountersInsert = Omit<
	Database['public']['Tables']['Encounters']['Insert'],
	'ringing_group_id' | 'max_hatch_year' | 'min_hatch_year'
>;
// Unlike the Encounters/Birds inserts above, nothing is omitted here: Sessions'
// ringing_group_id used to be derived by the trg_set_session_generated_fields
// trigger from Sessions.location_id, and #1024 dropped both, so the import
// writes it itself.
type SessionsInsert = Database['public']['Tables']['Sessions']['Insert'];
type LocationsInsert = Database['public']['Tables']['Locations']['Insert'];
type RingSequencesBirdsInsert =
	Database['public']['Tables']['RingSequences_Birds']['Insert'];
type ImportJobsInsert = Database['public']['Tables']['ImportJobs']['Insert'];
type ImportJobsUpdate = Database['public']['Tables']['ImportJobs']['Update'];
type DemonRecordsInsert =
	Database['public']['Tables']['DemonRecords']['Insert'];

export type DemonColumnNames =
	| 'entered_by'
	| 'nest_link_code'
	| 'validation_comments'
	| 'submission_status'
	| 'filename'
	| 'record_type'
	| 'new/subsequent'
	| 'ring_no'
	| 'scheme'
	| 'scheme2'
	| 'ring_no2'
	| 'species_name'
	| 'age'
	| 'pulli_ringed'
	| 'pulli_alive'
	| 'sex'
	| 'sexing_method'
	| 'provisional_sex'
	| 'breeding_condition'
	| 'visit_date'
	| 'capture_time'
	| 'loc_id'
	| 'gridref'
	| 'habitat_1'
	| 'habitat_2'
	| 'status_code_1'
	| 'status_code_2'
	| 'lure_code_1'
	| 'lure_code_2'
	| 'wing_length'
	| 'weight'
	| 'date_measured'
	| 'time_w'
	| 'condition'
	| 'moult_code'
	| 'alula'
	| 'old_greater_coverts'
	| 'primary_moult'
	| 'primary_covert_moult_scores'
	| 'secondary_moult_scores'
	| 'finding_condition'
	| 'finding_circumstances'
	| 'capture_method'
	| 'metal_mark_info'
	| 'ringer_initials'
	| 'ringer_check_initials'
	| 'processor_initials'
	| 'extractor_initials'
	| 'wing_initials'
	| 'colour_mark_info'
	| 'metal_mark_position'
	| 'fat'
	| 'pectoral_muscle'
	| 'body_moult'
	| 'greater_covert_moult_scores'
	| 'alula_moult_scores'
	| 'carpal_covert_moult'
	| 'wing_point'
	| 'primary_length'
	| 'bill_length_method'
	| 'bill_length'
	| 'head_bill_length'
	| 'bill_depth_method'
	| 'bill_depth'
	| 'tarsus_length_method'
	| 'tail_moult_scores'
	| 'tarsus_length'
	| 'tail_length'
	| 'claw_length'
	| 'plumage'
	| 'tail_diff'
	| 'lesser_median_covert_moult'
	| 'underwing_covert_moult'
	| 'head_moult'
	| 'upperparts_moult'
	| 'underparts_moult'
	| 'permit_no'
	| 'pullus_stage'
	| 'extra_text'
	| 'date_accuracy'
	| 'left_leg_below'
	| 'right_leg_below'
	| 'left_leg_above'
	| 'right_leg_above'
	| 'neck_collar'
	| 'left_wing_tag'
	| 'right_wing_tag'
	| 'nasal_saddle'
	| 'sample_processed'
	| 'high_tide_time'
	| 'finder_name'
	| 'own'
	| 'own2'
	| 'userc1'
	| 'userc2'
	| 'email'
	| 'userc3'
	| 'userc4'
	| 'userc5'
	| 'userv1'
	| 'userv2'
	| 'userv3'
	| 'userv4'
	| 'userv5'
	| 'l_primary_moult_scores'
	| 'l_secondary_moult_scores'
	| 'l_tail_moult_scores'
	| 'l_primary_covert_moult_scores'
	| 'l_greater_covert_moult_scores'
	| 'l_carpal_covert_moult'
	| 'l_alula_moult_scores'
	| 'toe_span';

export type DemonRow = Record<DemonColumnNames, string>;

// `record_type` values that indicate a passive resighting/recovery (no bird
// in the hand) rather than a capture (see the DemOn field spec referenced in
// CLAUDE.md for the full record_type code table).
// Typed against the generated `resighting_record_type` enum so a DB-side
// rename/removal fails to compile here instead of silently drifting (mirrors
// RING_SIZE_ENUM_ORDER's pinning against the ring_size enum). Keep in sync with
// the enum by hand — the exhaustiveness test in demon-import.test.ts guards it.
export const RESIGHTING_RECORD_TYPES: ResightingRecordType[] = ['U', 'F', 'D'];

export class CasualtyEncounterError extends Error {
	constructor() {
		super('Casualty encounters are not to be imported');
		this.name = 'CasualtyEncounterError';
	}
}

// '-' is DemOn's own sentinel for "no ring number" on a casualty row (confirmed
// against a real export row) — not a guess, so don't extend this to other
// placeholder values without the same kind of evidence.
export function isRinglessRingNo(ring_no: string | null | undefined): boolean {
	const trimmed = ring_no?.trim();
	return !trimmed || trimmed === '-';
}

export function transformEmptyStringsToNull(
	obj: Record<string, unknown>
): Record<string, unknown> {
	return Object.fromEntries(
		Object.entries(obj).map(([key, value]) => {
			if (typeof value === 'string') {
				const trimmed = value.trim();
				return [key, trimmed === '' ? null : trimmed];
			}
			return [key, value];
		})
	);
}

export function convertDateFormat(dateString: string): string {
	return dateString.split('/').reverse().join('-');
}

// The distinct, non-empty `loc_id` values across a parsed CSV, normalised the
// same way `EncounterRowBatchWriter` normalises the row it upserts a Location from
// (`transformEmptyStringsToNull` — trimmed, with '' becoming null), so a name
// checked here is byte-identical to the name that would be written.
export function getDistinctLocationNames(rows: DemonRow[]): string[] {
	const locationNames = new Set<string>();
	for (const rawRow of rows) {
		const { loc_id: locationName } = transformEmptyStringsToNull(
			rawRow
		) as DemonRow;
		if (locationName) locationNames.add(locationName);
	}
	return [...locationNames];
}

// Which of `distinctLocationNames` the group has no `Locations` row for.
//
// An import's `loc_id` column is the group's own DemOn site code, and the
// Locations upsert in `EncounterRowBatchWriter` keys Locations on
// `(location_name, ringing_group_id)` — so a group re-coding an existing site
// (#1048: `972` → `CES972`) silently forks a second Locations row and
// re-imports every encounter under it. Both import entry points therefore run
// this over a whole CSV *before* writing anything, and abort if it returns
// anything: an unrecognised name is far more often a rename than a genuine new
// site, and the caller can't tell which.
export async function findUnrecognisedLocationNames(
	supabaseClient: SupabaseClient,
	distinctLocationNames: string[],
	ringingGroupId: number
): Promise<string[]> {
	if (distinctLocationNames.length === 0) return [];

	const { data, error } = await supabaseClient
		.from('Locations')
		.select('location_name')
		.eq('ringing_group_id', ringingGroupId)
		.in('location_name', distinctLocationNames);
	if (error) throw error;

	const knownLocationNames = new Set(
		(data ?? []).map(({ location_name }) => location_name as string)
	);
	return distinctLocationNames.filter(
		(locationName) => !knownLocationNames.has(locationName)
	);
}

// Looks up the existing `RingSequences` row a ring number belongs to and returns
// its id, or `null` if the group has no sequence covering it. A sequence matches
// when two criteria hold:
//   1. its `prefix` equals the first three characters of the ring number (a ring
//      prefix is always exactly three letters), and
//   2. the ring's numeric part (the trailing digits, after stripping the leading
//      alpha prefix) falls within the sequence's numeric window,
//      `first_index <= ring number <= last_index` — powered by the
//      `first_index`/`last_index` generated columns on RingSequences.
// `(prefix, ringing_group_id)` is unique, so at most one row can match. The import
// deliberately never *creates* a sequence here (that was removed in #695 — it
// slowed imports catastrophically): sequences are authored in the ring-sequences
// UI, and a ring with no matching sequence is simply left unassigned.
export function createRingSequenceLookup(supabaseClient: SupabaseClient) {
	return async (
		ringNo: string,
		ringingGroupId: number
	): Promise<number | null> => {
		const prefix = ringNo.slice(0, 3);
		if (prefix.length === 0) return null;

		// The ring's numeric part: trailing digits after the leading alpha prefix.
		// Must match the `first_index`/`last_index` generated-column parse
		// (`substring(... FROM '[0-9]+$')`). A ring with no trailing digits can't be
		// range-checked, so it matches no sequence.
		const numericPart = ringNo.match(/[0-9]+$/);
		if (!numericPart) return null;
		const ringNumber = Number(numericPart[0]);

		const { data, error } = await supabaseClient
			.from('RingSequences')
			.select('id')
			.eq('ringing_group_id', ringingGroupId)
			.eq('prefix', prefix)
			.lte('first_index', ringNumber)
			.gte('last_index', ringNumber);
		if (error) throw error;
		if (!data || data.length === 0) return null;
		return data[0].id;
	};
}

// Records that `ringingGroupId` links `birdId` to `ringSequenceId`, via the
// `RingSequences_Birds` join table (issue #703). Tracking is per-group rather than
// a single group-agnostic FK on `Birds`: each group's link is its own row, so one
// group's import can never consume another group's tracking slot for a shared
// bird. Upserts on the table's `(bird_id, ring_sequence_id, ringing_group_id)`
// unique constraint and ignores a duplicate (re-importing the same 'N' row is a
// no-op here, not an error).
export function createRingSequenceLinker(supabaseClient: SupabaseClient) {
	return async (
		birdId: number,
		ringSequenceId: number,
		ringingGroupId: number
	): Promise<void> => {
		const { error } = await supabaseClient
			.from('RingSequences_Birds')
			.upsert<RingSequencesBirdsInsert>(
				{
					bird_id: birdId,
					ring_sequence_id: ringSequenceId,
					ringing_group_id: ringingGroupId
				},
				{
					onConflict: 'bird_id,ring_sequence_id,ringing_group_id',
					ignoreDuplicates: true
				}
			);
		if (error) throw error;
	};
}

/**
 * The four row counts both import entry points already compute, under the one set
 * of names the `ImportJobs` columns use for the first three. The web route's
 * `ImportCompleteMessage` (`{processed, successful, failed, skipped}`) matches this
 * shape as-is; the CLI script's `ImportRowCounts`
 * (`{totalRecords, successfulRecords, failedRecords, skippedRecords}`) is the same
 * four numbers under different names and maps onto it at the call site.
 *
 * `skipped` (a ringless/casualty row — see `CasualtyEncounterError`) is not
 * persisted to `ImportJobs`: `completeImportJob` still only writes
 * `rows_processed`/`rows_successful`/`rows_failed`, so it's in-memory for the
 * current run only.
 */
export type ImportJobRowCounts = {
	processed: number;
	successful: number;
	failed: number;
	skipped: number;
};

/**
 * The outcome a stats-cache refresh can actually be recorded as. The columns are
 * `import_job_status`, which also carries `'in_progress'` (their default, meaning
 * "not yet attempted") and `'timed_out'` (not reachable for a refresh) — neither of
 * which a setter should ever be asked to write.
 */
export type StatsCacheRefreshOutcome = Extract<
	ImportJobStatus,
	'succeeded' | 'failed'
>;

/**
 * Which `ImportJobs` column each temporal unit's refresh outcome lands on
 * (#1154). Keyed on the canonical, DB-enum-backed `StatsTemporalUnit` rather
 * than a fresh copy of the same five-value union: the column an outcome lands
 * on and the temporal unit `refreshSimpleStatsCache` was called with are the
 * same axis by construction, so they must not be able to drift apart.
 *
 * This axis replaced a `StatsCacheType = 'core' | 'biometrics' |
 * 'demographics'`, not as a rename but as a change of axis: the three
 * stats-type cache tables were replaced by the temporal-unit-shaped
 * `SimpleStatsCache` table (#1144; a sibling `ComplexStatsCache` existed
 * alongside it from #1147 until it was removed entirely), refreshed one
 * temporal unit per call, so a temporal unit is now the finest granularity at
 * which a refresh can succeed or fail.
 */
const STATS_CACHE_REFRESH_STATUS_COLUMNS: Record<StatsTemporalUnit, string> = {
	day: 'day_stats_refresh_status',
	month: 'month_stats_refresh_status',
	year: 'year_stats_refresh_status',
	'month-squashed': 'month_squashed_stats_refresh_status',
	'all-time': 'all_time_stats_refresh_status'
};

/**
 * Reads and writes the `ImportJobs` row tracking one import run.
 *
 * A class rather than the `create*` factory that `createRingSequenceLookup`/
 * `createRingSequenceLinker` above use: those each expose
 * one operation, whereas this exposes six variations on the same two-line
 * `.update(...).eq('id', …)` against the same table, which a class groups around the
 * shared `supabaseClient` and the shared `updateImportJob` plumbing without six
 * copies of either.
 *
 * Every operation is deliberately independent: recording one temporal unit's refresh
 * outcome never touches `status`, `affected_dates` or the other four temporal units'
 * columns, and vice versa. That separation is the whole point of the table — "the rows
 * all imported but the monthly stats never refreshed" has to stay visible rather than
 * collapsing into "import succeeded".
 *
 * The import job id is a per-call argument rather than constructor state, because
 * `createImportJob` is what mints it: one tracker opens the row and then drives every
 * later transition on it.
 */
export class ImportJobTracker {
	constructor(private readonly supabaseClient: SupabaseClient) {}

	private async updateImportJob(
		importJobId: number,
		changes: ImportJobsUpdate
	): Promise<void> {
		const { error } = await this.supabaseClient
			.from('ImportJobs')
			.update(changes)
			.eq('id', importJobId);
		if (error) throw error;
	}

	/**
	 * Opens a job row for `ringingGroupId` and returns its id, for every later
	 * transition to key on. `status`, `started_at` and the five per-temporal-unit
	 * refresh-status columns are written explicitly even though the table defaults
	 * all seven to the same values, so the opening state of a run is readable at the call site
	 * (and assertable) rather than implied by the schema. `started_at` has to be
	 * client-side anyway to stay consistent with `finished_at`, which no trigger
	 * sets.
	 */
	async createImportJob(ringingGroupId: number): Promise<number> {
		const { data, error } = await this.supabaseClient
			.from('ImportJobs')
			.insert<ImportJobsInsert>({
				ringing_group_id: ringingGroupId,
				status: 'in_progress',
				started_at: new Date().toISOString(),
				day_stats_refresh_status: 'in_progress',
				month_stats_refresh_status: 'in_progress',
				year_stats_refresh_status: 'in_progress',
				month_squashed_stats_refresh_status: 'in_progress',
				all_time_stats_refresh_status: 'in_progress'
			})
			.select('id')
			.single();

		if (error) throw error;
		if (!data) throw new Error('Insert into ImportJobs returned no data');
		return data.id;
	}

	/**
	 * Records the distinct dates present in the imported batch. Written mid-run —
	 * once the staging rows exist but before domain-table import begins (#959) —
	 * so this is its own operation rather than part of any terminal transition,
	 * and it leaves `status` and the refresh-status columns alone. Deduplicated
	 * and sorted here so the caller can pass a per-row date straight through.
	 */
	async recordAffectedDates(
		importJobId: number,
		affectedDates: string[]
	): Promise<void> {
		await this.updateImportJob(importJobId, {
			affected_dates: [...new Set(affectedDates)].sort()
		});
	}

	/** Terminal: every row was processed and the run finished normally. */
	async completeImportJob(
		importJobId: number,
		{ processed, successful, failed }: ImportJobRowCounts
	): Promise<void> {
		await this.updateImportJob(importJobId, {
			status: 'succeeded',
			finished_at: new Date().toISOString(),
			rows_processed: processed,
			rows_successful: successful,
			rows_failed: failed
		});
	}

	/**
	 * Terminal: the run threw. Row counts are deliberately not recorded — an
	 * unhandled error leaves them unknown rather than merely incomplete.
	 */
	async failImportJob(
		importJobId: number,
		errorMessage: string
	): Promise<void> {
		await this.updateImportJob(importJobId, {
			status: 'failed',
			finished_at: new Date().toISOString(),
			error_message: errorMessage
		});
	}

	/**
	 * Terminal: the web route's 280s abort fired. Records exactly the partial
	 * progress the route already reports to the browser in its
	 * `ImportTimeoutMessage`, which until now was the only place it went.
	 */
	async markImportJobTimedOut(
		importJobId: number,
		partialProgress: {
			processed: number;
			startDate: string | null;
			endDate: string | null;
		}
	): Promise<void> {
		await this.updateImportJob(importJobId, {
			status: 'timed_out',
			finished_at: new Date().toISOString(),
			rows_processed: partialProgress.processed,
			start_date: partialProgress.startDate,
			end_date: partialProgress.endDate
		});
	}

	/**
	 * Records how one temporal unit's stats-cache refresh went, on that temporal
	 * unit's own column and nothing else. The caller is whatever runs the
	 * refresh — the queue consumer that calls `refreshSimpleStatsCache` per
	 * dispatched temporal-unit event
	 * (`app/api/queues/stats-cache-refresh-window/route.ts`, #1155); this only
	 * provides somewhere to record the outcome.
	 */
	async markStatsCacheRefreshed(
		importJobId: number,
		temporalUnit: StatsTemporalUnit,
		refreshOutcome: StatsCacheRefreshOutcome
	): Promise<void> {
		await this.updateImportJob(importJobId, {
			[STATS_CACHE_REFRESH_STATUS_COLUMNS[temporalUnit]]: refreshOutcome
		});
	}
}

/**
 * Rows per `DemonRecords` insert. Big enough that a typical import is a handful
 * of multi-row inserts rather than one per row, small enough that a row doesn't
 * wait on hundreds of unrelated rows before its own domain-table write can start
 * (every row in a batch is unblocked together, when that batch lands).
 */
export const DEFAULT_DEMON_RECORDS_BATCH_SIZE = 100;

/**
 * `demon_records_group_ring_date_time_unique` (#960) — re-importing an
 * overlapping CSV targets the same staging row rather than duplicating it.
 */
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
 * The staging row for one CSV row, or `null` when the row can't be staged at
 * all.
 *
 * `ring_no`/`encounter_date`/`encounter_time` are `NOT NULL` on `DemonRecords`
 * and are its dedup key, so a row missing any of them has no representable
 * staging row — most commonly a casualty record, which carries no ring number
 * (blank, or DemOn's `'-'` sentinel) and which `EncounterRowBatchWriter` rejects
 * outright anyway. Such a row is skipped here rather than failing its whole
 * batch, and goes on to fail (or not) in exactly the way it did before this
 * staging step existed.
 *
 * `raw_row` is the untransformed row: the point of the table is a non-lossy
 * copy of what was submitted, so the empty-string-to-null normalisation the
 * domain-table write applies is deliberately not applied to it.
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
 * the row is interpreted into Species/Birds/Sessions/Encounters.
 *
 * A class rather than a `create*` closure factory like `createRingSequenceLookup`,
 * because
 * this is three operations over one piece of mutable state rather than a single
 * operation over a captured client: the shared buffer is the whole mechanism —
 * `writeDemonRecord` appends and hands back a promise, `flushRemaining` drains
 * what's left, `getDistinctDates` reports what landed. One instance per import
 * run, same as `ImportJobTracker`.
 *
 * Batching is interleaved with row processing rather than a phase of its own, so
 * the import keeps the per-row concurrency it relies on: a row's own promise
 * resolves as soon as *its* batch lands, not once the whole run is staged. The
 * ordering guarantee is per row, not per run — rows in an earlier batch may well
 * be writing to the domain tables while a later batch is still in flight.
 *
 * Note the cooperation this requires from the caller, and why
 * `writeDemonRecord` must not be inside the run's rate limiter: a batch only
 * fills if every row can reach `writeDemonRecord` promptly. Throttle that and a
 * batch larger than the concurrency cap can never fill — the rows that would
 * complete it are queued behind the rows already blocked on it.
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

		// Resolved/rejected rather than thrown: this promise is what
		// `flushRemaining` awaits, and the failure belongs to the rows of this
		// batch, which each surface it through their own promise.
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

/**
 * One CSV row, end to end: staged into `DemonRecords` first, and only then — once
 * that row's batch has actually landed — interpreted into the domain tables.
 *
 * Splitting it this way is the point of #959: whatever happens to a row's
 * domain-table write, a record of what was submitted for it already exists. A
 * row whose staging batch failed therefore never reaches
 * `encounterRowBatchWriter` at all.
 *
 * Both writers are built once per run by the caller. Neither this function nor
 * the staging writer knows anything about the run's concurrency cap: since #1139
 * that lives inside `EncounterRowBatchWriter`, around a whole chunk flush, and
 * never around the staging write above it (see `DemonRecordsBatchWriter`).
 */
export async function processEncounterRow(
	rawRow: DemonRow,
	demonRecordsBatchWriter: DemonRecordsBatchWriter,
	encounterRowBatchWriter: EncounterRowBatchWriter
): Promise<{ visitDate: string }> {
	await demonRecordsBatchWriter.writeDemonRecord(rawRow);
	return encounterRowBatchWriter.writeEncounterRow(rawRow);
}

/**
 * Rows per chunk of domain-table writes (#1139).
 *
 * Deliberately the same size as a `DemonRecords` staging batch: a row only
 * reaches this writer once *its* staging batch has landed, so rows arrive in
 * staging-batch-sized waves. An equal chunk size means one wave fills exactly
 * one chunk — no row waits on a later wave before its chunk can flush, and no
 * chunk is cut short by a wave boundary.
 */
export const DEFAULT_ENCOUNTER_ROW_CHUNK_SIZE =
	DEFAULT_DEMON_RECORDS_BATCH_SIZE;

type BufferedEncounterRow = {
	/** Empty-string-normalised, which is what every insert builder below expects. */
	row: DemonRow;
	/** Position in the run, for the chunk-failure log only. */
	rowIndex: number;
	resolve: (result: { visitDate: string }) => void;
	reject: (reason: unknown) => void;
};

/** The id one chunk position's entity of a given type landed on. */
type ChunkEntityIdResolver = (chunkIndex: number) => number;

/**
 * A natural-key tuple flattened into something a `Map` can key on. JSON rather
 * than a joined string so no separator can collide with a value containing it.
 */
function naturalKeyOf(keyValues: unknown[]): string {
	return JSON.stringify(keyValues);
}

/**
 * Follows `encounters_bird_id_location_id_visit_date_unique`, repointed off
 * (bird_id, session_id) in #1024. A session_id key would now mean "one encounter
 * per bird per group per day", silently merging a bird caught at two sites on one
 * day; (bird_id, location_id, visit_date) is what (bird_id, session_id) actually
 * meant while a Session was (date, location, type), so re-importing the same row
 * still updates in place rather than inserting a duplicate.
 */
const ENCOUNTERS_CONFLICT_COLUMNS = [
	'bird_id',
	'location_id',
	'visit_date'
] as (keyof EncountersInsert & string)[];

/**
 * One Session per group per date (#1024). It used to be one per
 * (visit_date, location_id, session_type), where session_type bucketed the row as
 * FULL_GROWN / PULLI / FIELD_OBSERVATION from its own record_type and age — so a
 * group visiting two sites on one day, or ringing both nestlings and full-grown
 * birds at one site, produced several Session rows for the same day. All three of
 * those axes now live on the Encounters rows themselves (location_id/visit_date
 * per #1015, record_type/age_code/is_juv as always), and every read path derives
 * what it needs from there, so a Session is just the group-day the encounters
 * hang off.
 */
const SESSIONS_CONFLICT_COLUMNS = [
	'visit_date',
	'ringing_group_id'
] as (keyof SessionsInsert & string)[];

/**
 * `Encounters.capture_time` is a `time without time zone`, so Postgres stores
 * `'08:30'` and hands it back as `'08:30:00'`. Both forms used to be
 * interchangeable, because the only `capture_time`s this module ever compared
 * came from one CSV and were therefore formatted alike. Since #1219 the
 * reconciliation pass also compares a CSV row's `capture_time` against one read
 * back out of Postgres — to order a merge, and to tell a genuine duplicate from
 * a re-import of the same record — and `'08:30' < '08:30:00'` as strings, so
 * the two have to be written in one canonical form.
 *
 * Anything that doesn't parse is passed through untouched, exactly as before:
 * Postgres accepts several other time literals, and rejecting one here would
 * fail a row the importer used to accept.
 */
const CAPTURE_TIME_PATTERN = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;

export function normaliseCaptureTime(rawCaptureTime: string): string {
	const match = CAPTURE_TIME_PATTERN.exec(rawCaptureTime.trim());
	if (!match) return rawCaptureTime;
	const [, hours, minutes, seconds = '00'] = match;
	return `${hours.padStart(2, '0')}:${minutes}:${seconds}`;
}

function buildEncounterInsert(
	row: DemonRow,
	{
		birdId,
		sessionId,
		locationId,
		visitDate
	}: {
		birdId: number;
		sessionId: number;
		locationId: number;
		visitDate: string;
	}
): EncountersInsert {
	return {
		age_code: Number(String(row.age).replace('J', '')),
		breeding_condition: row.breeding_condition as string | null,
		capture_time: normaliseCaptureTime(row.capture_time as string),
		extra_text: row.extra_text as string | null,
		fat: row.fat as string | null,
		finding_condition: row.finding_condition as string | null,
		finding_circumstances: row.finding_circumstances as string | null,
		is_juv: String(row.age).endsWith('J'),
		moult_code: row.moult_code as string | null,
		old_greater_coverts: row.old_greater_coverts
			? Number(row.old_greater_coverts)
			: null,
		pectoral_muscle: row.pectoral_muscle ? Number(row.pectoral_muscle) : null,
		primary_moult: row.primary_moult as string | null,
		record_type: row.record_type as string,
		bird_id: birdId,
		session_id: sessionId,
		// Every encounter carries its own location/date, independent of the
		// Session it is linked to (#1015) — and since #1024 collapsed Sessions to
		// one row per group-day, these are the only place the per-encounter
		// location survives.
		location_id: locationId,
		visit_date: visitDate,
		scheme: row.scheme as string,
		sex: row.sex as string,
		capture_method: row.capture_method as string | null,
		sexing_method: row.sexing_method as string | null,
		weight: row.weight ? Number(row.weight) : null,
		wing_length: row.wing_length ? Number(row.wing_length) : null
	};
}

/**
 * Folds two Encounters rows that collide on
 * `encounters_bird_id_location_id_visit_date_unique` into the single row that
 * should be stored for them (#1219) — a group occasionally records the same
 * bird twice on one group-day at one site, a slip of the pen or a bird logged
 * at the start and the end of a round.
 *
 * One uniform rule: **order the two rows by `capture_time` ascending and take
 * the first non-null value, per column**. The chronologically first record
 * therefore keeps every field it actually recorded — `capture_time` and
 * `record_type` included, both `NOT NULL`, so for those "first non-null" is
 * simply "the earliest row's value" — and any field it left blank is filled in
 * from the later duplicate. Ties on `capture_time` keep `earlierRow`, the one
 * that appeared earlier in the import.
 *
 * Keying the precedence on `capture_time` rather than on arrival order is what
 * makes the rule commutative and associative: a set of duplicates folded
 * pairwise gives the same row whatever order they are folded in, so the result
 * doesn't depend on which chunk happened to reach Postgres first.
 *
 * The conflict-key columns (`bird_id`, `location_id`, `visit_date`) are equal
 * across a duplicate set by definition, and since #1024 collapsed Sessions to
 * one row per group-day `session_id` is equal too, so none of them needs a rule
 * of its own.
 */
export function mergeDuplicateEncounters(
	earlierRow: EncountersInsert,
	laterRow: EncountersInsert
): EncountersInsert {
	const [first, second] =
		laterRow.capture_time < earlierRow.capture_time
			? [laterRow, earlierRow]
			: [earlierRow, laterRow];

	const merged: EncountersInsert = { ...second };
	for (const column of Object.keys(first) as (keyof EncountersInsert)[]) {
		const value = first[column];
		if (value !== null && value !== undefined)
			(merged as Record<string, unknown>)[column] = value;
	}
	return merged;
}

/**
 * What `EncounterRowBatchWriter` accumulates for one Encounters natural key
 * over a whole run, so `reconcileDuplicateEncounters` can rewrite the key once
 * at the end (#1219).
 */
type RunEncounterAccumulation = {
	/** Every contributing row folded together under `mergeDuplicateEncounters`. */
	merged: EncountersInsert;
	/**
	 * The `capture_time`s this run's own CSV rows carried for the key — never a
	 * stored row's. A stored row whose `capture_time` is in here is the same
	 * physical capture event as one of the run's rows, re-imported, so it must
	 * *not* be folded in: the CSV is the newer version of it and a correction
	 * (including a cleared field) has to be allowed to overwrite what's stored.
	 */
	captureTimesWrittenByRun: Set<string>;
	/**
	 * Whether more than one distinct row has contributed, i.e. whether the row
	 * the chunk upserts left behind can differ from `merged`. False for the
	 * overwhelming majority of keys, which one CSV row wrote once.
	 */
	needsRewrite: boolean;
};

/**
 * Interprets CSV rows into the domain tables — Species, Birds, Locations,
 * Sessions, Encounters — a chunk at a time (#1139), rather than five sequential
 * single-row upserts per row.
 *
 * Buffer-then-flush, same shape as `DemonRecordsBatchWriter`: `writeEncounterRow`
 * appends a row and hands back a promise that settles when the chunk containing
 * it has been written, and `flushRemaining` drains the trailing partial chunk.
 * One instance per import run.
 *
 * Within a chunk each entity type is written by exactly one multi-row upsert, in
 * FK dependency order (Species before Birds, Birds/Locations/Sessions before
 * Encounters), with each later upsert's payload carrying the ids the earlier ones
 * resolved. So a chunk of 100 rows costs 5 round trips for these tables instead
 * of 500.
 *
 * Three things the chunking forces, all of which are correctness requirements
 * rather than optimisations:
 *
 * - **Dedup per entity type.** Postgres rejects a multi-row `ON CONFLICT DO
 *   UPDATE` that targets the same conflict key twice ("command cannot affect row
 *   a second time"), and a chunk routinely holds several rows sharing a species,
 *   a location or a date. Each entity type is therefore reduced to one insert per
 *   distinct natural key before its upsert.
 * - **Id resolution by natural key.** A multi-row upsert's returned row order
 *   isn't guaranteed to match the request, so ids are mapped back by the
 *   natural-key columns selected alongside `id`, never by array position.
 * - **Chunk-level failure.** A failed bulk upsert fails every row buffered in
 *   that chunk, matching `DemonRecordsBatchWriter`'s per-batch precedent (#959).
 *   This is a deliberate coarsening of the strictly-per-row failure isolation the
 *   five sequential upserts used to give.
 */
export class EncounterRowBatchWriter {
	private readonly ringingGroupId: number;
	private readonly importJobId: number | undefined;
	private readonly chunkSize: number;
	private readonly lookupRingSequence: ReturnType<
		typeof createRingSequenceLookup
	>;
	private readonly linkRingSequence: ReturnType<
		typeof createRingSequenceLinker
	>;
	private readonly limitChunkFlush: (
		flushChunk: () => Promise<void>
	) => Promise<void>;

	private buffer: BufferedEncounterRow[] = [];
	private rowsBuffered = 0;
	// Chunk flushes run concurrently, governed by `limitChunkFlush` — unlike
	// `DemonRecordsBatchWriter`'s strictly chained batches. That is what keeps the
	// callers' concurrency option meaningful: at `concurrency: 1` the flushes
	// serialize in fill order, which is what `seed-e2e-data.ts`'s deterministic
	// id assignment (#903) depends on, and above 1 they overlap exactly as the
	// per-row domain writes used to.
	private readonly chunkWrites: Promise<void>[] = [];
	// The distinct `Species.id`s actually written by a landed chunk — used to
	// narrow the species-grouped stats-cache refresh (`dispatchStatsCacheRefreshEvents`)
	// to the species an import actually touched, rather than every species the
	// group has ever recorded. A row whose chunk fails, or that never reaches
	// `writeChunk` at all (e.g. a ringless casualty), correctly never contributes.
	private readonly touchedSpeciesIds = new Set<number>();
	// What the run knows about each Encounters natural key it has written to,
	// keyed by `naturalKeyOf(ENCOUNTERS_CONFLICT_COLUMNS)`. Only the keys flagged
	// `needsRewrite` are rewritten by `reconcileDuplicateEncounters` — every
	// other key's stored row is already the single row that belongs there.
	private readonly encounterAccumulationByKey = new Map<
		string,
		RunEncounterAccumulation
	>();

	constructor(
		private readonly supabaseClient: SupabaseClient,
		{
			ringingGroupId,
			lookupRingSequence,
			linkRingSequence,
			importJobId,
			chunkSize = DEFAULT_ENCOUNTER_ROW_CHUNK_SIZE,
			limitChunkFlush = (flushChunk) => flushChunk()
		}: {
			ringingGroupId: number;
			lookupRingSequence: ReturnType<typeof createRingSequenceLookup>;
			linkRingSequence: ReturnType<typeof createRingSequenceLinker>;
			/** The run's `ImportJobs` row, for the chunk-failure log only. */
			importJobId?: number;
			chunkSize?: number;
			/**
			 * Wraps each chunk flush, and is where the run's concurrency cap lives.
			 * Before #1139 the callers' rate limiter capped concurrent *per-row*
			 * domain writes; it now caps concurrent *chunk flushes*, each of which
			 * issues one request at a time (see `linkRingSequencesForChunk`), so it
			 * still caps in-flight requests at roughly the same number.
			 *
			 * It must never wrap `writeEncounterRow` itself, for the same reason the
			 * staging write must stay unthrottled (see `DemonRecordsBatchWriter`): a
			 * chunk only fills if every row can reach the buffer promptly.
			 */
			limitChunkFlush?: (flushChunk: () => Promise<void>) => Promise<void>;
		}
	) {
		this.ringingGroupId = ringingGroupId;
		this.lookupRingSequence = lookupRingSequence;
		this.linkRingSequence = linkRingSequence;
		this.importJobId = importJobId;
		this.chunkSize = chunkSize;
		this.limitChunkFlush = limitChunkFlush;
	}

	/**
	 * One entity type's write for a chunk: reduce the chunk to one insert per
	 * distinct natural key, upsert them all in a single multi-row call, and hand
	 * back a resolver from chunk position to the id that row's entity landed on.
	 *
	 * Deduplication keeps the **last** occurrence's payload at the **first**
	 * occurrence's position, which is what the old row-by-row upserts did: a later
	 * row targeting an earlier row's key updated it in place, so last-write-wins,
	 * while the row order ids were handed out in stayed the CSV's.
	 */
	private async upsertChunkEntities<Insert extends Record<string, unknown>>(
		tableName: string,
		uniqueColumns: (keyof Insert & string)[],
		chunk: BufferedEncounterRow[],
		buildInsert: (
			bufferedRow: BufferedEncounterRow,
			chunkIndex: number
		) => Insert
	): Promise<ChunkEntityIdResolver> {
		const insertPerChunkIndex = chunk.map(buildInsert);
		const keyPerChunkIndex = insertPerChunkIndex.map((insert) =>
			naturalKeyOf(uniqueColumns.map((column) => insert[column]))
		);
		const insertsByKey = new Map<string, Insert>();
		keyPerChunkIndex.forEach((key, chunkIndex) => {
			insertsByKey.set(key, insertPerChunkIndex[chunkIndex]);
		});

		const idsByKey = await this.bulkUpsert(
			tableName,
			uniqueColumns,
			insertsByKey
		);

		return (chunkIndex: number) => {
			const id = idsByKey.get(keyPerChunkIndex[chunkIndex]);
			if (id === undefined)
				throw new Error(
					`Upsert to ${tableName} returned no id for ${keyPerChunkIndex[chunkIndex]}`
				);
			return id;
		};
	}

	/**
	 * The multi-row upsert itself. Same options as the per-row upserter this
	 * replaced (`onConflict` + `ignoreDuplicates: false`), applied to an array, and
	 * selecting the natural-key columns alongside `id` so the returned rows can be
	 * matched back to what was sent.
	 *
	 * Inserts are ordered by natural key rather than by first appearance, so every
	 * concurrent chunk flush locks the rows it conflicts with in the same order and
	 * two overlapping chunks can't deadlock against each other. It stays
	 * deterministic, which is what `concurrency: 1` seeding needs.
	 */
	private async bulkUpsert<Insert extends Record<string, unknown>>(
		tableName: string,
		uniqueColumns: (keyof Insert & string)[],
		insertsByKey: Map<string, Insert>
	): Promise<Map<string, number>> {
		if (insertsByKey.size === 0) return new Map();

		const sortedInserts = [...insertsByKey.entries()]
			.sort(([keyA], [keyB]) => (keyA < keyB ? -1 : keyA > keyB ? 1 : 0))
			.map(([, insert]) => insert);

		const { data, error } = await this.supabaseClient
			.from(tableName)
			.upsert(sortedInserts, {
				onConflict: uniqueColumns.join(','),
				ignoreDuplicates: false
			})
			// The column list is built at runtime, so PostgREST can't infer a row
			// shape from it (it falls back to `GenericStringError`) — the second type
			// argument says what the selected `id` + natural-key columns actually are.
			.select<string, Record<string, unknown>>(
				['id', ...uniqueColumns].join(',')
			);

		if (error) throw error;
		if (!data) throw new Error(`Upsert to ${tableName} returned no data`);

		const idsByKey = new Map<string, number>();
		for (const row of data) {
			const upsertedRow: Record<string, unknown> = row;
			idsByKey.set(
				naturalKeyOf(uniqueColumns.map((column) => upsertedRow[column])),
				upsertedRow.id as number
			);
		}
		return idsByKey;
	}

	/**
	 * The per-row `RingSequences` work, deliberately left un-batched by #1139: the
	 * lookup is a numeric-range match (`prefix` + a `first_index`/`last_index`
	 * window) rather than a keyed upsert, so batching it is a separate problem.
	 *
	 * Only a 'N' (new ring) record assigns a ring to this group for the first time,
	 * so it's the only record_type that looks one up. Any other record_type — and
	 * any 'N' ring with no matching sequence — leaves the bird unlinked for this
	 * group. The link goes through the per-group `RingSequences_Birds` join table
	 * (#703) rather than a group-agnostic FK on the Bird.
	 *
	 * Run one row at a time so a chunk flush still only ever has a single request
	 * in flight, which is what keeps `limitChunkFlush`'s cap a cap on concurrent
	 * requests and not merely on concurrent chunks.
	 */
	private async linkRingSequencesForChunk(
		chunk: BufferedEncounterRow[],
		birdIdOf: ChunkEntityIdResolver
	): Promise<void> {
		for (const [chunkIndex, { row }] of chunk.entries()) {
			if (row.record_type !== 'N') continue;
			const ringSequenceId = await this.lookupRingSequence(
				row.ring_no as string,
				this.ringingGroupId
			);
			if (ringSequenceId === null) continue;
			await this.linkRingSequence(
				birdIdOf(chunkIndex),
				ringSequenceId,
				this.ringingGroupId
			);
		}
	}

	private async writeChunk(chunk: BufferedEncounterRow[]): Promise<void> {
		const speciesIdOf = await this.upsertChunkEntities<SpeciesInsert>(
			'Species',
			['species_name'],
			chunk,
			({ row }) => ({ species_name: row.species_name as string })
		);

		const birdIdOf = await this.upsertChunkEntities<BirdsInsert>(
			'Birds',
			['ring_no'],
			chunk,
			({ row }, chunkIndex) => ({
				ring_no: row.ring_no as string,
				species_id: speciesIdOf(chunkIndex)
			})
		);

		await this.linkRingSequencesForChunk(chunk, birdIdOf);

		const locationIdOf = await this.upsertChunkEntities<LocationsInsert>(
			'Locations',
			['location_name', 'ringing_group_id'],
			chunk,
			({ row }) => ({
				location_name: row.loc_id as string,
				ringing_group_id: this.ringingGroupId
			})
		);

		// ringing_group_id is written explicitly: it used to be derived by the
		// trg_set_session_generated_fields trigger via a Locations lookup on
		// Sessions.location_id, and #1024 retired that trigger along with the column
		// it looked up.
		const sessionIdOf = await this.upsertChunkEntities<SessionsInsert>(
			'Sessions',
			SESSIONS_CONFLICT_COLUMNS,
			chunk,
			({ row }) => ({
				visit_date: convertDateFormat(row.visit_date as string),
				ringing_group_id: this.ringingGroupId
			})
		);

		// Built up front rather than inside `upsertChunkEntities`' callback so the
		// same array can be registered for the run's duplicate reconciliation
		// below: `upsertChunkEntities` reduces a chunk's same-key rows to the last
		// occurrence's payload, which would otherwise hide one half of a
		// same-chunk duplicate pair from that pass entirely.
		const encounterInserts = chunk.map(({ row }, chunkIndex) =>
			buildEncounterInsert(row, {
				birdId: birdIdOf(chunkIndex),
				sessionId: sessionIdOf(chunkIndex),
				locationId: locationIdOf(chunkIndex),
				visitDate: convertDateFormat(row.visit_date as string)
			})
		);

		// Read before the upsert below overwrites them — that is the only moment a
		// row an earlier import left behind is still visible.
		const storedEncounters = await this.readStoredEncounters(encounterInserts);

		await this.upsertChunkEntities<EncountersInsert>(
			'Encounters',
			ENCOUNTERS_CONFLICT_COLUMNS,
			chunk,
			(_bufferedRow, chunkIndex) => encounterInserts[chunkIndex]
		);

		this.registerEncountersForReconciliation(
			encounterInserts,
			storedEncounters
		);

		for (const [chunkIndex, bufferedRow] of chunk.entries()) {
			this.touchedSpeciesIds.add(speciesIdOf(chunkIndex));
			bufferedRow.resolve({
				visitDate: convertDateFormat(bufferedRow.row.visit_date as string)
			});
		}
	}

	/**
	 * The Encounters rows already stored for the natural keys a chunk is about
	 * to write to — the other half of a duplicate pair split across two import
	 * runs (#1219), e.g. a day's ringing uploaded as two CSVs with the same bird
	 * caught at two times in different halves.
	 *
	 * PostgREST has no way to filter on a list of composite keys, so this asks
	 * for the superset `bird_id IN … AND location_id IN … AND visit_date IN …`
	 * and lets `registerEncountersForReconciliation` drop the rows that don't
	 * land on a key of this chunk. A chunk is a contiguous run of one group's
	 * CSV, so its location/date lists are tiny and `idx_encounters_bird_id`
	 * makes the bird list the selective one — the over-fetch is "these birds'
	 * encounters on these few dates", not a cross product of anything large.
	 *
	 * A failure is logged and swallowed rather than thrown: the chunk's own rows
	 * are written either way, and losing the read costs only the cross-run half
	 * of a merge. This read is on every chunk's path, so it must not be able to
	 * fail an import that would otherwise have succeeded.
	 */
	private async readStoredEncounters(
		encounterInserts: EncountersInsert[]
	): Promise<EncountersInsert[]> {
		if (encounterInserts.length === 0) return [];

		const distinct = <Value>(values: Value[]) => [...new Set(values)];
		try {
			const { data, error } = await this.supabaseClient
				.from('Encounters')
				.select<string, EncountersInsert>(
					Object.keys(encounterInserts[0]).join(',')
				)
				.eq('ringing_group_id', this.ringingGroupId)
				.in('bird_id', distinct(encounterInserts.map(({ bird_id }) => bird_id)))
				.in(
					'location_id',
					distinct(encounterInserts.map(({ location_id }) => location_id))
				)
				.in(
					'visit_date',
					distinct(encounterInserts.map(({ visit_date }) => visit_date))
				);

			if (error) throw error;
			return data ?? [];
		} catch (error) {
			console.error(
				'Failed to read stored Encounters rows for duplicate reconciliation; duplicates spanning two import runs will not be merged',
				{
					importJobId: this.importJobId,
					ringingGroupId: this.ringingGroupId,
					chunkRowCount: encounterInserts.length
				},
				error
			);
			return [];
		}
	}

	/**
	 * Folds a landed chunk's Encounters rows — and whatever was stored for their
	 * keys before the chunk overwrote it — into the run's per-natural-key
	 * accumulator, flagging any key more than one distinct row has contributed
	 * to (#1219).
	 *
	 * Called only once the chunk's upsert has returned, so a chunk that failed —
	 * none of whose rows were imported — can never make the wrap-up pass write a
	 * row on its behalf, the same way it never contributes a `touchedSpeciesId`.
	 * The run's own rows are folded before the stored ones so that a stored row
	 * that is merely this chunk's own record re-imported is recognised as such.
	 */
	private registerEncountersForReconciliation(
		encounterInserts: EncountersInsert[],
		storedEncounters: EncountersInsert[]
	): void {
		for (const encounterInsert of encounterInserts)
			this.foldIntoRunAccumulation(encounterInsert, { writtenByRun: true });
		for (const storedEncounter of storedEncounters)
			this.foldIntoRunAccumulation(storedEncounter, { writtenByRun: false });
	}

	private foldIntoRunAccumulation(
		encounterRow: EncountersInsert,
		{ writtenByRun }: { writtenByRun: boolean }
	): void {
		const naturalKey = naturalKeyOf(
			ENCOUNTERS_CONFLICT_COLUMNS.map((column) => encounterRow[column])
		);
		const accumulation = this.encounterAccumulationByKey.get(naturalKey);

		if (!accumulation) {
			// A stored row on a key no row of this run wrote to is over-fetch from
			// `readStoredEncounters`' superset filter — not this chunk's business.
			if (!writtenByRun) return;
			this.encounterAccumulationByKey.set(naturalKey, {
				merged: encounterRow,
				captureTimesWrittenByRun: new Set([encounterRow.capture_time]),
				needsRewrite: false
			});
			return;
		}

		if (writtenByRun)
			accumulation.captureTimesWrittenByRun.add(encounterRow.capture_time);
		// The stored row is the same capture event as one of the run's own rows,
		// imported before: this CSV is the newer version of it, so leave the chunk
		// upsert's overwrite alone rather than merging the superseded values back in.
		else if (
			accumulation.captureTimesWrittenByRun.has(encounterRow.capture_time)
		)
			return;

		accumulation.merged = mergeDuplicateEncounters(
			accumulation.merged,
			encounterRow
		);
		accumulation.needsRewrite = true;
	}

	/**
	 * The run's wrap-up pass (#1219): one multi-row upsert that replaces each
	 * Encounters row more than one distinct record landed on with the merge of
	 * every record that did — the run's own CSV rows, and any row an earlier
	 * import had already stored for the same key. Keys one record wrote to are
	 * left alone, so a typical import issues no extra write at all.
	 *
	 * This is why the merge rule can live in plain TypeScript rather than in a
	 * custom `ON CONFLICT DO UPDATE` inside Postgres. Chunk flushes race each
	 * other (`concurrency: 30` on the web route), so *during* the run the stored
	 * row for a duplicated key is simply whichever chunk landed last — but this
	 * runs once, after `flushRemaining` has awaited every chunk, so there is no
	 * concurrent writer left to lose an update to and no need for the merge to be
	 * atomic with the insert.
	 *
	 * Duplicates are detected from the Encounters rows themselves — what this run
	 * wrote, plus what `readStoredEncounters` found already stored for the same
	 * key — rather than by re-reading `DemonRecords`. Staging is keyed on
	 * `(ringing_group_id, ring_no, encounter_date, encounter_time)`, which omits
	 * the location that `encounters_bird_id_location_id_visit_date_unique`
	 * includes, so a staging query would have to re-resolve
	 * `bird_id`/`location_id`/`session_id` out of `raw_row` just to tell a real
	 * collision from a bird legitimately caught at two sites in one day. The
	 * Encounters rows are already keyed on exactly the constraint being
	 * reconciled.
	 *
	 * A failure here is logged and swallowed rather than thrown: every row of the
	 * import has already been written, and the worst case is that a duplicated
	 * key keeps the last-write-wins row it would have had anyway. Failing the
	 * whole import job over it would misreport a run that did import everything —
	 * the same reasoning `dispatchStatsCacheRefreshEvents` applies to its own
	 * recoverable derived step.
	 *
	 * Only the keys this run wrote to are reconciled, so a duplicate pair that
	 * predates the run entirely stays as it is until one of its rows is
	 * re-imported.
	 */
	private async reconcileDuplicateEncounters(): Promise<void> {
		const mergedEncountersByKey = new Map(
			[...this.encounterAccumulationByKey]
				.filter(([, { needsRewrite }]) => needsRewrite)
				.map(([naturalKey, { merged }]) => [naturalKey, merged])
		);
		if (mergedEncountersByKey.size === 0) return;

		try {
			await this.bulkUpsert(
				'Encounters',
				ENCOUNTERS_CONFLICT_COLUMNS,
				mergedEncountersByKey
			);
		} catch (error) {
			console.error(
				'Failed to reconcile duplicate Encounters rows; each keeps whichever of its duplicates was written last',
				{
					importJobId: this.importJobId,
					ringingGroupId: this.ringingGroupId,
					duplicateKeyCount: mergedEncountersByKey.size
				},
				error
			);
		}
	}

	/**
	 * Rejected rather than thrown: the failure belongs to this chunk's rows, which
	 * each surface it through their own promise, and `flushRemaining` must not blow
	 * up because one chunk did.
	 */
	private failChunk(chunk: BufferedEncounterRow[], error: unknown): void {
		console.error(
			'Failed to write a domain-table chunk; none of its rows were imported',
			{
				importJobId: this.importJobId,
				ringingGroupId: this.ringingGroupId,
				rowCount: chunk.length,
				rowIndices: chunk.map(({ rowIndex }) => rowIndex)
			},
			error
		);
		for (const bufferedRow of chunk) bufferedRow.reject(error);
	}

	private flushBufferedChunk(): void {
		if (this.buffer.length === 0) return;
		const chunk = this.buffer;
		this.buffer = [];
		this.chunkWrites.push(
			(async () => {
				try {
					await this.limitChunkFlush(() => this.writeChunk(chunk));
				} catch (error) {
					this.failChunk(chunk, error);
				}
			})()
		);
	}

	/**
	 * Buffers `rawRow` for the next chunk of domain-table writes and resolves once
	 * the whole chunk containing it has been written — not when it was buffered.
	 *
	 * A casualty record carries no ring number — blank, or DemOn's `'-'` sentinel —
	 * so it has no representable Bird and is filtered out before it can reach a
	 * chunk (where a `'-'`-ringed row would otherwise collide with every other
	 * `'-'`-ringed row in the CSV on `Birds`' unique `ring_no`, tripping the
	 * species-immutability trigger and failing the whole chunk). It rejects
	 * straight away with the same `CasualtyEncounterError` the per-row writer
	 * always threw, which both entry points already distinguish from a genuine
	 * failure.
	 */
	writeEncounterRow(rawRow: DemonRow): Promise<{ visitDate: string }> {
		const row = transformEmptyStringsToNull(rawRow) as DemonRow;
		if (isRinglessRingNo(row.ring_no))
			return Promise.reject(new CasualtyEncounterError());

		const rowIndex = this.rowsBuffered++;
		// The executor runs synchronously, so the row is buffered before this
		// returns — which is what lets a whole chunk fill within one synchronous
		// dispatch pass over the rows released by a staging batch.
		const chunkWritten = new Promise<{ visitDate: string }>(
			(resolve, reject) => {
				this.buffer.push({ row, rowIndex, resolve, reject });
			}
		);
		if (this.buffer.length >= this.chunkSize) this.flushBufferedChunk();
		return chunkWritten;
	}

	/**
	 * Flushes the trailing partial chunk and waits for every chunk of the run to
	 * have been written. Call it once every row has been handed to
	 * `processEncounterRow` — in practice right after the staging writer's own
	 * `flushRemaining` — and before awaiting any row's promise.
	 *
	 * The caller can't simply await the rows first: a row's promise is what settles
	 * when its chunk lands, so awaiting them before flushing would deadlock on the
	 * trailing chunk. Hence the macrotask yield: the rows released by the final
	 * staging batch reach this buffer in microtasks queued by that batch landing,
	 * and the staging writer's `flushRemaining` can resume before the last of them
	 * has run. One macrotask boundary guarantees every such continuation has
	 * executed, so the buffer really does hold the run's trailing chunk.
	 */
	async flushRemaining(): Promise<void> {
		await new Promise((resolve) => setTimeout(resolve, 0));
		// Looped, so a row that arrived while an earlier chunk was still in flight
		// can't be left behind in the buffer.
		do {
			this.flushBufferedChunk();
			await Promise.all(this.chunkWrites);
		} while (this.buffer.length > 0);

		// Last, once every chunk of the run has landed and nothing else is still
		// writing to Encounters — that serialisation is what lets the merge be a
		// plain read-free rewrite rather than an atomic DB-side operation.
		await this.reconcileDuplicateEncounters();
	}

	/** The distinct `Species.id`s written by every chunk that has landed so far. */
	getDistinctSpeciesIds(): number[] {
		return [...this.touchedSpeciesIds].sort((a, b) => a - b);
	}
}
