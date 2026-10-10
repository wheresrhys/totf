// The summary pages' tab ids, `dataFetcher`s, and the per-route-depth
// descriptor lists `prefetchActiveTabData` is handed server-side (#1096).
//
// **Deliberately not a `'use client'` module.** Every `summary/**/page.tsx` is
// a Server Component, and anything imported into one from a `'use client'`
// file is a *client reference*, not the real value — dotting into it yields
// `undefined` rather than the property, silently and without throwing. Before
// #1096 these lists were built by dotting `.id`/`.dataFetcher` off the
// `'use client'`-exported `TabConfig` objects (`SummarySpeciesTotalsTab.tsx`
// et al.), so server-side every id read back as `undefined`:
// `resolveInitialTabId` saw a `knownTabIds` array of `undefined`s and fell
// back to the page default for *every* `?tabId=`, and
// `prefetchActiveTabData`'s `tabs.find(...)` matched nothing, so no summary
// tab was ever prefetched. Vitest imports modules directly with no
// client-reference boundary, so the whole suite passed throughout.
//
// The ids and fetchers therefore live here, and the `'use client'` tab modules
// import them from here rather than the other way round — the same shape
// `species-tabs.ts` and `session-tab-config.ts` already use.
import { fetchSpeciesData } from '@/app/actions/spp-data';
import { fetchPeriodTotals } from '@/app/actions/period-totals';
import {
	fetchPeriodStats,
	fetchCombinedMonthTotals
} from '@/app/actions/summary-stats';
import {
	getHighlightsWithinTimeWindow,
	getCondensedHighlightsAtTimePeriod,
	getCondensedHighlightsWithinTimeWindow
} from '@/app/lib/highlights';
import type { TabConfig } from '@/app/components/shared/TabContent';
import type { ViewedGroup } from '@/app/lib/group-slug';
import type { CoreStatsResult } from '@/app/models/db';
import type { SpeciesStatsRow } from '@/app/lib/species-stats';
import type { SummaryTabParams } from './summary-tab-params';

export const YEAR_TOTALS_TAB_ID = 'year-totals';
export const MONTH_TOTALS_TAB_ID = 'month-totals';
export const ALL_TIME_MONTH_TOTALS_TAB_ID = 'all-time-month-totals';
export const SESSION_TOTALS_TAB_ID = 'session-totals';
export const SPECIES_TOTALS_TAB_ID = 'species-totals';
export const HIGHLIGHTS_TAB_ID = 'highlights';

export type SummarySpeciesTotalsData = SpeciesStatsRow[];

export function fetchSummarySpeciesTotalsData(
	params: SummaryTabParams,
	viewedGroup: ViewedGroup
): Promise<SummarySpeciesTotalsData> {
	return fetchSpeciesData(viewedGroup, params.fromDate, params.toDate);
}

export type SummarySessionTotalsData = CoreStatsResult[];

export function fetchSummarySessionTotalsData(
	params: SummaryTabParams,
	viewedGroup: ViewedGroup
): Promise<SummarySessionTotalsData> {
	return fetchPeriodTotals(viewedGroup, 'day', params.fromDate, params.toDate);
}

export async function fetchAllTimeMonthTotalsData(
	_params: SummaryTabParams,
	viewedGroup: ViewedGroup
) {
	const [periodStats, monthSquashedStats] = await Promise.all([
		fetchPeriodStats(viewedGroup, 'month'),
		fetchCombinedMonthTotals(viewedGroup)
	]);
	return { periodStats, monthSquashedStats };
}

export type SummaryAllTimeMonthTotalsData = Awaited<
	ReturnType<typeof fetchAllTimeMonthTotalsData>
>;

