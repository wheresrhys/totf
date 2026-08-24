import { BootstrapPageData } from '@/app/components/layout/BootstrapPageData';
import { fetchSessionStats } from '@/lib/underlying-stats';
import type { ViewedGroup } from '@/lib/group-slug';
import { SummaryPage as SummaryPageContent } from '../../_shared';

export type PageParams = { year: string; month: string };
type PageProps = { params: Promise<PageParams> };

export type PageData = { year: number; month: number; sessionDates: string[] };

export async function fetchYearMonthSummaryData(
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

function YearMonthSummary({
	data,
	viewedGroup
}: {
	data: PageData;
	viewedGroup: ViewedGroup;
}) {
	return (
		<SummaryPageContent
			year={data.year}
			month={data.month}
			sessionDates={data.sessionDates}
			viewedGroup={viewedGroup}
		/>
	);
}

export default async function YearMonthSummaryPage(
	props: PageProps & { viewedGroup?: ViewedGroup }
) {
	return (
		<BootstrapPageData<PageData, PageProps, PageParams>
			pageProps={props}
			viewedGroup={props.viewedGroup}
			getCacheKeys={(params: PageParams) => [
				'summary',
				params.year,
				params.month
			]}
			dataFetcher={fetchYearMonthSummaryData}
			PageComponent={YearMonthSummary}
		/>
	);
}
