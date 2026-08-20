import { BootstrapPageData } from '@/app/components/layout/BootstrapPageData';
import { fetchSessionStats } from '@/lib/underlying-stats';
import type { ViewedGroup } from '@/lib/group-slug';
import { HighlightsPage as HighlightsPageContent } from './_shared';

export type PageData = { sessionDates: string[] };

export async function fetchAllTimeHighlightsData(
	_params: Record<string, string>,
	viewedGroupId: number
): Promise<PageData> {
	const { sessionDates } = await fetchSessionStats(viewedGroupId);
	return { sessionDates };
}

function AllTimeHighlights({
	data,
	viewedGroup
}: {
	data: PageData;
	viewedGroup: ViewedGroup;
}) {
	return (
		<HighlightsPageContent
			sessionDates={data.sessionDates}
			viewedGroup={viewedGroup}
		/>
	);
}

export default async function HighlightsPage({
	viewedGroup
}: {
	viewedGroup?: ViewedGroup;
} = {}) {
	return (
		<BootstrapPageData<PageData>
			viewedGroup={viewedGroup}
			getCacheKeys={() => ['highlights']}
			dataFetcher={fetchAllTimeHighlightsData}
			PageComponent={AllTimeHighlights}
		/>
	);
}
