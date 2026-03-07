import { BootstrapPageData } from '@/app/components/layout/BootstrapPageData';
import { getAuthenticatedSupabaseClient } from '@/lib/group-auth';
import { catchSupabaseErrors } from '@/lib/supabase';
import { getTopPeriodsByMetric } from '@/app/isomorphic/stats-data-tables';
import { type EnrichedBirdOfSpecies } from '@/app/models/bird';
import { SpeciesPageWithFilters } from '@/app/components/SingleSpeciesPage';
import { fetchPageOfBirds } from '@/app/isomorphic/single-species-data';
import type {
	SpeciesStatsRow,
	TopMetricsFilterParams,
	TopPeriodsResult
} from '@/app/models/db';
type PageParams = { speciesName: string };
type PageProps = { params: Promise<PageParams> };

export type PageData = {
	topSessions: TopPeriodsResult[];
	birds: EnrichedBirdOfSpecies[];
	speciesStats: SpeciesStatsRow;
};

function getTopSessions(species: string) {
	return getTopPeriodsByMetric({
		temporal_unit: 'day',
		metric_name: 'encounters',
		filters: { species_filter: species } as TopMetricsFilterParams,
		result_limit: 5
	}) as Promise<TopPeriodsResult[]>;
}

async function getSpeciesStats(species: string) {
	const supabase = await getAuthenticatedSupabaseClient();
	return supabase
		.rpc('species_stats', {
			species_name_filter: species
		})
		.then(catchSupabaseErrors) as Promise<SpeciesStatsRow[]>;
}

async function fetchSpeciesData(params: PageParams): Promise<PageData | null> {
	const [topSessions, birds, speciesStats] = await Promise.all([
		getTopSessions(params.speciesName),
		fetchPageOfBirds(params.speciesName),
		getSpeciesStats(params.speciesName)
	]);
	if (birds.length === 0) return null;
	return {
		topSessions,
		birds,
		speciesStats: speciesStats[0]
	};
}

export default async function SpeciesPage(props: PageProps) {
	return (
		<BootstrapPageData<PageData, PageProps, PageParams>
			pageProps={props}
			getCacheKeys={(params: PageParams) => ['species', params.speciesName]}
			dataFetcher={fetchSpeciesData}
			PageComponent={SpeciesPageWithFilters}
		/>
	);
}
