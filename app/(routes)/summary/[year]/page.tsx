import { BootstrapPage } from '@/app/components/layout/BootstrapPage';
import {
	fetchSummaryStats,
	fetchPeriodStats
} from '@/app/actions/summary-stats';
import type { ViewedGroup } from '@/lib/group-slug';
import type { AggregateStatsResult } from '@/app/models/db';
import {
	buildMonthTotalsRows,
	type MonthTotalsRow
} from '@/app/models/month-totals';
import { SummaryPageContent } from '../PageContent';

export type PageParams = { year: string };
type PageProps = { params: Promise<PageParams> };

export type PageData = {
	year: number;
	summaryStats: AggregateStatsResult | null;
	monthTotals: MonthTotalsRow[];
	fromDate: string;
	toDate: string;
};

export async function fetchSummaryYearPageContent(
	{ year }: PageParams,
	viewedGroupId: number
): Promise<PageData> {
	const fromDate = `${year}-01-01`;
	const toDate = `${year}-12-31`;
	const [summaryStats, monthlyStats] = await Promise.all([
		fetchSummaryStats(viewedGroupId, fromDate, toDate),
		fetchPeriodStats(viewedGroupId, 'month', fromDate, toDate)
	]);
	return {
		year: Number(year),
		summaryStats,
		monthTotals: buildMonthTotalsRows(Number(year), monthlyStats),
		fromDate,
		toDate
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
			summaryStats={data.summaryStats}
			monthTotals={data.monthTotals}
			lazySessionTotals
			viewedGroup={viewedGroup}
			fromDate={data.fromDate}
			toDate={data.toDate}
		/>
	);
}

export default async function YearSummaryPage(
	props: PageProps & { viewedGroup?: ViewedGroup }
) {
	return (
		<BootstrapPage<PageData, PageProps, PageParams>
			pageProps={props}
			viewedGroup={props.viewedGroup}
			getCacheKeys={(params: PageParams) => ['summary', params.year]}
			dataFetcher={fetchSummaryYearPageContent}
			PageComponent={YearSummary}
		/>
	);
}
