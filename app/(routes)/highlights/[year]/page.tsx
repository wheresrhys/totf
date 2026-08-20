import { BootstrapPageData } from '@/app/components/layout/BootstrapPageData';
import { fetchSessionStats } from '@/lib/underlying-stats';
import type { ViewedGroup } from '@/lib/group-slug';
import { HighlightsPage as HighlightsPageContent } from '../_shared';

export type PageParams = { year: string };
type PageProps = { params: Promise<PageParams> };

export type PageData = { year: number; sessionDates: string[] };

export async function fetchYearHighlightsData(
	{ year }: PageParams,
	viewedGroupId: number
): Promise<PageData> {
	const { sessionDates } = await fetchSessionStats(viewedGroupId);
	return {
		year: Number(year),
		sessionDates: sessionDates.filter((date) => date.slice(0, 4) === year)
	};
}

function YearHighlights({
	data,
	viewedGroup
}: {
	data: PageData;
	viewedGroup: ViewedGroup;
}) {
	return (
		<HighlightsPageContent
			year={data.year}
			sessionDates={data.sessionDates}
			viewedGroupId={viewedGroup.id}
		/>
	);
}

export default async function YearHighlightsPage(
	props: PageProps & { viewedGroup?: ViewedGroup }
) {
	return (
		<BootstrapPageData<PageData, PageProps, PageParams>
			pageProps={props}
			viewedGroup={props.viewedGroup}
			getCacheKeys={(params: PageParams) => ['highlights', params.year]}
			dataFetcher={fetchYearHighlightsData}
			PageComponent={YearHighlights}
		/>
	);
}
