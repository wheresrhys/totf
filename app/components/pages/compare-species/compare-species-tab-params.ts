// The species-comparison page's tab wiring that both sides of the
// server/client boundary need: the tab ids, the page's default tab, the shared
// `params` shape every tab is handed, and the test id both datasets' tables
// render under.
//
// Deliberately **not** a `'use client'` module: `page.tsx` is a server
// component and needs the ids for `resolveInitialTabId`/`prefetchActiveTabData`
// before anything renders, and anything imported from a `'use client'` module
// into a server module is a client reference rather than a plain value (see
// `app/CLAUDE.md`'s "Where a page's tab ids live").
import type { BiometricsStatsResult, CoreStatsResult } from '@/app/models/db';

export const CORE_DATASET_TAB_ID = 'core';
export const BIOMETRICS_DATASET_TAB_ID = 'biometrics';

/**
 * Every dataset tab this page has, in display order — `core` first, so it is
 * both the leftmost tab and the `?tabId=` fallback.
 */
export const COMPARE_SPECIES_TAB_IDS = [
	CORE_DATASET_TAB_ID,
	BIOMETRICS_DATASET_TAB_ID
] as const;

/** Both dataset tables render under the same test id — only one is ever active. */
export const COMPARISON_TABLE_TEST_ID = 'species-comparison-table';

/**
 * The one `params` object `TabSet` hands to both dataset tabs. Neither tab has
 * a `dataFetcher`: `fetchSpeciesComparisonStats` already fetches both datasets
 * page-wide in a single call (see its own "fetched up front rather than per
 * dataset-toggle" rationale), so there is nothing left to fetch per tab and the
 * rows are threaded through here instead. `selectedSpecies` is the live
 * client-side pill selection, so switching tab keeps the current comparison.
 */
export type CompareSpeciesTabParams = {
	coreStats: CoreStatsResult[];
	biometricsStats: BiometricsStatsResult[];
	selectedSpecies: string[];
};
