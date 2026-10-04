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
import type { TabConfig } from '@/app/components/shared/TabContent';
import { summarySpeciesTotalsTab } from '@/app/components/pages/summary/SummarySpeciesTotalsTab';
import { summaryHighlightsTab } from '@/app/components/pages/summary/SummaryHighlightsTab';
import { summaryAllTimeMonthTotalsTab } from '@/app/components/pages/summary/SummaryAllTimeMonthTotalsTab';
import { summarySessionTotalsTab } from '@/app/components/pages/summary/SummarySessionTotalsTab';
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

// Mirrors `SummaryTotalsSection`'s own `tabs` array for this page shape
// (`yearlyTotals` always set, `showAllTimeMonthTotals` always true, session
// totals always lazy here since this page never supplies `sessionTotals`) —
// `'year-totals'` has no `dataFetcher` since Year totals stays eager/inline,
// so `prefetchActiveTabData` simply no-ops for it.
const YEAR_TOTALS_TAB_ID = 'year-totals';
const allTimeSummaryTabs: Pick<
	TabConfig<unknown, SummaryTabParams>,
	'id' | 'dataFetcher'
>[] = [
	{ id: YEAR_TOTALS_TAB_ID },
	summaryAllTimeMonthTotalsTab,
	summarySessionTotalsTab,
	summarySpeciesTotalsTab,
	summaryHighlightsTab
];

export async function fetchSummaryPageContent(
	params: PageParams,
	viewedGroupId: number
): Promise<PageData> {
	const [summaryStats, yearlyTotals] = await Promise.all([
		fetchSummaryStats(viewedGroupId),
		fetchYearlyTotals(viewedGroupId)
	]);
	const activeTabId = resolveInitialTabId(
		params.tabId,
		allTimeSummaryTabs.map((tab) => tab.id),
		YEAR_TOTALS_TAB_ID
	);
	// `fromDate`/`toDate`/`year`/`month` are all unscoped (undefined) on this
	// all-time page — matches what `SummaryTotalsSection` itself later builds
	// for these same 4 tabs. `totalsStats` is never read by any `dataFetcher`
	// (display-only), so its value here is irrelevant to fetch correctness.
	const initialTabData = await prefetchActiveTabData(
		allTimeSummaryTabs,
		activeTabId,
		{ totalsStats: undefined },
		// No full `ViewedGroup` (with slug) is resolved yet at this point in
		// `BootstrapPage` — only the numeric id. None of these 4 tabs'
		// `dataFetcher`s read `slug`, so `null` (a legitimate `ViewedGroup`
		// value, not a lie) is a safe stand-in rather than re-resolving it here.
		{ id: viewedGroupId, slug: null }
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
