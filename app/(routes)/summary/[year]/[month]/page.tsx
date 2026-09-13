import { startOfMonth, endOfMonth, format } from 'date-fns';
import {
	BootstrapPage,
	defaultGetParams
} from '@/app/components/layout/BootstrapPage';
import { fetchSummaryStats } from '@/app/actions/summary-stats';
import { fetchPeriodTotals } from '@/app/actions/period-totals';
import { readTabIdSearchParam } from '@/app/lib/tab-query-param';
import type { ViewedGroup } from '@/app/lib/group-slug';
import type { CoreStatsResult } from '@/app/models/db';
import { SummaryPageContent } from '../../PageContent';

// `tabId` (#804, reusing #803's mechanism) is the optional `?tabId=` search
// param, merged alongside the route's `year`/`month` params — it never
// affects `getCacheKeys`, only which tab `SummaryTotalsSection`
// focuses/loads first.
export type PageParams = { year: string; month: string; tabId?: string };
type RouteParams = { year: string; month: string };
type PageProps = {
	params: Promise<RouteParams>;
	searchParams?: Promise<{ tabId?: string }>;
};

async function getSummaryYearMonthPageParams(
	pageProps: PageProps
): Promise<PageParams> {
	const { year, month } = await defaultGetParams<PageProps, RouteParams>(
		pageProps
	);
	const tabId = await readTabIdSearchParam(pageProps.searchParams);
	return { year, month, ...(tabId ? { tabId } : {}) };
}

export type PageData = {
	year: number;
	month: number;
	summaryStats: CoreStatsResult | null;
	sessionTotals: CoreStatsResult[];
	fromDate: string;
	toDate: string;
};

export async function fetchSummaryYearMonthPageContent(
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
			month={data.month}
			summaryStats={data.summaryStats}
			sessionTotals={data.sessionTotals}
			viewedGroup={viewedGroup}
			fromDate={data.fromDate}
			toDate={data.toDate}
			initialTabId={params.tabId}
		/>
	);
}

export default async function YearMonthSummaryPage(
	props: PageProps & { viewedGroup?: ViewedGroup }
) {
	return (
		<BootstrapPage<PageData, PageProps, PageParams>
			pageProps={props}
			viewedGroup={props.viewedGroup}
			getParams={getSummaryYearMonthPageParams}
			getCacheKeys={(params: PageParams) => [
				'summary',
				params.year,
				params.month
			]}
			dataFetcher={fetchSummaryYearMonthPageContent}
			PageComponent={YearMonthSummary}
		/>
	);
}
