import type { CoreStatsResult } from '@/app/models/db';

/**
 * Shared `params` shape for all 4 of summary's `TabSet`-primitive-driven tabs
 * (Species totals, Highlights, All-time Month totals, the lazy variant of
 * Session totals, #1072).
 *
 * `TabConfig`/`TabContent` (`app/components/shared/TabContent.tsx`) and
 * `prefetchActiveTabData` (`app/lib/tab-query-param.ts`) are each generic
 * over exactly ONE `ParamsType` per call — a reviewer comment on the PR that
 * landed `TabSet` (#1084, closing #1058) asked for each `TabConfig` to carry
 * its own independent `ParamsType` instead, but that follow-up never
 * actually landed; the single-shared-`ParamsType`-per-call shape below is
 * what's really on `main`. `prefetchActiveTabData` in particular resolves
 * just the one active tab out of a whole page's tab list in one call, so
 * every tab passed into that call has to share a `ParamsType` the call site
 * can type once. Each tab's `dataFetcher`/`TabComponent` below reads only
 * the fields it actually needs and ignores the rest.
 */
export type SummaryTabParams = {
	fromDate?: string;
	toDate?: string;
	year?: number;
	month?: number;
	// Already gated per-tab by the caller (`SummaryTotalsSection`'s
	// `tabsWithTotalsRow`) before being placed here — `undefined` means "no
	// totals row for this tab", not "not yet computed". Never read by any
	// `dataFetcher` below (display-only), so its value during server-side
	// prefetch is irrelevant to fetch correctness.
	totalsStats?: CoreStatsResult;
};
