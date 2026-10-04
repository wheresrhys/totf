import type { CoreStatsResult } from '@/app/models/db';
import type { MonthTotalsRow } from '@/app/lib/month-totals';

/**
 * Shared `params` shape for every one of summary's tabs — the original 4
 * `TabSet`-primitive-driven tabs (Species totals, Highlights, All-time Month
 * totals, the lazy variant of Session totals, #1072), plus the 3 prop-fed
 * tabs with no `dataFetcher` of their own that #1067 converged onto the same
 * `TabSet` call (Year totals, year-page Month totals, the eager variant of
 * Session totals).
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
	// The 3 prop-fed tabs' own rows (#1067) — each arrives already-resolved
	// from `SummaryTotalsSection`'s own props, so there's no `dataFetcher` to
	// fetch it; it's threaded through here instead. Each is `undefined` on
	// every page shape that doesn't have that tab at all.
	yearlyTotals?: CoreStatsResult[];
	monthTotals?: MonthTotalsRow[];
	sessionTotals?: CoreStatsResult[];
	// Per-tab totals-row gating (`SummaryTotalsSection`'s `tabsWithTotalsRow`
	// map, carried over unchanged by #1067) — a prop-fed tab's own
	// `TabComponent` looks itself up here by id to decide whether to show
	// `totalsStats` at all, since (unlike the 4 migrated tabs, which get a
	// pre-gated `totalsStats` via their own per-tab `params` override) all 3
	// prop-fed tabs share this same object.
	tabsWithTotalsRow?: Record<string, boolean>;
};
