// Tab-cascade helpers shared between `page.tsx` (server) and `PageContent.tsx`
// (`'use client'`). Deliberately kept in a plain module rather than inside
// `PageContent.tsx`: a function exported from a `'use client'` file becomes an
// opaque client reference when imported elsewhere — calling it (not just
// passing it through JSX) from a Server Component throws "Attempted to call
// X() from the server but X is on the client" at runtime (a `vitest` unit
// test doesn't enforce this RSC boundary, so this only surfaces in a real
// Next.js render, e.g. the Playwright suite). `page.tsx` imports straight
// from here; `PageContent.tsx` re-exports these same functions for its own
// (client-side) use so nothing else has to change import paths.
//
// `.tsx` (not `.ts`, #1060) because `buildSpeciesDetailTabs`'s 3 adapter
// components below need JSX to wrap the existing `Sp*Tab` components with
// remapped props — this module still carries no `'use client'` directive, so
// it stays importable from both `page.tsx` (server) and `PageContent.tsx`
// (client) exactly as before; only tabs referenced via JSX/stored as
// `TabComponent` object properties cross the RSC boundary this way, never
// called directly, so the warning above still holds.
import { SpYearTotalsTab } from '@/app/components/pages/species/SpYearTotalsTab';
import { SpMonthTotalsTab } from '@/app/components/pages/species/SpMonthTotalsTab';
import { SpSessionTotalsTab } from '@/app/components/pages/species/SpSessionTotalsTab';
import { SpCombinedMonthTotalsTab } from '@/app/components/pages/species/SpCombinedMonthTotalsTab';
import { SpSquashedMonthYearTotalsTab } from '@/app/components/pages/species/SpSquashedMonthYearTotalsTab';
import { spHighlightsTab } from '@/app/components/pages/species/SpHighlightsTab';
import { SpBiometricsTab } from '@/app/components/pages/species/SpBiometricsTab';
import { SpDemographicsTab } from '@/app/components/pages/species/SpDemographicsTab';
import { SpIndividualsTab } from '@/app/components/pages/species/SpIndividualsTab';
import {
	fetchYearTotalsTabData,
	fetchMonthTotalsTabData,
	fetchSessionTotalsTabData,
	fetchCombinedMonthTotalsTabData,
	fetchSquashedMonthYearTotalsTabData,
	type SpeciesTotalsTabParams
} from '@/app/actions/sp-data';
import type { TabConfig } from '@/app/components/shared/TabContent';
import type { ViewedGroup } from '@/app/lib/group-slug';
import type { CoreStatsWithBiometrics } from '@/app/models/db';
import type { EnrichedBirdOfSpecies } from '@/app/models/bird';

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
// across all 9 of species' tabs (#1060: no tab is left off `TabConfig`).
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

// All 6 of species' data-fetching tabs, migrated onto the shared `TabSet`
// component: #1065 landed Year totals (all-time page) and Month totals
// (year-scoped page, mutually exclusive with Year totals) and Session totals
// (always present); #1066 appended all-time Month totals (all-time page
// only), the squashed-month route's own Year totals
// (`squashed-month-year-totals`, squashed-month page only) and Highlights
// (always present). Shared between `page.tsx` (server-side prefetch — only
// `id`/`dataFetcher`/`clientSideOnly` are read there) and `SpeciesData` (full
// render, including `label`/`TabComponent`, in `PageContent.tsx`), so there
// is exactly one place that decides which of these 6 tabs apply at a given
// route depth. `SpeciesData` appends `buildSpeciesDetailTabs`'s 3 further
// entries (#1060) alongside this array's output into one combined `TabSet`.
export function buildSpeciesTotalsTabs(
	isAllTime: boolean,
	isYearScoped: boolean,
	isSquashedMonth: boolean
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
		},
		...(isAllTime
			? [
					{
						id: 'all-time-month-totals',
						label: 'Month totals',
						dataFetcher: fetchCombinedMonthTotalsTabData,
						TabComponent: SpCombinedMonthTotalsTab
					}
				]
			: []),
		...(isSquashedMonth
			? [
					{
						id: 'squashed-month-year-totals',
						label: 'Year totals',
						dataFetcher: fetchSquashedMonthYearTotalsTabData,
						TabComponent: SpSquashedMonthYearTotalsTab
					}
				]
			: []),
		spHighlightsTab as TabConfig<unknown, SpeciesTotalsTabParams>
	];
}

// The shared `params` shape for the species page's 3 remaining detail tabs
// (#1060: Biometrics, Demographics, Bird list) — a superset of whatever each
// of the 3 adapters below actually reads, same convention as
// `SpeciesTotalsTabParams`. Lives here rather than in `sp-data.ts` since,
// unlike `SpeciesTotalsTabParams`, it's never a `'use server'` action's
// parameter type — none of these 3 tabs has a `dataFetcher` at all, so this
// type only ever threads client-side, from `SpeciesData`'s own `data` prop
// through `buildSpeciesDetailTabs`'s per-tab `params` override (below) to each
// adapter. It deliberately isn't folded into `SpeciesTotalsTabParams` itself:
// the 6 totals tabs' own `dataFetcher`s never need `speciesId`/`speciesStats`/
// `birds`, and `page.tsx`'s server-side prefetch never has `speciesStats`/
// `birds` in hand at the point it builds `totalsTabParams` (they're fetched
// concurrently, in the same `Promise.all`, as the prefetch call itself).
export type SpeciesDetailTabParams = {
	speciesStats: CoreStatsWithBiometrics;
	speciesName: string;
	speciesId: number;
	birds: EnrichedBirdOfSpecies[];
	fromDate?: string;
	toDate?: string;
};

