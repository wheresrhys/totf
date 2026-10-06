import { BootstrapPage } from '@/app/components/layout/BootstrapPage';
import {
	fetchSummaryStats,
	fetchYearlyTotals
} from '@/app/actions/summary-stats';
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
// `SummaryTotalsSection` focuses/loads first.
export type PageParams = { tabId?: string };
type PageProps = { searchParams?: Promise<{ tabId?: string }> };

export type PageData = {
	summaryStats: CoreStatsResult | null;
	yearlyTotals: CoreStatsResult[];
	initialTabData?: { tabId: string; data: unknown };
};

async function getSummaryPageParams(pageProps: PageProps): Promise<PageParams> {
	const tabId = await readTabIdSearchParam(pageProps.searchParams);
	return tabId ? { tabId } : {};
}

export async function fetchSummaryPageContent(
	params: PageParams,
	viewedGroup: ViewedGroup
): Promise<PageData> {
	const [summaryStats, yearlyTotals] = await Promise.all([
		fetchSummaryStats(viewedGroup),
		fetchYearlyTotals(viewedGroup)
	]);
	const activeTabId = resolveInitialTabId(
		params.tabId,
		allTimeSummaryPrefetchers.map((tab) => tab.id),
		YEAR_TOTALS_TAB_ID
	);
	// `fromDate`/`toDate`/`year`/`month` are all unscoped (undefined) on this
	// all-time page — matches what `SummaryTotalsSection` itself later builds
	// for these same 4 tabs. `totalsStats` is never read by any `dataFetcher`
	// (display-only), so its value here is irrelevant to fetch correctness.
	const initialTabData = await prefetchActiveTabData<
		SummaryTabParams,
		SummaryTabParams[]
	>(
		allTimeSummaryPrefetchers,
		activeTabId,
		{ totalsStats: undefined },
		viewedGroup
	);
	return { summaryStats, yearlyTotals, initialTabData };
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
			showAllTimeMonthTotals
			viewedGroup={viewedGroup}
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
			getCacheKeys={() => ['summary']}
			dataFetcher={fetchSummaryPageContent}
			PageComponent={AllTimeSummary}
		/>
	);
}
