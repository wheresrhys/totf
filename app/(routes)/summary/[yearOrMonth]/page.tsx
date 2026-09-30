import {
	BootstrapPage,
	defaultGetParams
} from '@/app/components/layout/BootstrapPage';
import {
	fetchSummaryStats,
	fetchPeriodStats
} from '@/app/actions/summary-stats';
import { fetchSpeciesData } from '@/app/actions/spp-data';
import { readTabIdSearchParam } from '@/app/lib/tab-query-param';
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
	  }
	| {
			squashedMonth: number;
			summaryStats: CoreStatsResult | null;
			speciesTotalsForMonth: SpeciesStatsRow[];
			yearTotalsForMonth: CoreStatsResult[];
			sessionTotalsForMonth: CoreStatsResult[];
	  };

async function fetchSummarySquashedMonthPageContent(
	squashedMonth: number,
	viewedGroupId: number
): Promise<PageData> {
	const [
		summaryStats,
		speciesTotalsForMonth,
		yearTotalsForMonth,
		sessionTotalsForMonth
	] = await Promise.all([
		fetchSummaryStats(viewedGroupId, undefined, undefined, squashedMonth),
		fetchSpeciesData(viewedGroupId, undefined, undefined, squashedMonth),
		fetchPeriodStats(
			viewedGroupId,
			'year',
			undefined,
			undefined,
			squashedMonth
		),
		fetchPeriodStats(viewedGroupId, 'day', undefined, undefined, squashedMonth)
	]);
	return {
		squashedMonth,
		summaryStats,
		speciesTotalsForMonth,
		yearTotalsForMonth,
		sessionTotalsForMonth
	};
}

export async function fetchSummaryYearOrMonthPageContent(
	{ yearOrMonth }: PageParams,
	viewedGroupId: number
): Promise<PageData> {
	const squashedMonth = parseMonthAbbreviation(yearOrMonth);
	if (squashedMonth !== undefined) {
		return fetchSummarySquashedMonthPageContent(squashedMonth, viewedGroupId);
	}
	const fromDate = `${yearOrMonth}-01-01`;
	const toDate = `${yearOrMonth}-12-31`;
	const [summaryStats, monthlyStats] = await Promise.all([
		fetchSummaryStats(viewedGroupId, fromDate, toDate),
		fetchPeriodStats(viewedGroupId, 'month', fromDate, toDate)
	]);
	return {
		year: Number(yearOrMonth),
		summaryStats,
		monthTotals: buildMonthTotalsRows(Number(yearOrMonth), monthlyStats),
		fromDate,
		toDate
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
