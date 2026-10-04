import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import {
	allTimeSummaryPrefetchers,
	yearSummaryPrefetchers,
	monthSummaryPrefetchers,
	YEAR_TOTALS_TAB_ID,
	MONTH_TOTALS_TAB_ID,
	ALL_TIME_MONTH_TOTALS_TAB_ID,
	SESSION_TOTALS_TAB_ID,
	SPECIES_TOTALS_TAB_ID,
	HIGHLIGHTS_TAB_ID
} from '../summary-tab-prefetchers';
import { summarySpeciesTotalsTab } from '../SummarySpeciesTotalsTab';
import { summarySessionTotalsTab } from '../SummarySessionTotalsTab';
import { summaryAllTimeMonthTotalsTab } from '../SummaryAllTimeMonthTotalsTab';
import { summaryHighlightsTab } from '../SummaryHighlightsTab';
import { squashedMonthHighlightsTab } from '../SquashedMonthHighlightsTab';

// #1096. Vitest imports modules directly, with no React Server Components
// client-reference boundary, so it can never observe the failure mode this
// module exists to prevent: a `dataFetcher`/`id` that a Server Component reads
// back as `undefined` because it came from a `'use client'` file. The tests
// below therefore assert on the *source-level* property that guarantees it
// instead — "no `'use client'` directive in anything a `page.tsx` prefetches
// from" — plus the descriptor shapes that depend on it.
const repoRoot = path.resolve(__dirname, '../../../../..');

function readSource(relativePath: string): string {
	return readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function hasUseClientDirective(source: string): boolean {
	return /^\s*(['"])use client\1\s*;?\s*$/m.test(source);
}

describe('server-safety of the modules a summary page.tsx prefetches from', () => {
	it('declares no `use client` directive in the prefetcher module itself', () => {
		expect(
			hasUseClientDirective(
				readSource('app/components/pages/summary/summary-tab-prefetchers.ts')
			)
		).toBe(false);
	});

	it('declares no `use client` directive in the shared params/id modules a page also reads server-side', () => {
		const serverReadModules = [
			'app/components/pages/summary/summary-tab-params.ts',
			'app/components/pages/summary/squashed-month-tab-params.ts'
		];
		for (const modulePath of serverReadModules) {
			expect(hasUseClientDirective(readSource(modulePath))).toBe(false);
		}
	});

	it('has every summary page.tsx import its prefetch descriptor list from the plain module, never from a tab component file', () => {
		const summaryPages = [
			'app/(routes)/summary/page.tsx',
			'app/(routes)/summary/[yearOrMonth]/page.tsx',
			'app/(routes)/summary/[yearOrMonth]/[month]/page.tsx'
		];
		for (const pagePath of summaryPages) {
			const source = readSource(pagePath);
			// A value import (not `import type`) of a tab component module is the
			// exact mistake #1096 fixed — those files are all `'use client'`.
			expect(source).not.toMatch(
				/^import\s+(?!type\b)[^;]*from\s+'[^']*pages\/summary\/Summary[A-Za-z]+Tab'/m
			);
			expect(source).toContain(
				"from '@/app/components/pages/summary/summary-tab-prefetchers'"
			);
		}
	});
});

describe('descriptor lists handed to prefetchActiveTabData', () => {
	const listsByPageShape = {
		'all-time': {
			prefetchers: allTimeSummaryPrefetchers,
			expectedIds: [
				YEAR_TOTALS_TAB_ID,
				ALL_TIME_MONTH_TOTALS_TAB_ID,
				SESSION_TOTALS_TAB_ID,
				SPECIES_TOTALS_TAB_ID,
				HIGHLIGHTS_TAB_ID
			],
			// The tab the page already renders eagerly/inline, so it has nothing
			// to prefetch.
			eagerTabId: YEAR_TOTALS_TAB_ID
		},
		year: {
			prefetchers: yearSummaryPrefetchers,
			expectedIds: [
				MONTH_TOTALS_TAB_ID,
				SESSION_TOTALS_TAB_ID,
				SPECIES_TOTALS_TAB_ID,
				HIGHLIGHTS_TAB_ID
			],
			eagerTabId: MONTH_TOTALS_TAB_ID
		},
		month: {
			prefetchers: monthSummaryPrefetchers,
			expectedIds: [
				SESSION_TOTALS_TAB_ID,
				SPECIES_TOTALS_TAB_ID,
				HIGHLIGHTS_TAB_ID
			],
			eagerTabId: SESSION_TOTALS_TAB_ID
		}
	};

	for (const [
		pageShape,
		{ prefetchers, expectedIds, eagerTabId }
	] of Object.entries(listsByPageShape)) {
		describe(`the ${pageShape} page's tabs`, () => {
			it('lists every tab id, in render order, as a real string', () => {
				expect(prefetchers.map((tab) => tab.id)).toEqual(expectedIds);
			});

			it('gives every lazily-fetched tab a callable dataFetcher and the eager tab none', () => {
				for (const tab of prefetchers) {
					expect(typeof tab.dataFetcher).toBe(
						tab.id === eagerTabId ? 'undefined' : 'function'
					);
				}
			});
		});
	}
});

describe('client-side-only exemptions', () => {
	it('exempts Highlights from server-side prefetching on every summary page shape', () => {
		for (const prefetchers of [
			allTimeSummaryPrefetchers,
			yearSummaryPrefetchers,
			monthSummaryPrefetchers
		]) {
			const highlights = prefetchers.find(
				(tab) => tab.id === HIGHLIGHTS_TAB_ID
			);
			expect(highlights?.clientSideOnly).toBe(true);
		}
	});

	it('exempts both Highlights TabConfigs too, so TabSet and the prefetcher agree', () => {
		expect(summaryHighlightsTab.clientSideOnly).toBe(true);
		expect(squashedMonthHighlightsTab.clientSideOnly).toBe(true);
	});

	it('leaves every non-Highlights tab prefetchable', () => {
		const nonHighlights = allTimeSummaryPrefetchers.filter(
			(tab) => tab.id !== HIGHLIGHTS_TAB_ID
		);
		for (const tab of nonHighlights) {
			expect(tab.clientSideOnly).toBeUndefined();
		}
	});
});

describe('agreement between the prefetch descriptors and the rendered TabConfigs', () => {
	it('shares one id and one dataFetcher per tab, rather than redeclaring them client-side', () => {
		const tabConfigsById = {
			[SPECIES_TOTALS_TAB_ID]: summarySpeciesTotalsTab,
			[SESSION_TOTALS_TAB_ID]: summarySessionTotalsTab,
			[ALL_TIME_MONTH_TOTALS_TAB_ID]: summaryAllTimeMonthTotalsTab,
			[HIGHLIGHTS_TAB_ID]: summaryHighlightsTab
		};
		for (const [tabId, tabConfig] of Object.entries(tabConfigsById)) {
			const prefetcher = allTimeSummaryPrefetchers.find(
				(tab) => tab.id === tabId
			);
			expect(tabConfig.id).toBe(prefetcher?.id);
			expect(tabConfig.dataFetcher).toBe(prefetcher?.dataFetcher);
		}
	});
});
