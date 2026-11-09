import {
	BootstrapPage,
	type DefaultPageParams
} from '@/app/components/layout/BootstrapPage';
import type { ViewedGroup } from '@/app/lib/group-slug';
import { getAuthenticatedSupabaseClient } from '@/app/lib/auth/group-auth';
import { fetchOwnGroupImportJobs } from '@/app/actions/import-jobs';
import { fetchStatsCacheDiscrepancies } from '@/app/actions/stats-cache-discrepancies';
import { fetchSpeciesNames } from '@/app/lib/global-nav-data';
import {
	EAGER_DISCREPANCY_SCOPES,
	discrepancyScopeKey,
	type DiscrepancyScopeResults
} from '@/app/components/pages/stats-consistency/discrepancy-scopes';
import {
	StatsConsistencyPageContent,
	type StatsConsistencyPageData
} from './PageContent';

export async function fetchStatsConsistencyPageContent(
	_params: DefaultPageParams,
	viewedGroup: ViewedGroup
): Promise<StatsConsistencyPageData> {
	const [importJobs, eagerResults, speciesRows] = await Promise.all([
		fetchOwnGroupImportJobs(),
		Promise.all(
			EAGER_DISCREPANCY_SCOPES.map((scope) =>
				fetchStatsCacheDiscrepancies({
					temporalUnit: scope.temporalUnit,
					bySpecies: scope.bySpecies
				})
			)
		),
		getAuthenticatedSupabaseClient().then((client) =>
			fetchSpeciesNames(viewedGroup, client)
		)
	]);

	const eagerDiscrepancies: DiscrepancyScopeResults = {};
	EAGER_DISCREPANCY_SCOPES.forEach((scope, index) => {
		eagerDiscrepancies[discrepancyScopeKey(scope)] = eagerResults[index];
	});

	const speciesNamesById = Object.fromEntries(
		speciesRows.map((row) => [row.id, row.species_name])
	);

	return { importJobs, eagerDiscrepancies, speciesNamesById };
}

export default async function StatsConsistencyPage({
	viewedGroup
}: {
	viewedGroup?: ViewedGroup;
} = {}) {
	return (
		<BootstrapPage<StatsConsistencyPageData>
			viewedGroup={viewedGroup}
			getCacheKeys={() => ['stats-consistency']}
			dataFetcher={fetchStatsConsistencyPageContent}
			PageComponent={StatsConsistencyPageContent}
		/>
	);
}
