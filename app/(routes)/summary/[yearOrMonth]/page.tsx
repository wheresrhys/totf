import {
	BootstrapPage,
	defaultGetParams
} from '@/app/components/layout/BootstrapPage';
import {
	fetchSummaryStats,
	fetchPeriodStats
} from '@/app/actions/summary-stats';
import { fetchSpeciesData } from '@/app/actions/spp-data';
import {
	readTabIdSearchParam,
	resolveInitialTabId,
	prefetchActiveTabData
} from '@/app/lib/tab-query-param';
import type { TabConfig } from '@/app/components/shared/TabContent';
// From the plain (non-`'use client'`) prefetcher module, never by dotting into
// a tab's `'use client'` `TabConfig` — see that module's header comment (#1096).
import {
	yearSummaryPrefetchers,
	MONTH_TOTALS_TAB_ID
} from '@/app/components/pages/summary/summary-tab-prefetchers';
import type { SummaryTabParams } from '@/app/components/pages/summary/summary-tab-params';
import {
	SQUASHED_MONTH_TAB_IDS,
	SQUASHED_MONTH_SPECIES_TOTALS_TAB_ID,
	type SquashedMonthTabParams
} from '@/app/components/pages/summary/squashed-month-tab-params';
import { parseMonthAbbreviation } from '@/app/lib/squashed-month';
import type { ViewedGroup } from '@/app/lib/group-slug';
import type { CoreStatsResult } from '@/app/models/db';
import type { SpeciesStatsRow } from '@/app/lib/species-stats';
import {
	buildMonthTotalsRows,
	type MonthTotalsRow
} from '@/app/lib/month-totals';
import { SummaryPageContent } from '../PageContent';

// `tabId` (#804, reusing #803's mechanism) is the optional `?tabId=` search
// param, merged alongside the route's `yearOrMonth` param — it never affects
// `getCacheKeys`, only which tab focuses/loads first.
export type PageParams = { yearOrMonth: string; tabId?: string };
type RouteParams = { yearOrMonth: string };
type PageProps = {
	params: Promise<RouteParams>;
	searchParams?: Promise<{ tabId?: string }>;
};

async function getSummaryYearOrMonthPageParams(
	pageProps: PageProps
): Promise<PageParams> {
	const { yearOrMonth } = await defaultGetParams<PageProps, RouteParams>(
		pageProps
	);
	const tabId = await readTabIdSearchParam(pageProps.searchParams);
	return { yearOrMonth, ...(tabId ? { tabId } : {}) };
}

// A real calendar year (`yearOrMonth` didn't parse as a month abbreviation —
// existing behaviour, unchanged) vs. a "squashed month" (every occurrence of
// that calendar month across the group's whole history, #1005) — the two
// variants a `[yearOrMonth]` segment can resolve to.
export type PageData =
	| {
			year: number;
			summaryStats: CoreStatsResult | null;
			monthTotals: MonthTotalsRow[];
			fromDate: string;
			toDate: string;
			initialTabData?: { tabId: string; data: unknown };
	  }
	| {
			squashedMonth: number;
			summaryStats: CoreStatsResult | null;
			speciesTotalsForMonth: SpeciesStatsRow[];
			yearTotalsForMonth: CoreStatsResult[];
			sessionTotalsForMonth: CoreStatsResult[];
			initialTabData?: { tabId: string; data: unknown };
	  };

// The squashed-month variant's 4 tabs (`SquashedMonthSummaryTotalsSection`),
// for `resolveInitialTabId`/`prefetchActiveTabData`. Every entry is id-only:
//  - Species/Year/Session totals have no `dataFetcher` by design — this page's
//    own fetch below already has their rows, which reach them through
//    `TabSet`'s shared params.
//  - Highlights does have a `dataFetcher`, deliberately not offered here:
//    highlights generation is a client-side decision (#1089), and
//    `squashedMonthHighlightsTab` is `clientSideOnly` accordingly, so
//    `prefetchActiveTabData` would decline to run it even if it were listed.
// The ids themselves come from `squashed-month-tab-params.ts`, a plain module,
// so they are real strings here rather than client references (#1096).
// So the prefetch below always resolves to `undefined` today, and the
// `?tabId=`-focused tab fetches for itself on mount, as it did before.
const squashedMonthSummaryTabs: Pick<
	TabConfig<unknown, SquashedMonthTabParams>,
	'id' | 'dataFetcher'
>[] = SQUASHED_MONTH_TAB_IDS.map((id) => ({ id }));

