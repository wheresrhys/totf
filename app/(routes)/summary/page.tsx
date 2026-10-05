import { BootstrapPage } from '@/app/components/layout/BootstrapPage';
import {
	fetchSummaryStats,
	fetchYearlyTotals
} from '@/app/actions/summary-stats';
import { fetchYears } from '@/app/(routes)/species/page';
import {
	readTabIdSearchParam,
	resolveInitialTabId,
	prefetchActiveTabData
} from '@/app/lib/tab-query-param';
// From the plain (non-`'use client'`) prefetcher module, never by dotting into
// a tab's `'use client'` `TabConfig` — see that module's header comment (#1096).
import {
	allTimeSummaryPrefetchers,
	YEAR_TOTALS_TAB_ID
} from '@/app/components/pages/summary/summary-tab-prefetchers';
import type { SummaryTabParams } from '@/app/components/pages/summary/summary-tab-params';
import type { ViewedGroup } from '@/app/lib/group-slug';
import type { CoreStatsResult } from '@/app/models/db';
import { SummaryPageContent } from './PageContent';

// `tabId` (#804, reusing #803's mechanism) is the optional `?tabId=` search
// param — it never affects `getCacheKeys`, only which tab
// `SummaryTotalsSection` focuses/loads first. `fromDate`/`toDate` (#1076) are
// this all-time page's own explicit `TemporalFilterControls` narrowing — the
// only summary route depth with no year/month-derived bounds of its own
// already in play.
export type PageParams = { tabId?: string; fromDate?: string; toDate?: string };
type PageProps = {
	searchParams?: Promise<{
		tabId?: string;
		fromDate?: string;
		toDate?: string;
	}>;
};

export type PageData = {
	summaryStats: CoreStatsResult | null;
	yearlyTotals: CoreStatsResult[];
	years: number[];
	initialTabData?: { tabId: string; data: unknown };
};

async function getSummaryPageParams(pageProps: PageProps): Promise<PageParams> {
	const tabId = await readTabIdSearchParam(pageProps.searchParams);
	const searchParams = (await pageProps.searchParams) ?? {};
	return {
		...(tabId ? { tabId } : {}),
		...(searchParams.fromDate ? { fromDate: searchParams.fromDate } : {}),
		...(searchParams.toDate ? { toDate: searchParams.toDate } : {})
	};
}

export async function fetchSummaryPageContent(
	params: PageParams,
	_unusedGroupId: number,
	viewedGroup: ViewedGroup
): Promise<PageData> {
	const [summaryStats, yearlyTotals, years] = await Promise.all([
		fetchSummaryStats(viewedGroup, params.fromDate, params.toDate),
		fetchYearlyTotals(viewedGroup),
		fetchYears(viewedGroup)
	]);
	const activeTabId = resolveInitialTabId(
		params.tabId,
		allTimeSummaryPrefetchers.map((tab) => tab.id),
		YEAR_TOTALS_TAB_ID
	);
	// `year`/`month` are unscoped (undefined) on this all-time page — matches
	// what `SummaryTotalsSection` itself later builds for these same 4 tabs.
	// `totalsStats` is never read by any `dataFetcher` (display-only), so its
	// value here is irrelevant to fetch correctness.
	const initialTabData = await prefetchActiveTabData<
		SummaryTabParams,
		SummaryTabParams[]
	>(
		allTimeSummaryPrefetchers,
		activeTabId,
		{
			fromDate: params.fromDate,
			toDate: params.toDate,
			totalsStats: undefined
		},
		viewedGroup
	);
	return { summaryStats, yearlyTotals, years, initialTabData };
}

function AllTimeSummary({
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
			summaryStats={data.summaryStats}
			yearlyTotals={data.yearlyTotals}
			years={data.years}
			showAllTimeMonthTotals
			viewedGroup={viewedGroup}
			fromDate={params.fromDate}
			toDate={params.toDate}
			initialTabId={params.tabId}
			initialTabData={data.initialTabData}
		/>
	);
}

export default async function SummaryPage(
	props: PageProps & { viewedGroup?: ViewedGroup } = {}
) {
	return (
		<BootstrapPage<PageData, PageProps, PageParams>
			pageProps={props}
			viewedGroup={props.viewedGroup}
			getParams={getSummaryPageParams}
			getCacheKeys={(params) => ['summary', JSON.stringify(params)]}
			dataFetcher={fetchSummaryPageContent}
			PageComponent={AllTimeSummary}
		/>
	);
}
