import { startOfMonth, endOfMonth, format } from 'date-fns';
import { BootstrapPageData } from '@/app/components/layout/BootstrapPageData';
import { fetchSummaryStats } from '@/app/actions/summary-stats';
import { fetchPeriodTotals } from '@/app/actions/period-totals';
import type { ViewedGroup } from '@/lib/group-slug';
import type { AggregateStatsResult } from '@/app/models/db';
import { SummaryPage as SummaryPageContent } from '../../_shared';

export type PageParams = { year: string; month: string };
type PageProps = { params: Promise<PageParams> };

export type PageData = {
	year: number;
	month: number;
	summaryStats: AggregateStatsResult | null;
	sessionTotals: AggregateStatsResult[];
	fromDate: string;
	toDate: string;
};

export async function fetchYearMonthSummaryData(
	{ year, month }: PageParams,
	viewedGroupId: number
): Promise<PageData> {
	const monthDate = new Date(Number(year), Number(month) - 1, 1);
	const fromDate = format(startOfMonth(monthDate), 'yyyy-MM-dd');
	const toDate = format(endOfMonth(monthDate), 'yyyy-MM-dd');
	const [summaryStats, sessionTotals] = await Promise.all([
		fetchSummaryStats(viewedGroupId, fromDate, toDate),
		fetchPeriodTotals(viewedGroupId, 'day', fromDate, toDate)
	]);
	return {
		year: Number(year),
		month: Number(month),
		summaryStats,
		sessionTotals,
		fromDate,
		toDate
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
			summaryStats={data.summaryStats}
			sessionTotals={data.sessionTotals}
			viewedGroup={viewedGroup}
			fromDate={data.fromDate}
			toDate={data.toDate}
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
