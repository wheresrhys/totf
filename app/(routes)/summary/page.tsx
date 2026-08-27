import { BootstrapPageData } from '@/app/components/layout/BootstrapPageData';
import {
	fetchSummaryStats,
	fetchYearlyTotals
} from '@/app/actions/summary-stats';
import { fetchSpeciesData } from '@/app/actions/spp-data';
import type { ViewedGroup } from '@/lib/group-slug';
import type { AggregateStatsResult } from '@/app/models/db';
import { SummaryPage as SummaryPageContent } from './_shared';

export type PageData = {
	summaryStats: AggregateStatsResult | null;
	speciesStats: AggregateStatsResult[];
	yearlyTotals: AggregateStatsResult[];
};

export async function fetchAllTimeSummaryData(
	_params: Record<string, string>,
	viewedGroupId: number
): Promise<PageData> {
	const [summaryStats, speciesStats, yearlyTotals] = await Promise.all([
		fetchSummaryStats(viewedGroupId),
		fetchSpeciesData(viewedGroupId),
		fetchYearlyTotals(viewedGroupId)
	]);
	return { summaryStats, speciesStats, yearlyTotals };
}

function AllTimeSummary({
	data
}: {
	data: PageData;
	viewedGroup: ViewedGroup;
}) {
	return (
		<SummaryPageContent
			summaryStats={data.summaryStats}
			speciesStats={data.speciesStats}
			yearlyTotals={data.yearlyTotals}
		/>
	);
}

export default async function SummaryPage({
	viewedGroup
}: {
	viewedGroup?: ViewedGroup;
} = {}) {
	return (
		<BootstrapPageData<PageData>
			viewedGroup={viewedGroup}
			getCacheKeys={() => ['summary']}
			dataFetcher={fetchAllTimeSummaryData}
			PageComponent={AllTimeSummary}
		/>
	);
}
