import { startOfMonth, endOfMonth, format } from 'date-fns';
import { notFound } from 'next/navigation';
import {
	BootstrapPage,
	defaultGetParams
} from '@/app/components/layout/BootstrapPage';
import { fetchSummaryStats } from '@/app/actions/summary-stats';
import { fetchPeriodTotals } from '@/app/actions/period-totals';
import { fetchYears } from '@/app/(routes)/species/page';
import {
	readTabIdSearchParam,
	resolveInitialTabId,
	prefetchActiveTabData
} from '@/app/lib/tab-query-param';
// From the plain (non-`'use client'`) prefetcher module, never by dotting into
// a tab's `'use client'` `TabConfig` — see that module's header comment (#1096).
import {
	monthSummaryPrefetchers,
	SESSION_TOTALS_TAB_ID
} from '@/app/components/pages/summary/summary-tab-prefetchers';
import type { SummaryTabParams } from '@/app/components/pages/summary/summary-tab-params';
import { parseMonthAbbreviation } from '@/app/lib/squashed-month';
import type { ViewedGroup } from '@/app/lib/group-slug';
import type { CoreStatsResult } from '@/app/models/db';
import { SummaryPageContent } from '../../PageContent';

// `tabId` (#804, reusing #803's mechanism) is the optional `?tabId=` search
// param, merged alongside the route's `yearOrMonth`/`month` params — it never
// affects `getCacheKeys`, only which tab `SummaryTotalsSection`
// focuses/loads first.
export type PageParams = { yearOrMonth: string; month: string; tabId?: string };
type RouteParams = { yearOrMonth: string; month: string };
type PageProps = {
	params: Promise<RouteParams>;
	searchParams?: Promise<{ tabId?: string }>;
};

async function getSummaryYearMonthPageParams(
	pageProps: PageProps
): Promise<PageParams> {
	const { yearOrMonth, month } = await defaultGetParams<PageProps, RouteParams>(
		pageProps
	);
	const tabId = await readTabIdSearchParam(pageProps.searchParams);
	return { yearOrMonth, month, ...(tabId ? { tabId } : {}) };
}

export type PageData = {
	year: number;
	month: number;
	summaryStats: CoreStatsResult | null;
	sessionTotals: CoreStatsResult[];
	fromDate: string;
	toDate: string;
	years: number[];
	initialTabData?: { tabId: string; data: unknown };
};

export async function fetchSummaryYearMonthPageContent(
	{ yearOrMonth, month, tabId }: PageParams,
	_unusedGroupId: number,
	viewedGroup: ViewedGroup
): Promise<PageData> {
	// A squashed month (e.g. `/summary/jan/5`) has no single year to drill a
	// specific day-range into — this nested route only makes sense under a
	// real calendar year.
	if (parseMonthAbbreviation(yearOrMonth) !== undefined) {
		notFound();
	}
	const year = yearOrMonth;
	const monthDate = new Date(Number(year), Number(month) - 1, 1);
	const fromDate = format(startOfMonth(monthDate), 'yyyy-MM-dd');
	const toDate = format(endOfMonth(monthDate), 'yyyy-MM-dd');
	const [summaryStats, sessionTotals, years] = await Promise.all([
		fetchSummaryStats(viewedGroup, fromDate, toDate),
		fetchPeriodTotals(viewedGroup, 'day', fromDate, toDate),
		fetchYears(viewedGroup)
	]);
	const activeTabId = resolveInitialTabId(
		tabId,
		monthSummaryPrefetchers.map((tab) => tab.id),
		SESSION_TOTALS_TAB_ID
	);
	// `totalsStats` is never read by any `dataFetcher` (display-only), so its
	// value here is irrelevant to fetch correctness.
	const initialTabData = await prefetchActiveTabData<
		SummaryTabParams,
		SummaryTabParams[]
	>(
		monthSummaryPrefetchers,
		activeTabId,
		{
			fromDate,
			toDate,
			year: Number(year),
			month: Number(month),
			totalsStats: undefined
		},
		viewedGroup
	);
	return {
		year: Number(year),
		month: Number(month),
		summaryStats,
		sessionTotals,
		fromDate,
		toDate,
		years,
		initialTabData
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
			years={data.years}
			initialTabId={params.tabId}
			initialTabData={data.initialTabData}
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
				params.yearOrMonth,
				params.month
			]}
			dataFetcher={fetchSummaryYearMonthPageContent}
			PageComponent={YearMonthSummary}
		/>
	);
}