// Thin per-tab adapters (#1060) bridging `TabConfig.TabComponent`'s fixed
// `(props: { params, data, viewedGroup }) => ReactNode` contract onto
// `SpBiometricsTab`/`SpDemographicsTab`/`SpIndividualsTab`'s own, unrelated
// prop shapes — none of the three match `TabComponent`'s contract today, and
// none of their own props/internal fetch-on-expand/pagination logic changes
// here. `data` is always `null` (these 3 tabs have no `dataFetcher`, see
// `buildSpeciesDetailTabs` below) so every adapter ignores it.
function BiometricsTabAdapter({
	params,
	viewedGroup
}: {
	params: SpeciesDetailTabParams;
	data: unknown;
	viewedGroup: ViewedGroup;
}) {
	return (
		<SpBiometricsTab
			speciesStats={params.speciesStats}
			speciesName={params.speciesName}
			speciesId={params.speciesId}
			viewedGroupId={viewedGroup.id}
			fromDate={params.fromDate}
			toDate={params.toDate}
		/>
	);
}

function DemographicsTabAdapter({
	params,
	viewedGroup
}: {
	params: SpeciesDetailTabParams;
	data: unknown;
	viewedGroup: ViewedGroup;
}) {
	return (
		<SpDemographicsTab
			speciesName={params.speciesName}
			viewedGroupId={viewedGroup.id}
			fromDate={params.fromDate}
			toDate={params.toDate}
		/>
	);
}

// `birdCount` is derived from `params.speciesStats.bird_count ?? 0` here,
// the same idiom `PageContent.tsx` used before this ticket, rather than
// threaded as its own field on `SpeciesDetailTabParams` — `speciesStats` is
// already on the shared params for `BiometricsTabAdapter`'s sake, so this
// just reads the one field it needs off the same object.
function IndividualsTabAdapter({
	params,
	viewedGroup
}: {
	params: SpeciesDetailTabParams;
	data: unknown;
	viewedGroup: ViewedGroup;
}) {
	return (
		<SpIndividualsTab
			speciesId={params.speciesId}
			viewedGroupId={viewedGroup.id}
			birds={params.birds}
			birdCount={params.speciesStats.bird_count ?? 0}
			fromDate={params.fromDate}
			toDate={params.toDate}
		/>
	);
}

// The 3 detail tabs added to `TabSet` by #1060 — species' finish line: after
// this, all 9 species tabs render through one single `TabSet`/`TabNav`/
// `ConditionalTabPanel` mechanism, with none left on a bespoke rendering
// path. Each of the 3 manages its own internal fetching
// (Biometrics/Demographics lazy-fetch per expanded chart tile, Individuals
// paginates via infinite scroll), so none gets a `dataFetcher` — `TabContent`
// renders its `TabComponent` immediately with `data: null` and never calls a
// fetcher. Ids/labels unchanged from the old `ConditionalTabPanel` wiring
// this replaces.
//
// Returns a tuple (via `as const`), not a plain `TabConfig[]`, and takes
// `detailParams` as an argument to embed as each entry's own `params` —
// deliberately, not left for `TabSet`'s shared `params` prop to supply:
// `SpeciesData` below spreads this tuple alongside `buildSpeciesTotalsTabs`'s
// array into one combined `tabs` array for a single `TabSet` instance, and
// that combined array is heterogeneous (`SpeciesTotalsTabParams` for the 6
// totals tabs, `SpeciesDetailTabParams` here) — `TabSet`'s per-tab generic
// inference only keeps each tab's own `ParamsType` distinct across a
// heterogeneous array when (a) the whole combined array literal is `as
// const`, and (b) each entry needing its own `params` is a tuple position
// contributed directly by an inline object literal (or, as here, spread from
// an `as const` tuple), not type-widened through an explicit `TabConfig<...>`
// return-type annotation — that would collapse `params` back to optional and
// break the inference `TabConfigInSet` relies on. A separate `TabConfig[]`-
// typed array spread in alongside `buildSpeciesTotalsTabs`'s own array would
// likewise widen both to a single unioned element type and lose this.
export function buildSpeciesDetailTabs(detailParams: SpeciesDetailTabParams) {
	return [
		{
			id: 'biometrics',
			label: 'Biometrics',
			dataFetcher: undefined,
			params: detailParams,
			TabComponent: BiometricsTabAdapter
		},
		{
			id: 'demographics',
			label: 'Demographics',
			dataFetcher: undefined,
			params: detailParams,
			TabComponent: DemographicsTabAdapter
		},
		{
			id: 'bird-list',
			label: 'Bird list',
			dataFetcher: undefined,
			params: detailParams,
			TabComponent: IndividualsTabAdapter
		}
	] as const;
}
