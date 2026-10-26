'use server';
import { getAuthenticatedSupabaseClient } from '@/app/lib/auth/group-auth';
import { catchSupabaseErrors } from '@/lib/supabase';
import type { BiometricsStatsResult, CoreStatsResult } from '@/app/models/db';
import type { ViewedGroup } from '@/app/lib/group-slug';
import type { Database } from '@/types/supabase.types';

export type SpeciesComparisonStats = {
	coreStats: CoreStatsResult[];
	biometricsStats: BiometricsStatsResult[];
};

type SimpleStatsCacheBySpeciesRow =
	Database['public']['Tables']['SimpleStatsCacheBySpecies']['Row'];

/**
 * One `SimpleStatsCacheBySpecies` row plus its species name, resolved via the
 * table's existing `species_id` → `Species.id` FK rather than a second
 * round-trip (#1206).
 */
type CacheRowWithSpeciesName = SimpleStatsCacheBySpeciesRow & {
	species: { species_name: string } | null;
};

function toCoreStatsResult(row: CacheRowWithSpeciesName): CoreStatsResult {
	return {
		species_name: row.species?.species_name ?? '',
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

function toBiometricsStatsResult(
	row: CacheRowWithSpeciesName
): BiometricsStatsResult {
	return {
		species_name: row.species?.species_name ?? '',
		time_period: row.time_period,
		max_weight: row.max_weight,
		avg_weight: row.avg_weight,
		min_weight: row.min_weight,
		median_weight: row.median_weight,
		max_wing: row.max_wing,
		avg_wing: row.avg_wing,
		min_wing: row.min_wing,
		median_wing: row.median_wing,
		encounter_count: row.encounter_count
	};
}

/**
 * All three by-species stats datasets for a group, in one go (#115) — the
 * species-comparison page's only fetch.
 *
 * Reads `SimpleStatsCacheBySpecies` (#1206) rather than running `core_stats`/
 * `biometrics_stats` live: the cache table's `all-time` rows are the
 * precomputed equivalent of the old group-wide, `group_by_species: true`
 * RPC calls with no time-period grouping, and one query embedding
 * `Species(species_name)` off the table's existing `species_id` FK resolves
 * every row's species name in the same round-trip. `coreStats`/
 * `biometricsStats` are both derived from the same cache rows — the two
 * RPCs used to share an identical call shape, and the cache table already
 * carries both metric families' columns in one row.
 *
 * `biometrics_stats`/`demographics_stats` have no public-gated wrappers and
 * `/compare/species` sits outside the public-summary subtree (#770), so this
 * goes through the plain authenticated client rather than
 * `fetchAuthorisedCoreStats` — matching `fetchSpeciesData`'s biometrics half
 * (`app/actions/spp-data.ts`).
 */
export async function fetchSpeciesComparisonStats(
	viewedGroup: ViewedGroup
): Promise<SpeciesComparisonStats> {
	const supabase = await getAuthenticatedSupabaseClient();
	const rows = (await supabase
		.from('SimpleStatsCacheBySpecies')
		.select('*, species:Species(species_name)')
		.eq('group_id', viewedGroup.id)
		.eq('temporal_unit', 'all-time')
		.then(catchSupabaseErrors)) as CacheRowWithSpeciesName[] | null;

	const cacheRows = rows ?? [];
	return {
		coreStats: cacheRows.map(toCoreStatsResult),
		biometricsStats: cacheRows.map(toBiometricsStatsResult)
	};
}
