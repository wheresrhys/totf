import {
	BootstrapPage,
	defaultGetParams
} from '@/app/components/layout/BootstrapPage';
import {
	fetchSummaryStats,
	fetchPeriodStats
} from '@/app/actions/summary-stats';
import { readTabIdSearchParam } from '@/app/lib/tab-query-param';
import type { ViewedGroup } from '@/app/lib/group-slug';
import type { AggregateStatsResult } from '@/app/models/db';
import {
	buildMonthTotalsRows,
	type MonthTotalsRow
} from '@/app/lib/month-totals';
import { SummaryPageContent } from '../PageContent';

// `tabId` (#804, reusing #803's mechanism) is the optional `?tabId=` search
// param, merged alongside the route's `year` param — it never affects
// `getCacheKeys`, only which tab `SummaryTotalsSection` focuses/loads first.
export type PageParams = { year: string; tabId?: string };
type RouteParams = { year: string };
type PageProps = {
	params: Promise<RouteParams>;
	searchParams?: Promise<{ tabId?: string }>;
};

async function getSummaryYearPageParams(
	pageProps: PageProps
): Promise<PageParams> {
	const { year } = await defaultGetParams<PageProps, RouteParams>(pageProps);
	const tabId = await readTabIdSearchParam(pageProps.searchParams);
	return { year, ...(tabId ? { tabId } : {}) };
}

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
	params,
	data,
	viewedGroup
}: {
	params: PageParams;
	data: PageData;
	viewedGroup: ViewedGroup;
}) {
	return (
		<SummaryPageContent
			year={data.year}
			summaryStats={data.summaryStats}
			monthTotals={data.monthTotals}
			viewedGroup={viewedGroup}
			fromDate={data.fromDate}
			toDate={data.toDate}
			initialTabId={params.tabId}
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
			getParams={getSummaryYearPageParams}
			getCacheKeys={(params: PageParams) => ['summary', params.year]}
			dataFetcher={fetchSummaryYearPageContent}
			PageComponent={YearSummary}
		/>
	);
}