async function fetchSummarySquashedMonthPageContent(
	squashedMonth: number,
	tabId: string | undefined,
	viewedGroup: ViewedGroup
): Promise<PageData> {
	const [
		summaryStats,
		speciesTotalsForMonth,
		yearTotalsForMonth,
		sessionTotalsForMonth
	] = await Promise.all([
		fetchSummaryStats(viewedGroup, undefined, undefined, squashedMonth),
		fetchSpeciesData(viewedGroup, undefined, undefined, squashedMonth),
		fetchPeriodStats(viewedGroup, 'year', undefined, undefined, squashedMonth),
		fetchPeriodStats(viewedGroup, 'day', undefined, undefined, squashedMonth)
	]);
	const activeTabId = resolveInitialTabId(
		tabId,
		SQUASHED_MONTH_TAB_IDS,
		SQUASHED_MONTH_SPECIES_TOTALS_TAB_ID
	);
	const initialTabData = await prefetchActiveTabData(
		squashedMonthSummaryTabs,
		activeTabId,
		{
			squashedMonth,
			totalsStats: undefined,
			speciesTotalsForMonth,
			yearTotalsForMonth,
			sessionTotalsForMonth
		},
		viewedGroup
	);
	return {
		squashedMonth,
		summaryStats,
		speciesTotalsForMonth,
		yearTotalsForMonth,
		sessionTotalsForMonth,
		initialTabData
	};
}

export async function fetchSummaryYearOrMonthPageContent(
	{ yearOrMonth, tabId }: PageParams,
	viewedGroup: ViewedGroup
): Promise<PageData> {
	const squashedMonth = parseMonthAbbreviation(yearOrMonth);
	if (squashedMonth !== undefined) {
		return fetchSummarySquashedMonthPageContent(
			squashedMonth,
			tabId,
			viewedGroup
		);
	}
	const fromDate = `${yearOrMonth}-01-01`;
	const toDate = `${yearOrMonth}-12-31`;
	const year = Number(yearOrMonth);
	const [summaryStats, monthlyStats] = await Promise.all([
		fetchSummaryStats(viewedGroup, fromDate, toDate),
		fetchPeriodStats(viewedGroup, 'month', fromDate, toDate)
	]);
	const activeTabId = resolveInitialTabId(
		tabId,
		yearSummaryPrefetchers.map((tab) => tab.id),
		MONTH_TOTALS_TAB_ID
	);
	// `totalsStats` is never read by any `dataFetcher` (display-only), so its
	// value here is irrelevant to fetch correctness.
	const initialTabData = await prefetchActiveTabData<
		SummaryTabParams,
		SummaryTabParams[]
	>(
		yearSummaryPrefetchers,
		activeTabId,
		{ fromDate, toDate, year, totalsStats: undefined },
		viewedGroup
	);
	return {
		year,
		summaryStats,
		monthTotals: buildMonthTotalsRows(year, monthlyStats),
		fromDate,
		toDate,
		initialTabData
	};
}

function YearOrMonthSummary({
	params,
	data,
	viewedGroup
}: {
	params: PageParams;
	data: PageData;
	viewedGroup: ViewedGroup;
}) {
	if ('squashedMonth' in data) {
		return (
			<SummaryPageContent
				squashedMonth={data.squashedMonth}
				summaryStats={data.summaryStats}
				speciesTotalsForMonth={data.speciesTotalsForMonth}
				yearTotalsForMonth={data.yearTotalsForMonth}
				sessionTotalsForMonth={data.sessionTotalsForMonth}
				viewedGroup={viewedGroup}
				initialTabId={params.tabId}
				initialTabData={data.initialTabData}
			/>
		);
	}
	return (
		<SummaryPageContent
			year={data.year}
			summaryStats={data.summaryStats}
			monthTotals={data.monthTotals}
			viewedGroup={viewedGroup}
			fromDate={data.fromDate}
			toDate={data.toDate}
			initialTabId={params.tabId}
			initialTabData={data.initialTabData}
		/>
	);
}

export default async function YearOrMonthSummaryPage(
	props: PageProps & { viewedGroup?: ViewedGroup }
) {
	return (
		<BootstrapPage<PageData, PageProps, PageParams>
			pageProps={props}
			viewedGroup={props.viewedGroup}
			getParams={getSummaryYearOrMonthPageParams}
			getCacheKeys={(params: PageParams) => ['summary', params.yearOrMonth]}
			dataFetcher={fetchSummaryYearOrMonthPageContent}
			PageComponent={YearOrMonthSummary}
		/>
	);
}