export async function fetchSummaryHighlightsData(
	params: SummaryTabParams,
	viewedGroup: ViewedGroup
) {
	const { year, month } = params;
	const [daily, monthly, local] = await Promise.all([
		getHighlightsWithinTimeWindow({
			temporalUnit: 'day',
			groupId: viewedGroup.id,
			parentTimeWindow: {
				year,
				month: month
			},
			includePerSpecies: false
		}),

		month
			? []
			: getHighlightsWithinTimeWindow({
					temporalUnit: 'month',
					groupId: viewedGroup.id,
					parentTimeWindow: {
						year,
						month: month
					},
					includePerSpecies: false
				}),
		year
			? getCondensedHighlightsAtTimePeriod(
					viewedGroup.id,
					`${year}-${String(month).padStart(2, '0') ?? '01'}-01`,
					month ? 'month' : 'year',
					1
				)
			: []
		// year
		// 	? getCondensedHighlightsWithinTimeWindow(
		// 			viewedGroup.id,
		// 			{ year, month },
		// 			'day'
		// 		)
		// 	: [],
		// month
		// 	? []
		// 	: getCondensedHighlightsWithinTimeWindow(
		// 			viewedGroup.id,
		// 			{ year, month },
		// 			'month'
		// 		),
		// month || year
		// 	? []
		// 	: getCondensedHighlightsWithinTimeWindow(
		// 			viewedGroup.id,
		// 			{ year, month },
		// 			'year'
		// 		)
	]);
	return {
		sessionHighlights: daily,
		monthHighlights: monthly,
		localHighlights: local
	};
}

export type SummaryHighlightsData = Awaited<
	ReturnType<typeof fetchSummaryHighlightsData>
>;

/**
 * One tab's entry in a `prefetchActiveTabData` call — exactly the three
 * properties it reads, and nothing else. The `label`/`TabComponent` halves of
 * each tab stay in their `'use client'` modules, where they belong.
 */
type SummaryTabPrefetcher = Pick<
	TabConfig<unknown, SummaryTabParams>,
	'id' | 'dataFetcher' | 'clientSideOnly'
>;

/**
 * Highlights: prefetch-exempt on every summary page, matching the session
 * page's Highlights tab (`session-tab-config.ts`). Highlights are generated
 * client-side on purpose (see `app/CLAUDE.md`, #1089), and a `CombinedHighlight`
 * carries its printers as function properties, so the prefetched payload could
 * never cross the server→client boundary into `SummaryTotalsSection` intact
 * anyway. This preserves exactly the behaviour the broken client-reference
 * wiring happened to produce: the tab opens focused and fetches on mount.
 */
const summaryHighlightsPrefetcher: SummaryTabPrefetcher = {
	id: HIGHLIGHTS_TAB_ID,
	dataFetcher: fetchSummaryHighlightsData,
	clientSideOnly: true
};

const summarySpeciesTotalsPrefetcher: SummaryTabPrefetcher = {
	id: SPECIES_TOTALS_TAB_ID,
	dataFetcher: fetchSummarySpeciesTotalsData
};

const summarySessionTotalsPrefetcher: SummaryTabPrefetcher = {
	id: SESSION_TOTALS_TAB_ID,
	dataFetcher: fetchSummarySessionTotalsData
};

const summaryAllTimeMonthTotalsPrefetcher: SummaryTabPrefetcher = {
	id: ALL_TIME_MONTH_TOTALS_TAB_ID,
	dataFetcher: fetchAllTimeMonthTotalsData
};

/**
 * Mirrors `SummaryTotalsSection`'s own `tabs` array for the all-time page
 * shape (`yearlyTotals` always set, `showAllTimeMonthTotals` always true,
 * session totals always lazy since that page never supplies `sessionTotals`) —
 * `'year-totals'` has no `dataFetcher` since Year totals stays eager/inline,
 * so `prefetchActiveTabData` simply no-ops for it.
 */
export const allTimeSummaryPrefetchers: SummaryTabPrefetcher[] = [
	{ id: YEAR_TOTALS_TAB_ID },
	summaryAllTimeMonthTotalsPrefetcher,
	summarySessionTotalsPrefetcher,
	summarySpeciesTotalsPrefetcher,
	summaryHighlightsPrefetcher
];

/**
 * The year page shape: `monthTotals` always set (so Month totals is the eager,
 * `dataFetcher`-less variant), no all-time Month totals tab, session totals
 * lazy.
 */
export const yearSummaryPrefetchers: SummaryTabPrefetcher[] = [
	{ id: MONTH_TOTALS_TAB_ID },
	summarySessionTotalsPrefetcher,
	summarySpeciesTotalsPrefetcher,
	summaryHighlightsPrefetcher
];

/**
 * The year+month page shape: `sessionTotals` is supplied eagerly, so Session
 * totals is the eager variant with no `dataFetcher` and the lazy
 * `summarySessionTotalsTab` never appears on that page at all. No
 * `all-time-month-totals` tab there either.
 */
export const monthSummaryPrefetchers: SummaryTabPrefetcher[] = [
	{ id: SESSION_TOTALS_TAB_ID },
	summarySpeciesTotalsPrefetcher,
	summaryHighlightsPrefetcher
];
