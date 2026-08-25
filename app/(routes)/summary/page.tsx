import { BootstrapPageData } from '@/app/components/layout/BootstrapPageData';
import { fetchSessionStats } from '@/lib/underlying-stats';
import { fetchSummaryStats } from '@/app/actions/summary-stats';
import type { ViewedGroup } from '@/lib/group-slug';
import type { AggregateStatsResult } from '@/app/models/db';
import { SummaryPage as SummaryPageContent } from './_shared';

export type PageData = {
	sessionDates: string[];
	summaryStats: AggregateStatsResult | null;
};

export async function fetchAllTimeSummaryData(
	_params: Record<string, string>,
	viewedGroupId: number
): Promise<PageData> {
	const { sessionDates } = await fetchSessionStats(viewedGroupId);
	const summaryStats = await fetchSummaryStats(viewedGroupId);
	return { sessionDates, summaryStats };
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
			sessionDates={data.sessionDates}
			summaryStats={data.summaryStats}
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
