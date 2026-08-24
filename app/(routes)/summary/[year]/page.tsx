import { BootstrapPageData } from '@/app/components/layout/BootstrapPageData';
import { fetchSessionStats } from '@/lib/underlying-stats';
import type { ViewedGroup } from '@/lib/group-slug';
import { SummaryPage as SummaryPageContent } from '../_shared';

export type PageParams = { year: string };
type PageProps = { params: Promise<PageParams> };

export type PageData = { year: number; sessionDates: string[] };

export async function fetchYearSummaryData(
	{ year }: PageParams,
	viewedGroupId: number
): Promise<PageData> {
	const { sessionDates } = await fetchSessionStats(viewedGroupId);
	return {
		year: Number(year),
		sessionDates: sessionDates.filter((date) => date.slice(0, 4) === year)
	};
}

function YearSummary({
	data,
	viewedGroup
}: {
	data: PageData;
	viewedGroup: ViewedGroup;
}) {
	return (
		<SummaryPageContent
			year={data.year}
			sessionDates={data.sessionDates}
			viewedGroup={viewedGroup}
		/>
	);
}

export default async function YearSummaryPage(
	props: PageProps & { viewedGroup?: ViewedGroup }
) {
	return (
		<BootstrapPageData<PageData, PageProps, PageParams>
			pageProps={props}
			viewedGroup={props.viewedGroup}
			getCacheKeys={(params: PageParams) => ['summary', params.year]}
			dataFetcher={fetchYearSummaryData}
			PageComponent={YearSummary}
		/>
	);
}
