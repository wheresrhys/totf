import { BootstrapPage } from '@/app/components/layout/BootstrapPage';
import {
	fetchSummaryStats,
	fetchYearlyTotals
} from '@/app/actions/summary-stats';
import type { ViewedGroup } from '@/lib/group-slug';
import type { AggregateStatsResult } from '@/app/models/db';
import { SummaryPageContent } from './PageContent';

export type PageData = {
	summaryStats: AggregateStatsResult | null;
	yearlyTotals: AggregateStatsResult[];
};

export async function fetchSummaryPageContent(
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
			showAllTimeMonthTotals
			lazySessionTotals
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
		<BootstrapPage<PageData>
			viewedGroup={viewedGroup}
			getCacheKeys={() => ['summary']}
			dataFetcher={fetchSummaryPageContent}
			PageComponent={AllTimeSummary}
		/>
	);
}
