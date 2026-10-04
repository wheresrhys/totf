import type { CoreStatsResult } from '@/app/models/db';
import type { SpeciesStatsRow } from '@/app/lib/species-stats';

/**
 * Tab ids for the squashed-month summary page (`/summary/jan`, #1005), in
 * render order. Deliberately Species-first — the opposite of every other
 * summary page's tab order — per #1005's spec.
 *
 * They live here, in a module with no `'use client'` directive, rather than
 * next to each tab's component: `app/(routes)/summary/[yearOrMonth]/page.tsx`
 * needs them server-side to resolve `?tabId=`, and importing them from a
 * client module would make them client references rather than plain strings.
 */
export const SQUASHED_MONTH_SPECIES_TOTALS_TAB_ID = 'species-totals';
export const SQUASHED_MONTH_YEAR_TOTALS_TAB_ID = 'year-totals';
export const SQUASHED_MONTH_SESSION_TOTALS_TAB_ID = 'session-totals';
export const SQUASHED_MONTH_HIGHLIGHTS_TAB_ID = 'highlights';

export const SQUASHED_MONTH_TAB_IDS = [
	SQUASHED_MONTH_SPECIES_TOTALS_TAB_ID,
	SQUASHED_MONTH_YEAR_TOTALS_TAB_ID,
	SQUASHED_MONTH_SESSION_TOTALS_TAB_ID,
	SQUASHED_MONTH_HIGHLIGHTS_TAB_ID
] as const;

/**
 * Shared `params` shape for all 4 of the squashed-month summary page's tabs —
 * the sibling of `SummaryTabParams` for the other three summary route depths.
 *
 * Three of the four tabs have no `dataFetcher` at all: the page already
 * fetches their rows eagerly in `fetchSummarySquashedMonthPageContent` (one
 * squashed-month `core_stats` call each, cheap enough not to be worth
 * deferring), so they arrive here as params rather than being refetched
 * per-tab. Only the Highlights tab fetches on mount, and it reads nothing from
 * these beyond `squashedMonth`.
 */
export type SquashedMonthTabParams = {
	squashedMonth: number;
	// The page's aggregate stats, used as each period table's pinned totals
	// row. `undefined` means "no totals row" (the Species totals tab passes
	// `undefined` through regardless — it has never shown one).
	totalsStats?: CoreStatsResult;
	speciesTotalsForMonth: SpeciesStatsRow[];
	yearTotalsForMonth: CoreStatsResult[];
	sessionTotalsForMonth: CoreStatsResult[];
};
