import {
	BootstrapPage,
	type DefaultPageParams
} from '../components/layout/BootstrapPage';
import type { ViewedGroup } from '@/app/lib/group-slug';
import {
	HomePageContent,
	type PageModel,
	type HomePageSummaryStats
} from './PageContent';
import type { CoreStatsResult, GroupTicksResult } from '../models/db';
import type { SpeciesWithBirdsCount } from '../models/species';
import { getAuthenticatedSupabaseClient } from '@/app/lib/auth/group-auth';
import { catchSupabaseErrors } from '@/lib/supabase';
import type { SessionWithEncountersCount } from '../models/session';
import { recentSessionsQuery, topSpeciesQuery } from '@/queries';
import { getServerCachedStats } from '@/app/actions/stats-cache';

export async function fetchRecentSessions(
	viewedGroup: ViewedGroup
): Promise<SessionWithEncountersCount[]> {
	const supabase = await getAuthenticatedSupabaseClient();
	const sessions = (await supabase
		.from('Sessions')
		.select(recentSessionsQuery.select)
		.eq('ringing_group_id', viewedGroup.id)
		.order('visit_date', { ascending: false })
		.limit(30)
		.then(catchSupabaseErrors)) as SessionWithEncountersCount[];
	const recentDates = [...new Set(sessions.map((s) => s.visit_date))].slice(
		0,
		3
	);
	return sessions.filter((s) => recentDates.includes(s.visit_date));
}

// The all-time and year grains are both real SimpleStatsCache cells read
// directly (#1221) — refreshSimpleStatsCache recomputes every (group,
// temporal_unit, time_period) cell from its own raw-Encounters window on
// every refresh, the same full aggregate core_stats itself would run, not by
// summing finer cells. Since encounters can't be future-dated, an
// in-progress year's `year`-grain row for the current year already *is*
// "year to date" by construction, not an approximation of it — so no
// from_date/to_date window-juggling is needed, just picking the right
// time_period row out of every year the group has.
export async function fetchHomePageSummaryStats(
	viewedGroup: ViewedGroup
): Promise<HomePageSummaryStats | null> {
	const currentYear = new Date().getFullYear();
	const startOfCurrentYear = `${currentYear}-01-01`;
	const startOfLastYear = `${currentYear - 1}-01-01`;
	const [allTimeRows, yearRows] = (await Promise.all([
		getServerCachedStats({
			rpcName: 'core_stats',
			fetchDataBySpecies: false,
			temporalUnit: 'all-time',
			viewedGroup
		}),
		getServerCachedStats({
			rpcName: 'core_stats',
			fetchDataBySpecies: false,
			temporalUnit: 'year',
			viewedGroup
		})
	])) as [CoreStatsResult[], CoreStatsResult[]];
	const allTime = allTimeRows[0] ?? null;
	const thisYear =
		yearRows.find((row) => row.time_period === startOfCurrentYear) ?? null;
	const lastYear =
		yearRows.find((row) => row.time_period === startOfLastYear) ?? null;
	if (allTime == null && thisYear == null && lastYear == null) {
		return null;
	}
	return { allTime, thisYear, lastYear };
}

export async function fetchLastGroupTick(
	viewedGroup: ViewedGroup
): Promise<GroupTicksResult | null> {
	const supabase = await getAuthenticatedSupabaseClient();
	const ticks = (await supabase
		.rpc('group_ticks', {
			ringing_group_filter: viewedGroup.id,
			result_limit: 1
		})
		.then(catchSupabaseErrors)) as GroupTicksResult[] | null;
	return ticks?.[0] ?? null;
}

// Every species the group has actually recorded (birds count > 0), for the
// home page's species-by-letter nav (#1025) — replaced the previous
// top-10-by-count badge list, so this no longer sorts by count or slices.
export async function fetchGroupSpecies(): Promise<SpeciesWithBirdsCount[]> {
	const supabase = await getAuthenticatedSupabaseClient();
	const species = (await supabase
		.from('Species')
		.select(topSpeciesQuery.select)
		.then(catchSupabaseErrors)) as SpeciesWithBirdsCount[];
	return species.filter((s) => (s.birds[0]?.count ?? 0) > 0);
}

export async function fetchHomePageContent(
	_: DefaultPageParams,
	viewedGroup: ViewedGroup
): Promise<PageModel> {
	return {
		recentSessions: await fetchRecentSessions(viewedGroup),
		groupSpecies: await fetchGroupSpecies(),
		summaryStats: await fetchHomePageSummaryStats(viewedGroup),
		lastGroupTick: await fetchLastGroupTick(viewedGroup)
	};
}

export default async function HomePage({
	viewedGroup
}: {
	viewedGroup?: ViewedGroup;
} = {}) {
	return (
		<BootstrapPage<PageModel>
			viewedGroup={viewedGroup}
			getCacheKeys={() => ['home-stats']}
			dataFetcher={fetchHomePageContent}
			PageComponent={HomePageContent}
		/>
	);
}
