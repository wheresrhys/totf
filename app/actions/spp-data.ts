'use server';
import { fetchAuthorisedAggregateStats } from '@/app/lib/auth/group-summary-access';
import { getAuthenticatedSupabaseClient } from '@/app/lib/auth/group-auth';
import { catchSupabaseErrors } from '@/lib/supabase';
import type { BiometricsStatsResult } from '@/app/models/db';
import {
	mergeSpeciesBiometrics,
	type SpeciesStatsRow
} from '@/app/lib/species-stats';

// biometrics_stats needs an authenticated session to be meaningful (it has no
// public-gated wrapper analogous to public_aggregate_stats — /species sits
// outside the public-summary subtree, #770) — so it's only queried once
// fetchAuthorisedAggregateStats confirms an authenticated session actually
// resolved data ('own' or 'shared'). A 'blocked' or 'public' accessLevel
// contributes no biometrics rows, matching in practice today's only real
// caller of this access pattern, but this stays defensive rather than assuming
// it's the only one.
async function fetchBiometricsStats(
	viewedGroupId: number,
	fromDate?: string,
	toDate?: string
): Promise<BiometricsStatsResult[]> {
	const client = await getAuthenticatedSupabaseClient();
	const rows = (await client
		.rpc('biometrics_stats', {
			ringing_group_filter: viewedGroupId,
			from_date: fromDate,
			to_date: toDate,
			group_by_species: true
		})
		.then(catchSupabaseErrors)) as BiometricsStatsResult[] | null;
	return rows ?? [];
}

export async function fetchSpeciesData(
	viewedGroupId: number,
	fromDate?: string,
	toDate?: string
): Promise<SpeciesStatsRow[]> {
	const { accessLevel, rows } = await fetchAuthorisedAggregateStats(
		viewedGroupId,
		{
			from_date: fromDate,
			to_date: toDate,
			group_by_species: true
		}
	);

	const biometricsRows =
		accessLevel === 'own' || accessLevel === 'shared'
			? await fetchBiometricsStats(viewedGroupId, fromDate, toDate)
			: [];

	return mergeSpeciesBiometrics(rows, biometricsRows);
}
