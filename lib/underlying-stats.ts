import { getAuthenticatedSupabaseClient } from './group-auth';
import { fetchAllPaginatedRows } from './supabase';
import type { SessionStatsData } from '@/app/models/session-highlights';
import type { StatsPerDayAndSpeciesResult } from '@/app/models/db';

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
