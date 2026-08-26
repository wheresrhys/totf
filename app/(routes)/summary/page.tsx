import { BootstrapPageData } from '@/app/components/layout/BootstrapPageData';
import { fetchSessionStats } from '@/lib/underlying-stats';
import { fetchSummaryStats } from '@/app/actions/summary-stats';
import { fetchSpeciesData } from '@/app/actions/spp-data';
import type { ViewedGroup } from '@/lib/group-slug';
import type { AggregateStatsResult } from '@/app/models/db';
import { SummaryPage as SummaryPageContent } from './_shared';

export type PageData = {
	sessionDates: string[];
	summaryStats: AggregateStatsResult | null;
	speciesStats: AggregateStatsResult[];
};

export async function fetchAllTimeSummaryData(
	_params: Record<string, string>,
	viewedGroupId: number
): Promise<PageData> {
	const [{ sessionDates }, summaryStats, speciesStats] = await Promise.all([
		fetchSessionStats(viewedGroupId),
		fetchSummaryStats(viewedGroupId),
		fetchSpeciesData(viewedGroupId)
	]);
	return { sessionDates, summaryStats, speciesStats };
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
			speciesStats={data.speciesStats}
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
