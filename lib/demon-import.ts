import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase.types';

type SpeciesInsert = Database['public']['Tables']['Species']['Insert'];
type BirdsInsert = Omit<
	Database['public']['Tables']['Birds']['Insert'],
	'last_encountered_timestamp'
>;
type EncountersInsert = Omit<
	Database['public']['Tables']['Encounters']['Insert'],
	'ringing_group_id' | 'max_hatch_year' | 'min_hatch_year'
>;
type SessionsInsert = Omit<
	Database['public']['Tables']['Sessions']['Insert'],
	'ringing_group_id'
>;
type LocationsInsert = Database['public']['Tables']['Locations']['Insert'];
type RingSequencesBirdsInsert =
	Database['public']['Tables']['RingSequences_Birds']['Insert'];

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
export const RESIGHTING_RECORD_TYPES = ['U', 'F', 'D'] as const;
export type ResightingRecordType = (typeof RESIGHTING_RECORD_TYPES)[number];

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

	// Parse the age code once, up front — it feeds both the session-type decision
	// and the Encounters insert below.
	const age_code = Number(String(row.age).replace('J', ''));
	const is_juv = String(row.age).endsWith('J');

	// A row's own record_type/age deterministically picks its session bucket
	// (no cross-row aggregation, no import-order sensitivity). record_type wins
	// over age: a resighting/recovery of a pulli-age bird is still a
	// FIELD_OBSERVATION, not a PULLI capture. A raw age of 1 (but not 1J) is a
	// pulli; is_juv guards against a recently-fledged juvenile being mistaken
	// for a nestling.
	const sessionType = (RESIGHTING_RECORD_TYPES as readonly string[]).includes(
		row.record_type as string
	)
		? 'FIELD_OBSERVATION'
		: age_code === 1 && !is_juv
			? 'PULLI'
			: 'FULL_GROWN';

	const sessionId = await upsert<SessionsInsert>(
		'Sessions',
		{
			visit_date: visitDate,
			location_id: locationId,
			session_type: sessionType
		},
		['visit_date', 'location_id', 'session_type'] as (keyof SessionsInsert)[]
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
			scheme: row.scheme as string,
			sex: row.sex as string,
			sexing_method: row.sexing_method as string | null,
			weight: row.weight ? Number(row.weight) : null,
			wing_length: row.wing_length ? Number(row.wing_length) : null
		},
		['bird_id', 'session_id'] as (keyof EncountersInsert)[]
	);

	return { visitDate };
}
