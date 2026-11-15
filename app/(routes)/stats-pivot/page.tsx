import { fetchStatsPivotRows } from '@/app/actions/stats-pivot';
import { fetchSpeciesComparisonStats } from '@/app/actions/compare-species';
import { BootstrapPage } from '@/app/components/layout/BootstrapPage';
import { listAvailableSpecies } from '@/app/lib/compare-species';
import {
	parseStatsPivotSearchParams,
	type PivotSourceRows,
	type StatsPivotParams,
	type StatsPivotSearchParams
} from '@/app/lib/stats-pivot';
import type { ViewedGroup } from '@/app/lib/group-slug';
import { StatsPivotPageContent } from './PageContent';

type PageProps = { searchParams?: Promise<StatsPivotSearchParams> };

export type StatsPivotPageData = {
	sourceRows: PivotSourceRows;
	availableSpecies: string[];
	// The `?species=` actually shown — null when absent or one the group has
	// no data for, which falls back to all species rather than an empty grid.
	species: string | null;
};

export async function fetchStatsPivotPageContent(
	{ species: requestedSpecies }: StatsPivotParams,
	viewedGroup: ViewedGroup
): Promise<StatsPivotPageData> {
	const availableSpecies = listAvailableSpecies(
		await fetchSpeciesComparisonStats(viewedGroup)
	);
	const species =
		requestedSpecies && availableSpecies.includes(requestedSpecies)
			? requestedSpecies
			: null;
	return {
		sourceRows: await fetchStatsPivotRows(viewedGroup, species),
		availableSpecies,
		species
	};
}

export default async function StatsPivotPage(
	props: PageProps & { viewedGroup?: ViewedGroup } = {}
) {
	return (
		<BootstrapPage<StatsPivotPageData, PageProps, StatsPivotParams>
			pageProps={props}
			viewedGroup={props.viewedGroup}
			getParams={async (pageProps: PageProps) =>
				parseStatsPivotSearchParams((await pageProps.searchParams) ?? {})
			}
			getCacheKeys={({ species }) => ['stats-pivot', species ?? '']}
			dataFetcher={fetchStatsPivotPageContent}
			PageComponent={StatsPivotPageContent}
		/>
	);
}
