import { BootstrapPageData } from '@/app/components/layout/BootstrapPageData';
import { getAuthenticatedSupabaseClient } from '@/lib/group-auth';
import { catchSupabaseErrors } from '@/lib/supabase';
import { getTopPeriodsByMetric } from '@/app/actions/top-performers';
import { type EnrichedBirdOfSpecies } from '@/app/models/bird';
import { SpeciesPageWithFilters } from '@/app/components/SingleSpeciesPage';
import { fetchPageOfBirds } from '@/app/actions/single-species-data';
import { getSexOfBird, type EncounterOfBird } from '@/app/models/bird';
import type { SexedGraphableBird } from '@/app/components/WeightAndWingChart';
import type { GraphableBird } from '@/app/components/WeightAndWingChart';
import type {
	AggregateStatsRow,
	NotableRetrapsResult,
	TopMetricsFilterParams,
	TopPeriodsResult
} from '@/app/models/db';
export type PageParams = { speciesName: string };
type PageProps = { params: Promise<PageParams> };

export type FullFatPageData = {
	topSessions: TopPeriodsResult[];
	birds: EnrichedBirdOfSpecies[];
	speciesStats: AggregateStatsRow;
	speciesStatsHistory: AggregateStatsRow[];
	graphableEncounterData: SexedGraphableBird[];
	notableRetraps: NotableRetrapsResult[];
	speciesId: number;
};
export type PageData = FullFatPageData | { speciesId: number };

async function fetchNotableRetraps(
	speciesName: string,
	groupId: number
): Promise<NotableRetrapsResult[]> {
	const supabase = await getAuthenticatedSupabaseClient();
	return supabase
		.rpc('notable_retraps', {
			ringing_group_filter: groupId,
			species_filter: speciesName,
			result_limit: 10,
			min_proven_age: 3,
			min_encounter_count: 6
		})
		.then(catchSupabaseErrors) as Promise<NotableRetrapsResult[]>;
}

async function fetchGraphableEncounterData(
	speciesId: number,
	groupId: number
): Promise<SexedGraphableBird[]> {
	const supabase = await getAuthenticatedSupabaseClient();
	const paginatedBirdResults = (await supabase
		.from('Birds')
		.select(
			`encounters:Encounters (
				age_code,
				sex,
				weight,
				wing_length
			)`
		)
		.eq('species_id', speciesId)
		.contains('ringing_group_ids', [groupId])
		.then(catchSupabaseErrors)) as GraphableBird[];
	return paginatedBirdResults.map(
		(bird) =>
			({
				...bird,
				...getSexOfBird(bird.encounters as EncounterOfBird[])
			}) as SexedGraphableBird
	);
}

function getTopSessions(species: string, groupId: number) {
	return getTopPeriodsByMetric({
		temporal_unit: 'day',
		metric_name: 'encounters',
		filters: {
			species_filter: species,
			ringing_group_filter: groupId
		} as TopMetricsFilterParams,
		result_limit: 5
	}) as Promise<TopPeriodsResult[]>;
}

async function getSpeciesStats(species: string, groupId: number) {
	const supabase = await getAuthenticatedSupabaseClient();
	return supabase
		.rpc('aggregate_stats', {
			species_name_filter: species,
			ringing_group_filter: groupId
		})
		.then(catchSupabaseErrors) as Promise<AggregateStatsRow[]>;
}

async function getSpeciesStatsHistory(species: string, groupId: number) {
	const supabase = await getAuthenticatedSupabaseClient();
	return supabase
		.rpc('aggregate_stats', {
			species_name_filter: species,
			ringing_group_filter: groupId,
			group_by_time_period: 'month'
		})
		.then(catchSupabaseErrors) as Promise<AggregateStatsRow[]>;
}

async function fetchSpeciesData(
	params: PageParams,
	groupId: number
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
	const [
		topSessions,
		birds,
		speciesStats,
		speciesStatsHistory,
		graphableEncounterData,
		notableRetraps
	] = await Promise.all([
		getTopSessions(params.speciesName, groupId),
		fetchPageOfBirds(speciesId, groupId),
		getSpeciesStats(params.speciesName, groupId),
		getSpeciesStatsHistory(params.speciesName, groupId),
		fetchGraphableEncounterData(speciesId, groupId),
		fetchNotableRetraps(params.speciesName, groupId)
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
		speciesStatsHistory,
		graphableEncounterData,
		notableRetraps,
		speciesId
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
