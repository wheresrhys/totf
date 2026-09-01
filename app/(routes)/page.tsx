import {
	BootstrapPage,
	type DefaultPageParams
} from '../components/layout/BootstrapPage';
import type { ViewedGroup } from '@/lib/group-slug';
import {
	HomePageContent,
	type PageModel,
	type HomePageSummaryStats,
	type SpeciesWithBirdsCount
} from './PageContent';
import type { AggregateStatsResult, GroupTicksResult } from '../models/db';
import { getAuthenticatedSupabaseClient } from '@/lib/group-auth';
import { catchSupabaseErrors } from '@/lib/supabase';
import type { SessionWithEncountersCount } from '../models/session';

export async function fetchRecentSessions(
	viewedGroupId: number
): Promise<SessionWithEncountersCount[]> {
	const supabase = await getAuthenticatedSupabaseClient();
	const sessions = (await supabase
		.from('Sessions')
		.select(
			'id, visit_date, location_id, ringing_group_id, location:Locations(location_name), encounters:Encounters(count)'
		)
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
			.rpc('aggregate_stats', { ringing_group_filter: viewedGroupId })
			.then(catchSupabaseErrors) as Promise<AggregateStatsResult[] | null>,
		supabase
			.rpc('aggregate_stats', {
				ringing_group_filter: viewedGroupId,
				from_date: startOfCurrentYear
			})
			.then(catchSupabaseErrors) as Promise<AggregateStatsResult[] | null>,
		supabase
			.rpc('aggregate_stats', {
				ringing_group_filter: viewedGroupId,
				from_date: startOfLastYear,
				to_date: endOfLastYear
			})
			.then(catchSupabaseErrors) as Promise<AggregateStatsResult[] | null>
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

export async function fetchTopSpecies(): Promise<SpeciesWithBirdsCount[]> {
	const supabase = await getAuthenticatedSupabaseClient();
	const species = (await supabase
		.from('Species')
		.select('id, species_name, birds:Birds(count)')
		.then(catchSupabaseErrors)) as SpeciesWithBirdsCount[];
	return species
		.filter((s) => (s.birds[0]?.count ?? 0) > 0)
		.sort((a, b) => (b.birds[0]?.count ?? 0) - (a.birds[0]?.count ?? 0))
		.slice(0, 10);
}

export async function fetchHomePageContent(
	_: DefaultPageParams,
	viewedGroupId: number
): Promise<PageModel> {
	return {
		recentSessions: await fetchRecentSessions(viewedGroupId),
		topSpecies: await fetchTopSpecies(),
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
