import type { SupabaseClient } from '@supabase/supabase-js';
import { getAuthenticatedSupabaseClient } from '@/app/lib/auth/group-auth';
import { catchSupabaseErrors } from '@/lib/supabase';
import type { CoreStatsResult } from '@/app/models/db';
import type { ViewedGroup } from '@/app/lib/group-slug';
import type { Database } from '@/types/supabase.types';

export type PayOffStatsData = {
	yearly: CoreStatsResult[];
	monthly: CoreStatsResult[];
};

type SimpleStatsCacheRow =
	Database['public']['Tables']['SimpleStatsCache']['Row'];

/**
 * `SimpleStatsCache` has no `species_id`/`species_name` column at all — it's
 * the all-species-combined half of the cache split (#1169) — so `core_stats`
 * itself only ever returned `species_name: null` for this group-wide,
 * `group_by_species: false` shape. `CoreStatsResult` strips every column
 * non-null, and no current consumer of `PayOffStatsData` reads
 * `species_name` (#1206), so an empty string stands in for the value the
 * cache row simply doesn't have.
 */
const NO_SPECIES_NAME = '';

function toCoreStatsResult(row: SimpleStatsCacheRow): CoreStatsResult {
	return {
		species_name: NO_SPECIES_NAME,
		time_period: row.time_period,
		session_count: row.session_count,
		total_effort: row.total_effort,
		effort_per_session: row.effort_per_session,
		effort_per_encounter: row.effort_per_encounter,
		avg_encounters_per_session: row.avg_encounters_per_session,
		max_per_session: row.max_per_session,
		species_count: row.species_count,
		bird_count: row.bird_count,
		encounter_count: row.encounter_count,
		new_bird_count: row.new_bird_count,
		pullus_bird_count: row.pullus_bird_count,
		juv_bird_count: row.juv_bird_count,
		postjuv_bird_count: row.postjuv_bird_count,
		adult_bird_count: row.adult_bird_count,
		unknown_age_bird_count: row.unknown_age_bird_count,
		pullus_enc_count: row.pullus_enc_count,
		juv_enc_count: row.juv_enc_count,
		postjuv_enc_count: row.postjuv_enc_count,
		adult_enc_count: row.adult_enc_count,
		unknown_age_enc_count: row.unknown_age_enc_count,
		max_new_per_session: row.max_new_per_session
	};
}

/**
 * Fetches one temporal unit's worth of `SimpleStatsCache` rows for the group
 * (#1206), ordered ascending by `time_period` — `PayOffYearlyTable` and
 * `PayOffEffortChart` both assume chronological order, matching the `core_stats`
 * RPC's own `ORDER BY ... time_period ASC`.
 */
function fetchCacheRows(
	supabase: SupabaseClient,
	groupId: number,
	temporalUnit: 'year' | 'month'
): Promise<SimpleStatsCacheRow[] | null> {
	return supabase
		.from('SimpleStatsCache')
		.select('*')
		.eq('group_id', groupId)
		.eq('temporal_unit', temporalUnit)
		.order('time_period', { ascending: true })
		.then(catchSupabaseErrors) as Promise<SimpleStatsCacheRow[] | null>;
}

export async function fetchPayOffStats(
	viewedGroup: ViewedGroup
): Promise<PayOffStatsData | null> {
	const supabase = await getAuthenticatedSupabaseClient();
	const [yearly, monthly] = await Promise.all([
		fetchCacheRows(supabase, viewedGroup.id, 'year'),
		fetchCacheRows(supabase, viewedGroup.id, 'month')
	]);
	if (yearly == null || monthly == null) {
		return null;
	}
	return {
		yearly: yearly.map(toCoreStatsResult),
		monthly: monthly.map(toCoreStatsResult)
	};
}
