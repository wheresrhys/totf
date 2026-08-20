import { BootstrapPageData } from '@/app/components/layout/BootstrapPageData';
import { fetchSessionStats } from '@/lib/underlying-stats';
import type { ViewedGroup } from '@/lib/group-slug';
import { HighlightsPage as HighlightsPageContent } from '../../_shared';

export type PageParams = { year: string; month: string };
type PageProps = { params: Promise<PageParams> };

export type PageData = { year: number; month: number; sessionDates: string[] };

export async function fetchYearMonthHighlightsData(
	{ year, month }: PageParams,
	viewedGroupId: number
): Promise<PageData> {
	const { sessionDates } = await fetchSessionStats(viewedGroupId);
	const monthPrefix = `${year}-${String(Number(month)).padStart(2, '0')}`;
	return {
		year: Number(year),
		month: Number(month),
		sessionDates: sessionDates.filter(
			(date) => date.slice(0, 7) === monthPrefix
		)
	};
}

function YearMonthHighlights({
	data,
	viewedGroup
}: {
	data: PageData;
	viewedGroup: ViewedGroup;
}) {
	return (
		<HighlightsPageContent
			year={data.year}
			month={data.month}
			sessionDates={data.sessionDates}
			viewedGroupId={viewedGroup.id}
		/>
	);
}

export default async function YearMonthHighlightsPage(
	props: PageProps & { viewedGroup?: ViewedGroup }
) {
	return (
		<BootstrapPageData<PageData, PageProps, PageParams>
			pageProps={props}
			viewedGroup={props.viewedGroup}
			getCacheKeys={(params: PageParams) => [
				'highlights',
				params.year,
				params.month
			]}
			dataFetcher={fetchYearMonthHighlightsData}
			PageComponent={YearMonthHighlights}
		/>
	);
}
