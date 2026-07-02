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
		uniqueColumn: keyof DataInsertModel
	): Promise<number> => {
		const { data: upsertResult, error: upsertError } = await supabaseClient
			.from(tableName)
			.upsert(upsertData, {
				onConflict: uniqueColumn as string,
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

export async function processEncounterRow(
	rawRow: DemonRow,
	upsert: ReturnType<typeof createUpserter>,
	ringingGroupId: number
): Promise<{ visitDate: string }> {
	const row = transformEmptyStringsToNull(rawRow) as DemonRow;
	if (!row.ring_no) {
		throw new CasualtyEncounterError();
	}

	const speciesId = await upsert<SpeciesInsert>(
		'Species',
		{ species_name: row.species_name as string },
		'species_name'
	);

	const birdId = await upsert<BirdsInsert>(
		'Birds',
		{ ring_no: row.ring_no as string, species_id: speciesId },
		'ring_no'
	);

	const locationId = await upsert<LocationsInsert>(
		'Locations',
		{ location_name: row.loc_id as string, ringing_group_id: ringingGroupId },
		'location_name'
	);

	const visitDate = convertDateFormat(row.visit_date as string);

	const sessionId = await upsert<SessionsInsert>(
		'Sessions',
		{ visit_date: visitDate, location_id: locationId },
		'visit_date,location_id' as keyof SessionsInsert
	);

	const age_code = Number(String(row.age).replace('J', ''));

	await upsert<EncountersInsert>(
		'Encounters',
		{
			age_code,
			breeding_condition: row.breeding_condition as string | null,
			capture_time: row.capture_time as string,
			extra_text: row.extra_text as string | null,
			is_juv: String(row.age).endsWith('J'),
			moult_code: row.moult_code as string | null,
			old_greater_coverts: row.old_greater_coverts
				? Number(row.old_greater_coverts)
				: null,
			record_type: row.record_type as string,
			bird_id: birdId,
			session_id: sessionId,
			scheme: row.scheme as string,
			sex: row.sex as string,
			sexing_method: row.sexing_method as string | null,
			weight: row.weight ? Number(row.weight) : null,
			wing_length: row.wing_length ? Number(row.wing_length) : null
		},
		'bird_id,session_id' as keyof EncountersInsert
	);

	return { visitDate };
}
