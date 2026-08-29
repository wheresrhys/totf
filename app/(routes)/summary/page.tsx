import { BootstrapPageData } from '@/app/components/layout/BootstrapPageData';
import {
	fetchSummaryStats,
	fetchYearlyTotals
} from '@/app/actions/summary-stats';
import type { ViewedGroup } from '@/lib/group-slug';
import type { AggregateStatsResult } from '@/app/models/db';
import { SummaryPage as SummaryPageContent } from './_shared';

export type PageData = {
	summaryStats: AggregateStatsResult | null;
	yearlyTotals: AggregateStatsResult[];
};

export async function fetchAllTimeSummaryData(
	_params: Record<string, string>,
	viewedGroupId: number
): Promise<PageData> {
	const [summaryStats, yearlyTotals] = await Promise.all([
		fetchSummaryStats(viewedGroupId),
		fetchYearlyTotals(viewedGroupId)
	]);
	return { summaryStats, yearlyTotals };
}

function AllTimeSummary({
	data,
	viewedGroup
}: {
	data: PageData;
	viewedGroup: ViewedGroup;
}) {
	return (
		<SummaryPageContent
			summaryStats={data.summaryStats}
			yearlyTotals={data.yearlyTotals}
			viewedGroup={viewedGroup}
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
