import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase.types';
import type { ImportJobStatus, ResightingRecordType } from '@/app/models/db';

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
// same way `processEncounterRow` normalises the row it upserts a Location from
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
// per-row upsert in `processEncounterRow` keys Locations on
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

export function createUpserter(supabaseClient: SupabaseClient) {
	return async <DataInsertModel>(
		tableName: string,
		upsertData: DataInsertModel,
		uniqueColumns: (keyof DataInsertModel)[]
	): Promise<number> => {
		const { data: upsertResult, error: upsertError } = await supabaseClient
			.from(tableName)
			.upsert(upsertData, {
				onConflict: uniqueColumns.join(',') as string,
				ignoreDuplicates: false
			})
			.select('id')
			.single();

		if (upsertError) throw upsertError;
		if (!upsertResult)
			throw new Error(`Upsert to ${tableName} returned no data`);
		return upsertResult.id;
	};
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
 * The three row counts both import entry points already compute, under the one set
 * of names the `ImportJobs` columns use. The web route's `ImportCompleteMessage`
 * (`{processed, successful, failed}`) matches this shape as-is; the CLI script's
 * `ImportRowCounts` (`{totalRecords, successfulRecords, failedRecords}`) is the same
 * three numbers under different names and maps onto it at the call site.
 */
export type ImportJobRowCounts = {
	processed: number;
	successful: number;
	failed: number;
};

/** Which of the three stats caches a refresh outcome is being recorded for. */
export type StatsCacheType = 'core' | 'biometrics' | 'demographics';

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

const STATS_CACHE_REFRESH_STATUS_COLUMNS: Record<StatsCacheType, string> = {
	core: 'core_stats_refresh_status',
	biometrics: 'biometrics_stats_refresh_status',
	demographics: 'demographics_stats_refresh_status'
};

/**
 * Reads and writes the `ImportJobs` row tracking one import run.
 *
 * A class rather than the `create*` factory that `createUpserter`/
 * `createRingSequenceLookup`/`createRingSequenceLinker` above use: those each expose
 * one operation, whereas this exposes six variations on the same two-line
 * `.update(...).eq('id', …)` against the same table, which a class groups around the
 * shared `supabaseClient` and the shared `updateImportJob` plumbing without six
 * copies of either.
 *
 * Every operation is deliberately independent: recording one stats cache's refresh
 * outcome never touches `status`, `affected_dates` or the other two caches' columns,
 * and vice versa. That separation is the whole point of the table — "the rows all
 * imported but the biometrics cache never refreshed" has to stay visible rather than
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
	 * transition to key on. `status`, `started_at` and the three refresh-status
	 * columns are written explicitly even though the table defaults all five to
	 * the same values, so the opening state of a run is readable at the call site
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
				core_stats_refresh_status: 'in_progress',
				biometrics_stats_refresh_status: 'in_progress',
				demographics_stats_refresh_status: 'in_progress'
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
	 * Records how one stats cache's refresh went, on that cache's own column and
	 * nothing else. The caller is whatever runs the refreshes (#B2) — this ticket
	 * only provides somewhere to record the outcome.
	 */
	async markStatsCacheRefreshed(
		importJobId: number,
		statsCacheType: StatsCacheType,
		refreshOutcome: StatsCacheRefreshOutcome
	): Promise<void> {
		await this.updateImportJob(importJobId, {
			[STATS_CACHE_REFRESH_STATUS_COLUMNS[statsCacheType]]: refreshOutcome
		});
	}
}

export async function processEncounterRow(
	rawRow: DemonRow,
	upsert: ReturnType<typeof createUpserter>,
	lookupRingSequence: ReturnType<typeof createRingSequenceLookup>,
	ringingGroupId: number,
	linkRingSequence: ReturnType<typeof createRingSequenceLinker>
): Promise<{ visitDate: string }> {
	const row = transformEmptyStringsToNull(rawRow) as DemonRow;
	if (!row.ring_no) {
		throw new CasualtyEncounterError();
	}

	const speciesId = await upsert<SpeciesInsert>(
		'Species',
		{ species_name: row.species_name as string },
		['species_name']
	);

	// Only a 'N' (new ring) record assigns a ring to this group for the first
	// time, so it's the only record_type that looks up a matching RingSequences
	// row. Any other record_type — and any 'N' ring with no matching sequence
	// (lookup returns null) — leaves the bird unlinked for this group.
	let ringSequenceId: number | null = null;
	if (row.record_type === 'N') {
		ringSequenceId = await lookupRingSequence(
			row.ring_no as string,
			ringingGroupId
		);
	}

	const birdId = await upsert<BirdsInsert>(
		'Birds',
		{
			ring_no: row.ring_no as string,
			species_id: speciesId
		},
		['ring_no']
	);

	// Record this group's link to the matched sequence via the per-group join
	// table (issue #703) rather than a group-agnostic FK on the Bird.
	if (ringSequenceId !== null) {
		await linkRingSequence(birdId, ringSequenceId, ringingGroupId);
	}

	const locationId = await upsert<LocationsInsert>(
		'Locations',
		{ location_name: row.loc_id as string, ringing_group_id: ringingGroupId },
		['location_name', 'ringing_group_id']
	);

	const visitDate = convertDateFormat(row.visit_date as string);

	const age_code = Number(String(row.age).replace('J', ''));
	const is_juv = String(row.age).endsWith('J');

	// One Session per group per date (#1024). It used to be one per
	// (visit_date, location_id, session_type), where session_type bucketed the row
	// as FULL_GROWN / PULLI / FIELD_OBSERVATION from its own record_type and age —
	// so a group visiting two sites on one day, or ringing both nestlings and
	// full-grown birds at one site, produced several Session rows for the same day.
	// All three of those axes now live on the Encounters rows themselves
	// (location_id/visit_date per #1015, record_type/age_code/is_juv as always), and
	// every read path derives what it needs from there, so a Session is just the
	// group-day the encounters hang off.
	//
	// ringing_group_id is written explicitly: it used to be derived by the
	// trg_set_session_generated_fields trigger via a Locations lookup on
	// Sessions.location_id, and #1024 retires that trigger along with the column it
	// looked up.
	const sessionId = await upsert<SessionsInsert>(
		'Sessions',
		{
			visit_date: visitDate,
			ringing_group_id: ringingGroupId
		},
		['visit_date', 'ringing_group_id'] as (keyof SessionsInsert)[]
	);

	await upsert<EncountersInsert>(
		'Encounters',
		{
			age_code,
			breeding_condition: row.breeding_condition as string | null,
			capture_time: row.capture_time as string,
			extra_text: row.extra_text as string | null,
			fat: row.fat as string | null,
			finding_condition: row.finding_condition as string | null,
			finding_circumstances: row.finding_circumstances as string | null,
			is_juv,
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
		},
		// Follows encounters_bird_id_location_id_visit_date_unique, repointed off
		// (bird_id, session_id) in #1024. A session_id key would now mean "one
		// encounter per bird per group per day", silently merging a bird caught at
		// two sites on one day; (bird_id, location_id, visit_date) is what
		// (bird_id, session_id) actually meant while a Session was (date, location,
		// type), so re-importing the same row still updates in place rather than
		// inserting a duplicate.
		['bird_id', 'location_id', 'visit_date'] as (keyof EncountersInsert)[]
	);

	return { visitDate };
}
