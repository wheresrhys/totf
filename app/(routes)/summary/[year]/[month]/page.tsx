import { endOfMonth, format, startOfMonth } from 'date-fns';
import { BootstrapPageData } from '@/app/components/layout/BootstrapPageData';
import { fetchSessionStats } from '@/lib/underlying-stats';
import { fetchSummaryStats } from '@/app/actions/summary-stats';
import type { ViewedGroup } from '@/lib/group-slug';
import type { AggregateStatsResult } from '@/app/models/db';
import { SummaryPage as SummaryPageContent } from '../../_shared';

export type PageParams = { year: string; month: string };
type PageProps = { params: Promise<PageParams> };

export type PageData = {
	year: number;
	month: number;
	sessionDates: string[];
	summaryStats: AggregateStatsResult | null;
};

export async function fetchYearMonthSummaryData(
	{ year, month }: PageParams,
	viewedGroupId: number
): Promise<PageData> {
	const { sessionDates } = await fetchSessionStats(viewedGroupId);
	const monthPrefix = `${year}-${String(Number(month)).padStart(2, '0')}`;
	const monthDate = new Date(Number(year), Number(month) - 1, 1);
	const summaryStats = await fetchSummaryStats(
		viewedGroupId,
		format(startOfMonth(monthDate), 'yyyy-MM-dd'),
		format(endOfMonth(monthDate), 'yyyy-MM-dd')
	);
	return {
		year: Number(year),
		month: Number(month),
		sessionDates: sessionDates.filter(
			(date) => date.slice(0, 7) === monthPrefix
		),
		summaryStats
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
			summaryStats={data.summaryStats}
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
