'use server';
import { fetchAllPaginatedRows } from '@/lib/supabase';
import type { BiometricsStatsResult, CoreStatsResult } from '@/app/models/db';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getAuthenticatedSupabaseClient } from '../lib/auth/group-auth';
import type { TemporalUnit } from '@/lib/stats-cache-refresh';
import type { ViewedGroup } from '@/app/lib/group-slug';

export type StatsResult = CoreStatsResult | BiometricsStatsResult;

// The two stats shapes the Highlights rules ask for, named after the RPCs that
// used to serve them (`HighlightsGenerator.rpcName`, app/lib/highlights/types.ts).
// They are now served out of the SimpleStatsCache tables instead, so the name
// only picks which column subset to read — see STATS_CACHE_COLUMNS_BY_RPC_NAME.
export type StatsCacheRpcName = 'core_stats' | 'biometrics_stats';

// The core_stats_result columns, every one of which the SimpleStatsCache tables
// carry under the same name (supabase/schema/.../types/core_stats_result.sql vs
// "SimpleStatsCache".sql). `species_name` is absent on purpose: it is not a
// column on either cache table — the by-species table carries `species_id` and
// resolves the name through its FK to Species, and the all-species-combined
// table has no species at all. See resolveEmbeddedSpeciesName.
const CORE_STATS_CACHE_COLUMNS = [
	'time_period',
	'session_count',
	'total_effort',
	'effort_per_session',
	'effort_per_encounter',
	'avg_encounters_per_session',
	'max_per_session',
	'species_count',
	'bird_count',
	'encounter_count',
	'new_bird_count',
	'pullus_bird_count',
	'juv_bird_count',
	'postjuv_bird_count',
	'adult_bird_count',
	'unknown_age_bird_count',
	'pullus_enc_count',
	'juv_enc_count',
	'postjuv_enc_count',
	'adult_enc_count',
	'unknown_age_enc_count',
	'max_new_per_session'
];

// The biometrics_stats_result columns: the 8 wing/weight metrics plus the
// `encounter_count` sample size the composite type declares alongside them
// (biometrics_stats_result.sql calls it out explicitly as the sample size
// backing the metrics), so a biometrics read keeps the exact row shape the RPC
// returned. Deliberately NOT the whole core-stats column set — a biometrics
// rule never reads any of the rest.
const BIOMETRICS_STATS_CACHE_COLUMNS = [
	'time_period',
	'encounter_count',
	'max_weight',
	'avg_weight',
	'min_weight',
	'median_weight',
	'max_wing',
	'avg_wing',
	'min_wing',
	'median_wing'
];

const STATS_CACHE_COLUMNS_BY_RPC_NAME: Record<StatsCacheRpcName, string[]> = {
	core_stats: CORE_STATS_CACHE_COLUMNS,
	biometrics_stats: BIOMETRICS_STATS_CACHE_COLUMNS
};

// A row as the cache tables return it: the requested column subset, plus the
// embedded Species row when the by-species table was read. The embed is a
// to-one relationship, so PostgREST returns a single object (or null), not an
// array.
type StatsCacheRowWithEmbeddedSpecies = StatsResult & {
	Species?: { species_name: string } | null;
};

// `species_name` is a real column on neither cache table, so every read
// synthesises it: from the embedded Species row for a by-species read, and as
// `null` for an all-species-combined one — which is exactly what
// core_stats/biometrics_stats returned when called with
// group_by_species: false.
function resolveEmbeddedSpeciesName({
	Species,
	...row
}: StatsCacheRowWithEmbeddedSpecies): StatsResult {
	return {
		...row,
		species_name: Species?.species_name ?? null
	} as StatsResult;
}

// Reads one (group, temporal unit) slice of the already-materialized
// SimpleStatsCache tables, which the post-import refresh queue populates
// (lib/stats-cache-refresh.ts). This replaces re-running the
// core_stats/biometrics_stats RPCs per request: the RPCs redo the same
// multi-way join these rows already paid for once, so a plain indexed-column
// table read needs neither the RPC nor the version/TTL memo
// (cached-supabase-fetch.ts) that used to paper over its cost.
//
// Still paginated through fetchAllPaginatedRows: a day-granularity by-species
// slice is easily more rows than one PostgREST request returns.
function getStatsCacheTableFetcher(
	rpcName: StatsCacheRpcName,
	temporalUnit: TemporalUnit,
	groupBySpecies: boolean = false
) {
	const tableName = groupBySpecies
		? 'SimpleStatsCacheBySpecies'
		: 'SimpleStatsCache';
	const selectedColumns = [
		...STATS_CACHE_COLUMNS_BY_RPC_NAME[rpcName],
		// A single embedded select over
		// simple_stats_cache_by_species_species_id_fkey, rather than a second
		// round-trip to Species.
		...(groupBySpecies ? ['Species(species_name)'] : [])
	].join(', ');

	return async (supabase: SupabaseClient, groupId: number) => {
		const rows = await fetchAllPaginatedRows<StatsCacheRowWithEmbeddedSpecies>(
			(fromRow, toRow) => {
				const request = supabase
					.from(tableName)
					// The select string is assembled at runtime, so supabase-js can't
					// infer the row shape from a string literal — name it explicitly,
					// as lib/demon-import.ts does for the same reason.
					.select<string, StatsCacheRowWithEmbeddedSpecies>(selectedColumns)
					.eq('group_id', groupId)
					.eq('temporal_unit', temporalUnit)
					.order('time_period');

				// Ordering the parent rows by an embedded to-one column needs
				// PostgREST's `order=Species(species_name)` spelling, NOT
				// supabase-js' `{referencedTable}` option — that one orders rows
				// *within* the embed, which for a to-one relationship leaves the
				// parent rows in an arbitrary order (verified against local
				// Postgres). Pagination needs a total order to page correctly, and
				// sort stability in the rule finders (app/lib/highlights/lib/rule-utils.ts)
				// means ties resolve in row order, so this has to match the
				// (time_period, species_name) order the RPC fetcher used.
				return groupBySpecies
					? request.order('Species(species_name)').range(fromRow, toRow)
					: request.range(fromRow, toRow);
			}
		);
		return rows.map(resolveEmbeddedSpeciesName);
	};
}

export type ServerCachedStatsParams = {
	rpcName: StatsCacheRpcName;
	fetchDataBySpecies: boolean;
	temporalUnit: TemporalUnit;
	viewedGroup: ViewedGroup;
};

export async function getServerCachedStats({
	rpcName,
	fetchDataBySpecies,
	temporalUnit,
	viewedGroup
}: ServerCachedStatsParams): Promise<StatsResult[]> {
	const supabase = await getAuthenticatedSupabaseClient();
	return getStatsCacheTableFetcher(
		rpcName,
		temporalUnit,
		fetchDataBySpecies
	)(supabase, viewedGroup.id);
}

// Group-wide, ungrouped-by-species monthly core stats. Kept as its own function
// (rather than callers using getServerCachedStats directly) so a caller that
// only needs the ungrouped monthly totals states that in one argument-free
// call, rather than restating the same four parameters.
export async function fetchCoreStatsByMonth(
	viewedGroup: ViewedGroup
): Promise<CoreStatsResult[]> {
	return (await getServerCachedStats({
		rpcName: 'core_stats',
		fetchDataBySpecies: false,
		temporalUnit: 'month',
		viewedGroup
	})) as CoreStatsResult[];
}
