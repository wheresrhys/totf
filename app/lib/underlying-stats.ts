import { getAuthenticatedSupabaseClient } from './auth/group-auth';
import { catchSupabaseErrors, fetchAllPaginatedRows } from '@/lib/supabase';
import type { SessionStatsData } from '@/app/lib/highlights';
import type {
	CoreStatsResult,
	StatsPerDayAndSpeciesResult
} from '@/app/models/db';
import { cachedSupabaseFetch } from './cached-supabase-fetch';

export async function fetchSessionStats(
	viewedGroupId: number
): Promise<SessionStatsData> {
	return cachedSupabaseFetch(
		'session-stats',
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
// fetchSessionStats except for the aggregate period. core_stats
// computes bird_count as COUNT(DISTINCT bird_id) per period+species bucket
// server-side, so summing across periods client-side never double-counts a
// retrapped bird. No from_date/to_date is passed, so the RPC's internal
// period_spine returns one row per period that has data. Cached via
// fetchWithVersionCache, the same version-checked/TTL-backed mechanism as
// fetchSessionStats (see comment above) — unlike fetchPayOffStats, which
// remains deliberately uncached.
export async function fetchYearStats(
	viewedGroupId: number
): Promise<CoreStatsResult[] | null> {
	return cachedSupabaseFetch(
		'year-species-core-stats',
		viewedGroupId,
		(supabase) =>
			supabase
				.rpc('core_stats', {
					ringing_group_filter: viewedGroupId,
					group_by_species: true,
					group_by_time_period: 'year'
				})
				.then(catchSupabaseErrors) as Promise<CoreStatsResult[] | null>
	);
}

export async function fetchMonthStats(
	viewedGroupId: number
): Promise<CoreStatsResult[] | null> {
	return cachedSupabaseFetch(
		'month-species-core-stats',
		viewedGroupId,
		(supabase) =>
			supabase
				.rpc('core_stats', {
					ringing_group_filter: viewedGroupId,
					group_by_species: true,
					group_by_time_period: 'month'
				})
				.then(catchSupabaseErrors) as Promise<CoreStatsResult[] | null>
	);
}

// The unfiltered-by-species sibling of fetchMonthStats: group_by_species:
// false (no species_name_filter) rather than true, so each row is one
// group-wide month total instead of one per species+month. Feeds the
// species page's effort-context series (ringing effort isn't a property of
// the species being viewed, it's a property of the session) — reused across
// the Population and Biometrics tabs within a session, so it's cached via
// the same fetchWithVersionCache mechanism as fetchYearStats/fetchMonthStats
// (unlike fetchPayOffStats, which remains deliberately uncached — see the
// comment above it) via its own dedicated effortHistoryCache Map.
export async function fetchGroupEffortHistory(
	viewedGroupId: number
): Promise<CoreStatsResult[] | null> {
	return cachedSupabaseFetch(
		'monthly-group-effort-history',
		viewedGroupId,
		(supabase) =>
			supabase
				.rpc('core_stats', {
					ringing_group_filter: viewedGroupId,
					group_by_species: false,
					group_by_time_period: 'month'
				})
				.then(catchSupabaseErrors) as Promise<CoreStatsResult[] | null>
	);
}
