'use server';
import { getAuthenticatedSupabaseClient } from '@/lib/group-auth';
import { catchSupabaseErrors } from '@/lib/supabase';
import type {
	TopPeriodsResult,
	TopSpeciesResult,
	TopPeriodsArgs,
	TopSpeciesArgs,
	TopMetricsFilterParams
} from '@/app/models/db';

export type TopStatsResult = TopPeriodsResult | TopSpeciesResult;
export type TopStatsArguments = TopPeriodsArgs | TopSpeciesArgs;
export type UserTopStatsArgs = Omit<TopStatsArguments, 'result_limit'> & {
	filters: Omit<TopMetricsFilterParams, 'ringing_group_filter'>;
};

export async function getTopPeriodsByMetric(
	options: TopPeriodsArgs
): Promise<TopPeriodsResult[] | null> {
	const supabase = await getAuthenticatedSupabaseClient();
	return supabase
		.rpc('top_metrics_by_period', options)
		.then(catchSupabaseErrors);
}

export async function getTopSpeciesByMetric(
	options: TopSpeciesArgs
): Promise<TopSpeciesResult[] | null> {
	const supabase = await getAuthenticatedSupabaseClient();
	return supabase
		.rpc('top_metrics_by_species_and_period', options)
		.then(catchSupabaseErrors);
}

export async function getTopStats(
	isBySpecies: boolean,
	dataArguments: TopStatsArguments
): Promise<TopPeriodsResult[] | TopSpeciesResult[] | null> {
	const data = isBySpecies
		? await getTopSpeciesByMetric({
				...dataArguments
			} as TopSpeciesArgs)
		: await getTopPeriodsByMetric({
				...dataArguments
			} as TopPeriodsArgs);
	return data;
}
