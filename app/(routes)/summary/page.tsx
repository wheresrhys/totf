import { BootstrapPageData } from '@/app/components/layout/BootstrapPageData';
import { fetchSessionStats } from '@/lib/underlying-stats';
import type { ViewedGroup } from '@/lib/group-slug';
import { SummaryPage as SummaryPageContent } from './_shared';

export type PageData = { sessionDates: string[] };

export async function fetchAllTimeSummaryData(
	_params: Record<string, string>,
	viewedGroupId: number
): Promise<PageData> {
	const { sessionDates } = await fetchSessionStats(viewedGroupId);
	return { sessionDates };
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
