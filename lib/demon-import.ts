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

// The leading alphabetic run of a ring number is its sequence prefix
// (e.g. "AEL1699" -> "AEL"). A ring number with no leading letters yields "".
export function deriveRingSequencePrefix(ringNo: string): string {
	return (ringNo.match(/^[A-Za-z]+/) || [''])[0];
}

// Deduce a ring's `size` enum from its prefix length and total ring-number
// length. This is deliberately NOT the same mapping as `classifyRingSize` in
// app/models/ring-sequences.ts — that heuristic returns coarse display buckets
// ('B, C, C2'/'Large') and has no 'G' branch; this returns real `ring_size`
// enum values and only for the unambiguous cases, `null` otherwise (so the
// importer never guesses a size it isn't sure of). See issue #659.
export function deduceRingSequenceSize(
	prefix: string,
	ringNoLength: number
): Database['public']['Enums']['ring_size'] | null {
	const alphaCount = prefix.length;

	if (alphaCount === 3 && ringNoLength === 6) return 'AA';
	if (alphaCount === 3 && ringNoLength === 7) return 'A';

	if (alphaCount === 2 && ringNoLength === 7) {
		const firstLetter = prefix[0].toUpperCase();
		if (firstLetter === 'D') return 'D2';
		if (firstLetter === 'F') return 'Fv';
		if (firstLetter === 'S') return 'SO';
		if (firstLetter === 'G') return 'G';
		if (firstLetter === 'E') return 'E';
	}

	return null;
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

// Postgres transient failures worth retrying: serialization failure (40001)
// and deadlock detected (40P01). Both import paths process rows concurrently,
// and rows sharing a ring prefix contend on the same RingSequences row — both
// when first creating it and, via the Task B `trg_refresh_ring_sequence_bounds`
// trigger (which SELECT ... FOR UPDATEs the sequence row on every
// Birds.ring_sequence_id write), when two same-prefix Bird upserts each hold the
// FK's KEY SHARE lock and try to upgrade to FOR UPDATE. Retrying the aborted
// statement lets the deadlock victim succeed once the winner has committed.
const RETRYABLE_PG_CODES = new Set(['40001', '40P01']);
const PG_RETRY_MAX_ATTEMPTS = 5;

function isRetryablePgError(error: unknown): boolean {
	return (
		typeof error === 'object' &&
		error !== null &&
		'code' in error &&
		RETRYABLE_PG_CODES.has((error as { code: string }).code)
	);
}

// Retry an operation on transient serialization/deadlock failures, with a small
// randomised backoff so contending rows don't immediately re-collide.
export async function withPgRetry<T>(operation: () => Promise<T>): Promise<T> {
	let lastError: unknown;
	for (let attempt = 0; attempt < PG_RETRY_MAX_ATTEMPTS; attempt++) {
		try {
			return await operation();
		} catch (error) {
			if (!isRetryablePgError(error)) throw error;
			lastError = error;
			await new Promise((resolve) =>
				setTimeout(resolve, Math.random() * 25 * (attempt + 1))
			);
		}
	}
	throw lastError;
}

// Resolves (find-or-create) the `RingSequences` row for a `(prefix,
// ringing_group_id)` pair and returns its id. Deliberately NOT built on
// `createUpserter`: that always upserts with `ignoreDuplicates: false`, i.e. a
// full-column overwrite on conflict, which would clobber a `size` a user has
// manually corrected via the ring-sequences UI. This never updates an existing
// row's `size`: it selects first and only inserts (with `ignoreDuplicates:
// true` / ON CONFLICT DO NOTHING) when the row is genuinely missing.
//
// Both import paths run rows concurrently, and every row of a given prefix hits
// the same key, so the select-first ordering means only the first row of a
// prefix ever attempts an insert once the row is committed — and any residual
// races between simultaneous first-inserts are retried on deadlock/serialization
// failure (see `isRetryablePgError`). See issue #659.
export function createRingSequenceResolver(supabaseClient: SupabaseClient) {
	async function selectId(
		prefix: string,
		ringingGroupId: number
	): Promise<number | null> {
		const { data, error } = await supabaseClient
			.from('RingSequences')
			.select('id')
			.eq('prefix', prefix)
			.eq('ringing_group_id', ringingGroupId)
			.maybeSingle();
		if (error) throw error;
		return data?.id ?? null;
	}

	async function resolveOnce(
		prefix: string,
		ringingGroupId: number,
		size: Database['public']['Enums']['ring_size'] | null
	): Promise<number> {
		const existingId = await selectId(prefix, ringingGroupId);
		if (existingId !== null) return existingId;

		const { error: insertError } = await supabaseClient
			.from('RingSequences')
			.upsert(
				{ prefix, ringing_group_id: ringingGroupId, size },
				{ onConflict: 'prefix,ringing_group_id', ignoreDuplicates: true }
			);
		if (insertError) throw insertError;

		const id = await selectId(prefix, ringingGroupId);
		if (id === null)
			throw new Error(
				`RingSequences row for prefix "${prefix}" (group ${ringingGroupId}) not found after upsert`
			);
		return id;
	}

	return (
		prefix: string,
		ringingGroupId: number,
		size: Database['public']['Enums']['ring_size'] | null
	): Promise<number> =>
		withPgRetry(() => resolveOnce(prefix, ringingGroupId, size));
}

export async function processEncounterRow(
	rawRow: DemonRow,
	upsert: ReturnType<typeof createUpserter>,
	resolveRingSequence: ReturnType<typeof createRingSequenceResolver>,
	ringingGroupId: number
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
	// time, so it's the only record_type that resolves/creates a RingSequences
	// row and stamps `ring_sequence_id` onto the Bird. Any other record_type
	// leaves both RingSequences and Birds.ring_sequence_id untouched (the Birds
	// upsert only writes columns present in its payload).
	let ringSequenceId: number | undefined;
	if (row.record_type === 'N') {
		const ringNo = row.ring_no as string;
		const prefix = deriveRingSequencePrefix(ringNo);
		const size = deduceRingSequenceSize(prefix, ringNo.length);
		ringSequenceId = await resolveRingSequence(prefix, ringingGroupId, size);
	}

	// Wrapped in withPgRetry because writing ring_sequence_id fires the Task B
	// bounds trigger, which FOR UPDATEs the shared RingSequences row — so two
	// concurrent same-prefix Bird upserts can deadlock (see withPgRetry).
	const birdId = await withPgRetry(() =>
		upsert<BirdsInsert>(
			'Birds',
			{
				ring_no: row.ring_no as string,
				species_id: speciesId,
				...(ringSequenceId !== undefined
					? { ring_sequence_id: ringSequenceId }
					: {})
			},
			['ring_no']
		)
	);

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
			finding_condition: row.finding_condition as string | null,
			finding_circumstances: row.finding_circumstances as string | null,
			is_juv,
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
		['bird_id', 'session_id'] as (keyof EncountersInsert)[]
	);

	return { visitDate };
}
