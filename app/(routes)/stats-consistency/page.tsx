import {
	BootstrapPage,
	type DefaultPageParams
} from '@/app/components/layout/BootstrapPage';
import type { ViewedGroup } from '@/app/lib/group-slug';
import { getAuthenticatedSupabaseClient } from '@/app/lib/auth/group-auth';
import { fetchOwnGroupImportJobs } from '@/app/actions/import-jobs';
import { fetchSpeciesNames } from '@/app/lib/global-nav-data';
import {
	StatsConsistencyPageContent,
	type StatsConsistencyPageData
} from './PageContent';

// The discrepancy report's `all-time`/`year`/`month-squashed` scopes used to
// be fetched here, eagerly and in parallel, as part of the page's own data
// fetch. Per PR #1393 review, each comparison costs a real set of DB round
// trips, so firing 6 of them in parallel and blocking the page's initial
// render on all of them succeeding was too expensive a default — they now
// run client-side, one at a time, after the page has already rendered (see
// `StatsCacheDiscrepanciesReport`'s `useEagerDiscrepancyScopeResults`), so
// this fetcher only ever resolves the data the page itself needs up front.
export async function fetchStatsConsistencyPageContent(
	_params: DefaultPageParams,
	viewedGroup: ViewedGroup
): Promise<StatsConsistencyPageData> {
	const [importJobs, speciesRows] = await Promise.all([
		fetchOwnGroupImportJobs(),
		getAuthenticatedSupabaseClient().then((client) =>
			fetchSpeciesNames(viewedGroup, client)
		)
	]);

	const speciesNamesById = Object.fromEntries(
		speciesRows.map((row) => [row.id, row.species_name])
	);

	return { importJobs, speciesNamesById };
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
