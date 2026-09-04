import { getAuthenticatedSupabaseClient } from './group-auth';
import { catchSupabaseErrors, fetchAllPaginatedRows } from './supabase';
import type { SessionStatsData } from '@/app/models/highlights';
import type {
	AggregateStatsResult,
	StatsPerDayAndSpeciesResult
} from '@/app/models/db';

// The stats blobs only change when new data is imported. Each cache entry
// carries a version token (max Encounters.id for the group) so that a new
// import invalidates the cache immediately, even across lambda instances.
// The 60-min TTL is retained as a backstop for rare in-place re-imports
// that edit existing encounters without adding rows.
//
// This is the single implementation of fetchSessionStats — app/actions/
// session-highlights.ts imports it (and shares this cache instance) rather
// than keeping its own copy, since importing a plain module from a
// 'use server' file is fine.
//
// fetchYearStats/fetchMonthStats reuse the same version-checked,
// TTL-backed caching via fetchWithVersionCache below, each keyed off its
// own Map instance (yearStatsCache / monthStatsCache) — separate Map
// instances per period type, rather than a shared Map keyed by group id
// alone, so a year lookup and a month lookup for the same group can never
// collide on the same cache entry.
export const STATS_CACHE_TTL_MS = 60 * 60 * 1000;

type StatsCacheEntry<T> = { version: number; expiresAt: number; stats: T };

export const sessionStatsCache = new Map<
	number,
	StatsCacheEntry<SessionStatsData>
>();
export const yearStatsCache = new Map<
	number,
	StatsCacheEntry<AggregateStatsResult[] | null>
>();
export const monthStatsCache = new Map<
	number,
	StatsCacheEntry<AggregateStatsResult[] | null>
>();

export async function fetchStatsVersion(
	supabase: Awaited<ReturnType<typeof getAuthenticatedSupabaseClient>>,
	viewedGroupId: number
): Promise<number> {
	const { data } = await supabase
		.from('Encounters')
		.select('id')
		.eq('ringing_group_id', viewedGroupId)
		.order('id', { ascending: false })
		.limit(1);
	return data?.[0]?.id ?? 0;
}

async function fetchWithVersionCache<T>(
	cache: Map<number, StatsCacheEntry<T>>,
	viewedGroupId: number,
	fetchStats: (
		supabase: Awaited<ReturnType<typeof getAuthenticatedSupabaseClient>>
	) => Promise<T>
): Promise<T> {
	const supabase = await getAuthenticatedSupabaseClient();
	const currentVersion = await fetchStatsVersion(supabase, viewedGroupId);
	const cached = cache.get(viewedGroupId);
	if (
		cached &&
		cached.version === currentVersion &&
		cached.expiresAt > Date.now()
	) {
		return cached.stats;
	}
	const stats = await fetchStats(supabase);
	cache.set(viewedGroupId, {
		version: currentVersion,
		expiresAt: Date.now() + STATS_CACHE_TTL_MS,
		stats
	});
	return stats;
}

export async function fetchSessionStats(
	viewedGroupId: number
): Promise<SessionStatsData> {
	return fetchWithVersionCache(
		sessionStatsCache,
		viewedGroupId,
		async (supabase) => {
			const [daySpeciesStats, sessionRows] = await Promise.all([
				fetchAllPaginatedRows<StatsPerDayAndSpeciesResult>((fromRow, toRow) =>
					supabase
						.rpc('stats_per_day_and_species', {
							ringing_group_filter: viewedGroupId
						})
						.order('visit_date')
						.order('species_name')
						.range(fromRow, toRow)
				),
				fetchAllPaginatedRows<{ visit_date: string }>((fromRow, toRow) =>
					supabase
						.from('Sessions')
						.select('visit_date')
						.eq('ringing_group_id', viewedGroupId)
						.eq('session_type', 'FULL_GROWN')
						.order('visit_date')
						.range(fromRow, toRow)
				)
			]);
			return {
				daySpeciesStats,
				sessionDates: sessionRows.map((row) => row.visit_date)
			};
		}
	);
}

// One row per period+species (group_by_species: true) — matches
// fetchSessionStats' species granularity (its stats_per_day_and_species RPC
// groups by day+species) rather than fetchPayOffStats' summary-only
// precedent, since these functions are meant to be equivalent to
// fetchSessionStats except for the aggregate period. aggregate_stats
// computes bird_count as COUNT(DISTINCT bird_id) per period+species bucket
// server-side, so summing across periods client-side never double-counts a
// retrapped bird. No from_date/to_date is passed, so the RPC's internal
// period_spine returns one row per period that has data. Cached via
// fetchWithVersionCache, the same version-checked/TTL-backed mechanism as
// fetchSessionStats (see comment above) — unlike fetchPayOffStats, which
// remains deliberately uncached.
export async function fetchYearStats(
	viewedGroupId: number
): Promise<AggregateStatsResult[] | null> {
	return fetchWithVersionCache(
		yearStatsCache,
		viewedGroupId,
		(supabase) =>
			supabase
				.rpc('aggregate_stats', {
					ringing_group_filter: viewedGroupId,
					group_by_species: true,
					group_by_time_period: 'year'
				})
				.then(catchSupabaseErrors) as Promise<AggregateStatsResult[] | null>
	);
}

export async function fetchMonthStats(
	viewedGroupId: number
): Promise<AggregateStatsResult[] | null> {
	return fetchWithVersionCache(
		monthStatsCache,
		viewedGroupId,
		(supabase) =>
			supabase
				.rpc('aggregate_stats', {
					ringing_group_filter: viewedGroupId,
					group_by_species: true,
					group_by_time_period: 'month'
				})
				.then(catchSupabaseErrors) as Promise<AggregateStatsResult[] | null>
	);
}
