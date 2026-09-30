'use server';
import { getAuthenticatedSupabaseClient } from '@/app/lib/auth/group-auth';
import { catchSupabaseErrors } from '@/lib/supabase';
import type {
	BiometricsStatsResult,
	CoreStatsResult,
	DemographicsStatsResult
} from '@/app/models/db';

export type SpeciesComparisonStats = {
	coreStats: CoreStatsResult[];
	biometricsStats: BiometricsStatsResult[];
	demographicsStats: DemographicsStatsResult[];
};

/**
 * All three by-species stats datasets for a group, in one go (#115) — the
 * species-comparison page's only fetch.
 *
 * Fetched up front rather than per dataset-toggle or per species-pill tap: the
 * three RPCs share one identical group-wide, `group_by_species` call shape, so
 * the page's entire state (which species are selected, which dataset is shown)
 * is a pure filter over what's already here. That makes both interactions
 * instant and keeps the page at three RPC round-trips total instead of one per
 * tap.
 *
 * `biometrics_stats`/`demographics_stats` have no public-gated wrappers and
 * `/compare/species` sits outside the public-summary subtree (#770), so this
 * goes through the plain authenticated client rather than
 * `fetchAuthorisedCoreStats` — matching `fetchSpeciesData`'s biometrics half
 * (`app/actions/spp-data.ts`).
 */
export async function fetchSpeciesComparisonStats(
	viewedGroupId: number
): Promise<SpeciesComparisonStats> {
	const supabase = await getAuthenticatedSupabaseClient();
	const rpcArgs = {
		ringing_group_filter: viewedGroupId,
		group_by_species: true
	};
	const [coreStats, biometricsStats, demographicsStats] = await Promise.all([
		supabase.rpc('core_stats', rpcArgs).then(catchSupabaseErrors) as Promise<
			CoreStatsResult[]
		>,
		supabase
			.rpc('biometrics_stats', rpcArgs)
			.then(catchSupabaseErrors) as Promise<BiometricsStatsResult[]>,
		supabase
			.rpc('demographics_stats', rpcArgs)
			.then(catchSupabaseErrors) as Promise<DemographicsStatsResult[]>
	]);
	return { coreStats, biometricsStats, demographicsStats };
}
