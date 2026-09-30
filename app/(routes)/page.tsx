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

export async function fetchRecentSessions(
	viewedGroupId: number
): Promise<SessionWithEncountersCount[]> {
	const supabase = await getAuthenticatedSupabaseClient();
	const sessions = (await supabase
		.from('Sessions')
		.select(recentSessionsQuery.select)
		.eq('ringing_group_id', viewedGroupId)
		.order('visit_date', { ascending: false })
		.limit(30)
		.then(catchSupabaseErrors)) as SessionWithEncountersCount[];
	const recentDates = [...new Set(sessions.map((s) => s.visit_date))].slice(
		0,
		3
	);
	return sessions.filter((s) => recentDates.includes(s.visit_date));
}

export async function fetchHomePageSummaryStats(
	viewedGroupId: number
): Promise<HomePageSummaryStats | null> {
	const supabase = await getAuthenticatedSupabaseClient();
	const currentYear = new Date().getFullYear();
	const startOfCurrentYear = `${currentYear}-01-01`;
	const startOfLastYear = `${currentYear - 1}-01-01`;
	const endOfLastYear = `${currentYear - 1}-12-31`;
	const [allTime, thisYear, lastYear] = await Promise.all([
		supabase
			.rpc('core_stats', { ringing_group_filter: viewedGroupId })
			.then(catchSupabaseErrors) as Promise<CoreStatsResult[] | null>,
		supabase
			.rpc('core_stats', {
				ringing_group_filter: viewedGroupId,
				from_date: startOfCurrentYear
			})
			.then(catchSupabaseErrors) as Promise<CoreStatsResult[] | null>,
		supabase
			.rpc('core_stats', {
				ringing_group_filter: viewedGroupId,
				from_date: startOfLastYear,
				to_date: endOfLastYear
			})
			.then(catchSupabaseErrors) as Promise<CoreStatsResult[] | null>
	]);
	if (allTime?.[0] == null && thisYear?.[0] == null && lastYear?.[0] == null) {
		return null;
	}
	return {
		allTime: allTime?.[0] ?? null,
		thisYear: thisYear?.[0] ?? null,
		lastYear: lastYear?.[0] ?? null
	};
}

export async function fetchLastGroupTick(
	viewedGroupId: number
): Promise<GroupTicksResult | null> {
	const supabase = await getAuthenticatedSupabaseClient();
	const ticks = (await supabase
		.rpc('group_ticks', {
			ringing_group_filter: viewedGroupId,
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
	viewedGroupId: number
): Promise<PageModel> {
	return {
		recentSessions: await fetchRecentSessions(viewedGroupId),
		groupSpecies: await fetchGroupSpecies(),
		summaryStats: await fetchHomePageSummaryStats(viewedGroupId),
		lastGroupTick: await fetchLastGroupTick(viewedGroupId)
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
