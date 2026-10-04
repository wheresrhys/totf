// Pure, non-JSX tab-cascade helpers shared between `page.tsx` (server) and
// `PageContent.tsx` (`'use client'`). Deliberately kept in a plain module
// rather than inside `PageContent.tsx`: a function exported from a `'use
// client'` file becomes an opaque client reference when imported elsewhere —
// calling it (not just passing it through JSX) from a Server Component
// throws "Attempted to call X() from the server but X is on the client" at
// runtime (a `vitest` unit test doesn't enforce this RSC boundary, so this
// only surfaces in a real Next.js render, e.g. the Playwright suite).
// `page.tsx` imports straight from here; `PageContent.tsx` re-exports these
// same functions for its own (client-side) use so nothing else has to change
// import paths.
import { SpYearTotalsTab } from '@/app/components/pages/species/SpYearTotalsTab';
import { SpMonthTotalsTab } from '@/app/components/pages/species/SpMonthTotalsTab';
import { SpSessionTotalsTab } from '@/app/components/pages/species/SpSessionTotalsTab';
import {
	fetchYearTotalsTabData,
	fetchMonthTotalsTabData,
	fetchSessionTotalsTabData,
	type SpeciesTotalsTabParams
} from '@/app/actions/sp-data';
import type { TabConfig } from '@/app/components/shared/TabContent';

// The tab eagerly mounted (and initially active) at each route depth: the
// first totals tab shown for that depth. Mirrors the route-depth cascade the
// `tabs` array uses (all-time → Year totals, year-scoped → Month totals,
// month-scoped → Session totals, squashed-month → its own Year totals) so
// the first visible tab is loaded on initial page load instead of always
// eager-loading the Bird list.
export function getDefaultSpeciesTabId(
	isAllTime: boolean,
	isYearScoped: boolean,
	isSquashedMonth: boolean = false
):
	| 'year-totals'
	| 'month-totals'
	| 'session-totals'
	| 'squashed-month-year-totals' {
	if (isAllTime) {
		return 'year-totals';
	}
	if (isYearScoped) {
		return 'month-totals';
	}
	if (isSquashedMonth) {
		return 'squashed-month-year-totals';
	}
	return 'session-totals';
}

// The full set of tab ids this page can ever show at a given route depth,
// across both the new `TabSet`-rendered totals tabs and the 6 still on the
// old `useLinkableTabs`/`TabNav`/`ConditionalTabPanel` mechanism below.
// `page.tsx`'s `fetchSpeciesPageContentForPeriod` uses this to validate a raw
// `?tabId=` server-side (`resolveInitialTabId`'s `knownTabIds`) before
// deciding whether to prefetch — kept here, next to `getDefaultSpeciesTabId`,
// rather than inlined in `page.tsx`, so the two cascades (which ids exist,
// which one wins by default) can't drift apart.
export function getSpeciesKnownTabIds(
	isAllTime: boolean,
	isYearScoped: boolean,
	isSquashedMonth: boolean
): string[] {
	return [
		...(isAllTime ? ['year-totals', 'all-time-month-totals'] : []),
		...(isYearScoped ? ['month-totals'] : []),
		...(isSquashedMonth ? ['squashed-month-year-totals'] : []),
		'session-totals',
		'highlights',
		'biometrics',
		'demographics',
		'bird-list'
	];
}

// The 3 totals tabs migrated onto the shared `TabSet` component (#1065): Year
// totals (all-time page) and Month totals (year-scoped page) are mutually
// exclusive, Session totals is always present. Shared between `page.tsx`
// (server-side prefetch — only `id`/`dataFetcher` are read there) and
// `SpeciesData` (full render, including `label`/`TabComponent`, in
// `PageContent.tsx`), so there is exactly one place that decides which of the
// 3 apply at a given route depth.
//
// Deliberately excludes the squashed-month route's own "Year totals" tab
// (`squashed-month-year-totals`, rendered by `SpSquashedMonthYearTotalsTab`)
// even though it fills the same visual slot — migrating *that* tab's own
// internal fetching is explicitly out of scope for #1065 (it's one of the "6
// not-yet-migrated tabs", alongside Combined Month Totals/Highlights/
// Biometrics/Demographics/Individuals), so it stays on the old mechanism
// rather than joining this array.
export function buildSpeciesTotalsTabs(
	isAllTime: boolean,
	isYearScoped: boolean
): TabConfig<unknown, SpeciesTotalsTabParams>[] {
	return [
		...(isAllTime
			? [
					{
						id: 'year-totals',
						label: 'Year totals',
						dataFetcher: fetchYearTotalsTabData,
						TabComponent: SpYearTotalsTab
					}
				]
			: []),
		...(isYearScoped
			? [
					{
						id: 'month-totals',
						label: 'Month totals',
						dataFetcher: fetchMonthTotalsTabData,
						TabComponent: SpMonthTotalsTab
					}
				]
			: []),
		{
			id: 'session-totals',
			label: 'Session totals',
			dataFetcher: fetchSessionTotalsTabData,
			TabComponent: SpSessionTotalsTab
		}
	];
}
