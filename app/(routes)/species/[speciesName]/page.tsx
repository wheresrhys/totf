import { BootstrapPageData } from '@/app/components/layout/BootstrapPageData';
import { getAuthenticatedSupabaseClient } from '@/lib/group-auth';
import { catchSupabaseErrors } from '@/lib/supabase';
import { getTopPeriodsByMetric } from '@/app/actions/top-performers';
import { type EnrichedBirdOfSpecies } from '@/app/models/bird';
import { SpPage } from '@/app/components/SpPage';
import { fetchPageOfBirds } from '@/app/actions/sp-data';

import type {
	AggregateStatsResult,
	TopMetricsFilterParams,
	TopPeriodsResult
} from '@/app/models/db';
import type { ViewedGroup } from '@/lib/group-slug';
// `year`/`month` are only present on the period-scoped child routes
// (`[year]`, `[year]/[month]`); the unscoped route supplies just `speciesName`.
export type PageParams = { speciesName: string; year?: string; month?: string };
type PageProps = { params: Promise<PageParams> };

// A resolved period passed to `fetchSpPageDataForPeriod`. `year`/`month` drive the
// heading and top-session filtering; `fromDate`/`toDate` (a `yyyy-MM-dd` range)
// scope the encounter-level fetchers. All optional — an all-time page passes none.
export type PeriodScope = {
	year?: number;
	month?: number;
	fromDate?: string;
	toDate?: string;
};

export type FullFatPageData = {
	topSessions: TopPeriodsResult[];
	birds: EnrichedBirdOfSpecies[];
	speciesStats: AggregateStatsResult;
	speciesId: number;
	speciesName: string;
} & PeriodScope;
export type ThinPageData = { speciesId: number } & PeriodScope;
export type PageData = FullFatPageData | ThinPageData;

function getTopSessions(
	species: string,
	viewedGroupId: number,
	year?: number,
	month?: number
) {
	return getTopPeriodsByMetric({
		temporal_unit: 'day',
		metric_name: 'encounters',
		filters: {
			species_filter: species,
			ringing_group_filter: viewedGroupId,
			...(year !== undefined ? { year_filter: year } : {}),
			...(month !== undefined ? { month_filter: month } : {})
		} as TopMetricsFilterParams,
		result_limit: 5
	}) as Promise<TopPeriodsResult[]>;
}

async function getSpeciesStats(
	species: string,
	viewedGroupId: number,
	fromDate?: string,
	toDate?: string
) {
	const supabase = await getAuthenticatedSupabaseClient();
	return supabase
		.rpc('aggregate_stats', {
			species_name_filter: species,
			ringing_group_filter: viewedGroupId,
			...(fromDate ? { from_date: fromDate } : {}),
			...(toDate ? { to_date: toDate } : {})
		})
		.then(catchSupabaseErrors) as Promise<AggregateStatsResult[]>;
}

// Shared core fetcher for all three species route levels. Given a resolved
// `PeriodScope` it threads the date range into the encounter-level fetchers
// (birds + aggregate stats) and the year/month into the top-session filter, and
// echoes the period back on the returned data so the client can build the
// heading and scope its own tab fetches. The unscoped route passes an empty
// period, reproducing today's all-time behaviour exactly.
export async function fetchSpPageDataForPeriod(
	params: PageParams,
	viewedGroupId: number,
	period: PeriodScope = {}
): Promise<PageData | null> {
	const { year, month, fromDate, toDate } = period;
	const supabase = await getAuthenticatedSupabaseClient();
	const { id: speciesId } = (await supabase
		.from('Species')
		.select('id')
		.eq('species_name', params.speciesName)
		.single()
		.then(catchSupabaseErrors)) as { id: number };
	if (!speciesId) {
		throw new Error(`Species ${params.speciesName} not found`);
	}
	const [topSessions, birds, speciesStats] = await Promise.all([
		getTopSessions(params.speciesName, viewedGroupId, year, month),
		fetchPageOfBirds(speciesId, viewedGroupId, 0, fromDate, toDate),
		getSpeciesStats(params.speciesName, viewedGroupId, fromDate, toDate)
	]);
	if (birds.length === 0) {
		return {
			speciesId,
			year,
			month,
			fromDate,
			toDate
		};
	}
	return {
		topSessions,
		birds,
		speciesStats: speciesStats[0],
		speciesId,
		speciesName: params.speciesName,
		year,
		month,
		fromDate,
		toDate
	};
}

export async function fetchSpPageData(
	params: PageParams,
	viewedGroupId: number
): Promise<PageData | null> {
	return fetchSpPageDataForPeriod(params, viewedGroupId);
}

export default async function SpeciesPage(
	props: PageProps & { viewedGroup?: ViewedGroup }
) {
	return (
		<BootstrapPageData<PageData, PageProps, PageParams>
			pageProps={props}
			viewedGroup={props.viewedGroup}
			getCacheKeys={(params: PageParams) => ['species', params.speciesName]}
			dataFetcher={fetchSpPageData}
			PageComponent={SpPage}
		/>
	);
}
