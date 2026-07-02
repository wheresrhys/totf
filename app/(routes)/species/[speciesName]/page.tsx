import { BootstrapPageData } from '@/app/components/layout/BootstrapPageData';
import { getAuthenticatedSupabaseClient } from '@/lib/group-auth';
import { catchSupabaseErrors } from '@/lib/supabase';
import { getTopPeriodsByMetric } from '@/app/actions/top-performers';
import { type EnrichedBirdOfSpecies } from '@/app/models/bird';
import { SingleSpeciesPage } from '@/app/components/SingleSpeciesPage';
import { fetchPageOfBirds } from '@/app/actions/single-species-data';

import type {
	AggregateStatsRow,
	TopMetricsFilterParams,
	TopPeriodsResult
} from '@/app/models/db';
export type PageParams = { speciesName: string };
type PageProps = { params: Promise<PageParams> };

export type FullFatPageData = {
	topSessions: TopPeriodsResult[];
	birds: EnrichedBirdOfSpecies[];
	speciesStats: AggregateStatsRow;
	speciesId: number;
	speciesName: string;
};
export type PageData = FullFatPageData | { speciesId: number };

function getTopSessions(species: string, viewedGroupId: number) {
	return getTopPeriodsByMetric({
		temporal_unit: 'day',
		metric_name: 'encounters',
		filters: {
			species_filter: species,
			ringing_group_filter: viewedGroupId
		} as TopMetricsFilterParams,
		result_limit: 5
	}) as Promise<TopPeriodsResult[]>;
}

async function getSpeciesStats(species: string, viewedGroupId: number) {
	const supabase = await getAuthenticatedSupabaseClient();
	return supabase
		.rpc('aggregate_stats', {
			species_name_filter: species,
			ringing_group_filter: viewedGroupId
		})
		.then(catchSupabaseErrors) as Promise<AggregateStatsRow[]>;
}

async function fetchSpeciesData(
	params: PageParams,
	viewedGroupId: number
): Promise<PageData | null> {
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
		getTopSessions(params.speciesName, viewedGroupId),
		fetchPageOfBirds(speciesId, viewedGroupId),
		getSpeciesStats(params.speciesName, viewedGroupId)
	]);
	if (birds.length === 0) {
		return {
			speciesId
		};
	}
	return {
		topSessions,
		birds,
		speciesStats: speciesStats[0],
		speciesId,
		speciesName: params.speciesName
	};
}

export default async function SpeciesPage(
	props: PageProps & { viewedGroupId?: number }
) {
	return (
		<BootstrapPageData<PageData, PageProps, PageParams>
			pageProps={props}
			viewedGroupId={props.viewedGroupId}
			getCacheKeys={(params: PageParams) => ['species', params.speciesName]}
			dataFetcher={fetchSpeciesData}
			PageComponent={SingleSpeciesPage}
		/>
	);
}
