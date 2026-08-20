import { getAuthenticatedSupabaseClient } from './group-auth';
import { catchSupabaseErrors, fetchAllPaginatedRows } from './supabase';
import type { SessionStatsData } from '@/app/models/session-highlights';
import type {
	AggregateStatsResult,
	StatsPerDayAndSpeciesResult
} from '@/app/models/db';

// The stats blob only changes when new data is imported. The cache entry
// carries a version token (max Encounters.id for the group) so that a new
// import invalidates the cache immediately, even across lambda instances.
// The 60-min TTL is retained as a backstop for rare in-place re-imports
// that edit existing encounters without adding rows.
//
// This is the single implementation of fetchSessionStats — app/actions/
// session-highlights.ts imports it (and shares this cache instance) rather
// than keeping its own copy, since importing a plain module from a
// 'use server' file is fine.
export const SESSION_STATS_CACHE_TTL_MS = 60 * 60 * 1000;
export const sessionStatsCache = new Map<
	number,
	{ version: number; expiresAt: number; stats: SessionStatsData }
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

export async function fetchSessionStats(
	viewedGroupId: number
): Promise<SessionStatsData> {
	const supabase = await getAuthenticatedSupabaseClient();
	const currentVersion = await fetchStatsVersion(supabase, viewedGroupId);
	const cached = sessionStatsCache.get(viewedGroupId);
	if (
		cached &&
		cached.version === currentVersion &&
		cached.expiresAt > Date.now()
	) {
		return cached.stats;
	}
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
	const stats: SessionStatsData = {
		daySpeciesStats,
		sessionDates: sessionRows.map((row) => row.visit_date)
	};
	sessionStatsCache.set(viewedGroupId, {
		version: currentVersion,
		expiresAt: Date.now() + SESSION_STATS_CACHE_TTL_MS,
		stats
	});
	return stats;
}

// One row per period (group_by_species: false, matching fetchPayOffStats'
// existing precedent) — aggregate_stats computes bird_count as
// COUNT(DISTINCT bird_id) per period bucket server-side, so summing across
// periods client-side never double-counts a retrapped bird. No from_date/
// to_date is passed, so the RPC's internal period_spine returns one row per
// period that has data. Unlike fetchSessionStats, this is not cached —
// matching fetchPayOffStats' precedent (a deliberate choice, not an
// oversight).
export async function fetchYearStats(
	viewedGroupId: number
): Promise<AggregateStatsResult[] | null> {
	const supabase = await getAuthenticatedSupabaseClient();
	return supabase
		.rpc('aggregate_stats', {
			ringing_group_filter: viewedGroupId,
			group_by_species: false,
			group_by_time_period: 'year'
		})
		.then(catchSupabaseErrors) as Promise<AggregateStatsResult[] | null>;
}

export async function fetchMonthStats(
	viewedGroupId: number
): Promise<AggregateStatsResult[] | null> {
	const supabase = await getAuthenticatedSupabaseClient();
	return supabase
		.rpc('aggregate_stats', {
			ringing_group_filter: viewedGroupId,
			group_by_species: false,
			group_by_time_period: 'month'
		})
		.then(catchSupabaseErrors) as Promise<AggregateStatsResult[] | null>;
}
