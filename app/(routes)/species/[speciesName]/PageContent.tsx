'use client';
import { format } from 'date-fns';
import {
	PageWrapper,
	PrimaryHeading,
	Standfirst
} from '@/app/components/shared/DesignSystem';
import { NoPrefetchLink } from '@/app/components/shared/NoPrefetchLink';
import { formatMonthLabel } from '@/app/lib/month-totals';
import { type EnrichedBirdOfSpecies } from '@/app/models/bird';
import type { CoreStatsWithBiometrics } from '@/app/models/db';
import type { ViewedGroup } from '@/app/lib/group-slug';
import { type SpeciesTotalsTabParams } from '@/app/actions/sp-data';
import { TabSet } from '@/app/components/shared/TabSet';
// Imported (and re-exported below) rather than defined here — see
// `species-tabs.tsx`'s doc comment for why these helpers live outside this
// `'use client'` file (`page.tsx` imports them directly from there instead,
// to stay off the client-reference path entirely). Re-exporting keeps this
// file's own `SpeciesData` below and `__tests__/PageContent.test.tsx`
// importing from the same `./PageContent` path as before.
import {
	getDefaultSpeciesTabId,
	getSpeciesKnownTabIds,
	buildSpeciesTotalsTabs,
	buildSpeciesDetailTabs,
	type SpeciesDetailTabParams
} from './species-tabs';
export {
	getDefaultSpeciesTabId,
	getSpeciesKnownTabIds,
	buildSpeciesTotalsTabs,
	buildSpeciesDetailTabs
};
export type { SpeciesDetailTabParams };

// `tabId` (#803) is the optional `?tabId=` search param, threaded in from
// each route depth's `page.tsx` — it never affects `getCacheKeys`, only which
// tab `SpeciesData` focuses/loads first. The period itself (`year`/`month`/
// `squashedMonth`) is read off `data` (see `SpeciesPageContent` below), not
// `params` — the squashed-month route's own params shape has neither `year`
// nor `month`, only `yearOrMonth`.
export type PageParams = {
	speciesName: string;
	tabId?: string;
};

// A resolved period passed to `fetchSpeciesPageContentForPeriod`. `year`/`month`
// drive the heading and the Highlights tab's Busiest sessions filtering;
// `fromDate`/`toDate` (a `yyyy-MM-dd` range) scope the encounter-level
// fetchers. `squashedMonth` (#1005) is the squashed-month route's own shape —
// every occurrence of that calendar month across the group's whole history,
// mutually exclusive with `year`/`month` and deliberately paired with no
// `fromDate`/`toDate` (the trailing Highlights/Biometrics/Demographics/Bird
// list tabs stay unscoped, same as the all-time page — see CLAUDE.md). All
// optional — an all-time page passes none.
export type PeriodScope = {
	year?: number;
	month?: number;
	fromDate?: string;
	toDate?: string;
	squashedMonth?: number;
};

export type FullFatPageData = {
	birds: EnrichedBirdOfSpecies[];
	speciesStats: CoreStatsWithBiometrics;
	speciesId: number;
	speciesName: string;
} & PeriodScope;
export type ThinPageData = { speciesId: number } & PeriodScope;
// `initialTabId`/`initialTabData` (#1065) are added on top of the existing
// `FullFatPageData`/`ThinPageData` union, not folded into either type: they
// carry `page.tsx`'s server-side tab resolution/prefetch result down to
// `SpeeciesData` below, alongside (not instead of) the page's own data —
// `fullFatTypeGuard`'s `'birds' in data` check still narrows correctly since
// TypeScript distributes the intersection over the union.
export type PageData = (FullFatPageData | ThinPageData) & {
	initialTabId?: string;
	initialTabData?: { tabId: string; data: unknown };
};

export function buildSpeciesHeadingText(
	speciesName: string,
	year?: number,
	month?: number,
	squashedMonth?: number
): string {
	if (squashedMonth !== undefined) {
		return `${speciesName} ${formatMonthLabel({ zeroIndexedMonth: squashedMonth - 1 })}`;
	}
	if (year === undefined) {
		return speciesName;
	}
	if (month === undefined) {
		return `${speciesName} ${year}`;
	}
	const monthDate = new Date(year, month - 1, 1);
	return `${speciesName} ${format(monthDate, 'LLLL')} ${year}`;
}

// Counts sentence rendered under the heading when species stats are available
// (#784). `null` counts (a possible shape for `CoreStatsResult`'s count
// columns) are treated as 0 for both the number shown and the singular/plural
// check, following the `${n} ${n === 1 ? 'singular' : 'plural'}` idiom used by
// `buildYearsAgoCopy` (app/components/highlights/counts/renderers.tsx).
export type SpeciesHeadingCounts = {
	birdCount: number | null;
	encounterCount: number | null;
	sessionCount: number | null;
};

function buildSpeciesCountsSentence({
	birdCount,
	encounterCount,
	sessionCount
}: SpeciesHeadingCounts): string {
	const birds = birdCount ?? 0;
	const encounters = encounterCount ?? 0;
	const sessions = sessionCount ?? 0;
	return `${birds} ${birds === 1 ? 'bird' : 'birds'} encountered ${encounters} ${encounters === 1 ? 'time' : 'times'} at ${sessions} ${sessions === 1 ? 'Session' : 'Sessions'}`;
}

// Period-aware heading shared by the all-time, year and year+month species routes.
// When a period is in play it appends an "All time" link back to the unscoped
// `/species/{name}` page (mirroring #614's `{species} {period} [All time]` spec);
// with no period it renders the bare species name, matching today's behaviour.
// The optional `counts` prop (#784) renders a second, muted-caption line
// reporting the species' totals for the period in view — only passed by
// `SpeciesPageContent` on the `FullFatPageData` branch, since the "not
// authorised" branch has no species stats to report.
export function SpeciesHeading({
	speciesName,
	year,
	month,
	squashedMonth,
	counts
}: {
	speciesName: string;
	year?: number;
	month?: number;
	squashedMonth?: number;
	counts?: SpeciesHeadingCounts;
}) {
	return (
		<>
			<PrimaryHeading>
				{buildSpeciesHeadingText(speciesName, year, month, squashedMonth)}
				{(year !== undefined || squashedMonth !== undefined) && (
					<>
						{' '}
						<NoPrefetchLink
							className="link text-lg align-middle"
							href={`/species/${speciesName}`}
						>
							All time
						</NoPrefetchLink>
					</>
				)}
			</PrimaryHeading>
			<Standfirst testId="species-counts">
				{counts
					? buildSpeciesCountsSentence(counts)
					: 'Not authorised to view any ringing data for this species'}
			</Standfirst>
		</>
	);
}

function SpeciesData({
	data,
	viewedGroup,
	initialTabId,
	initialTabData
}: {
	data: FullFatPageData;
	viewedGroup: ViewedGroup;
	initialTabId?: string;
	initialTabData?: { tabId: string; data: unknown };
}) {
	// Cascading period tab, same convention `SummaryTotalsSection` uses: the
	// all-time page gets "Year totals" (drilling into a year), the year-scoped
	// page gets "Month totals" instead (drilling into a month), the
	// squashed-month page (#1005) gets its own "Year totals" (one row per year,
	// filtered to that calendar month); the month-scoped page gets none of these.
	const isAllTime = data.year === undefined && data.squashedMonth === undefined;
	const isYearScoped = data.year !== undefined && data.month === undefined;
	const isSquashedMonth = data.squashedMonth !== undefined;

	// All 9 of species' tabs now render through one single `TabSet` below —
	// this is species' finish line for the tab-unification initiative. The 6
	// data-fetching tabs (Year/Month/Session totals #1065; all-time Month
	// totals, squashed-month Year totals and Highlights #1066) come from
	// `buildSpeciesTotalsTabs`, each server-prefetched when it's the resolved
	// initial tab (`page.tsx`'s `prefetchActiveTabData` call) — except
	// Highlights, which declares itself `clientSideOnly`
	// (`SpHighlightsTab.tsx`'s `spHighlightsTab`) and always fetches
	// client-side regardless. The remaining 3 (Biometrics, Demographics, Bird
	// list, #1060) come from `buildSpeciesDetailTabs` and are never
	// prefetched, since none of the 3 has a `dataFetcher` (each manages its
	// own internal fetching/pagination unchanged, joining `TabSet` purely for
	// the shared `TabNav`/`ConditionalTabPanel` wiring) — `page.tsx` only
	// passes the totals 6 into `prefetchActiveTabData`, never these 3.
	//
	// The two arrays are spread into one combined literal (`as const`) rather
	// than passed as two separate `TabSet`s: `buildSpeciesTotalsTabs`'s 6
	// tabs share `totalsTabParams` (`SpeciesTotalsTabParams`), while
	// `buildSpeciesDetailTabs`'s 3 each carry their own `params`
	// (`SpeciesDetailTabParams` — a shape `totalsTabParams` can't satisfy,
	// since `speciesId`/`speciesStats`/`birds` aren't known yet at the point
	// `page.tsx` builds its prefetch params, see that function's own doc
	// comment). `TabSet`'s per-tab generic inference needs the combined
	// literal `as const`'d as a whole, with `buildSpeciesDetailTabs`'s own
	// tuple spread in directly rather than re-typed through an intermediate
	// variable — see `buildSpeciesDetailTabs`'s own doc comment for why.
	const totalsTabs = buildSpeciesTotalsTabs(
		isAllTime,
		isYearScoped,
		isSquashedMonth
	);
	const totalsTabParams: SpeciesTotalsTabParams = {
		speciesName: data.speciesName,
		year: data.year,
		// Passed as `month` to the Highlights tab's `dataFetcher` too — this
		// reproduces a pre-existing quirk in `SpHighlightsTab`'s old prop
		// wiring (it was called with `month={data.year}`, not `data.month`),
		// which suppresses its "Month highlights" section on both the
		// year-scoped and month-scoped pages rather than just the latter.
		// #1066 is a pure mechanism migration (handrolled fetch → `TabConfig`
		// `dataFetcher`) — preserved here rather than silently fixed, since
		// any behaviour change is explicitly out of scope for this ticket.
		month: data.year,
		fromDate: data.fromDate,
		toDate: data.toDate,
		monthFilter: data.squashedMonth
	};
	const detailTabParams: SpeciesDetailTabParams = {
		speciesStats: data.speciesStats,
		speciesName: data.speciesName,
		speciesId: data.speciesId,
		birds: data.birds,
		fromDate: data.fromDate,
		toDate: data.toDate
	};
	const detailTabs = buildSpeciesDetailTabs(detailTabParams);

	return (
		<TabSet
			tabs={[...totalsTabs, ...detailTabs] as const}
			params={totalsTabParams}
			viewedGroup={viewedGroup}
			initialTabId={initialTabId}
			initialTabData={initialTabData}
		/>
	);
}

function fullFatTypeGuard(data: PageData): data is FullFatPageData {
	return 'birds' in data;
}

export function SpeciesPageContent({
	params: { speciesName, tabId },
	data,
	viewedGroup
}: {
	params: PageParams;
	data: PageData;
	viewedGroup: ViewedGroup;
}) {
	return (
		<PageWrapper>
			<SpeciesHeading
				speciesName={speciesName}
				year={data.year}
				month={data.month}
				squashedMonth={data.squashedMonth}
				counts={
					fullFatTypeGuard(data)
						? {
								birdCount: data.speciesStats.bird_count,
								encounterCount: data.speciesStats.encounter_count,
								sessionCount: data.speciesStats.session_count
							}
						: undefined
				}
			/>
			{fullFatTypeGuard(data) ? (
				<SpeciesData
					data={data}
					viewedGroup={viewedGroup}
					// `data.initialTabId` is `page.tsx`'s server-resolved tab id
					// (#1065) — falls back to the raw `?tabId=` param only for a
					// `PageData` fixture that predates that resolution (e.g. a test
					// building `data` by hand without it).
					initialTabId={data.initialTabId ?? tabId}
					initialTabData={data.initialTabData}
				/>
			) : (
				<p>Not authorised to view any encounter data for this species</p>
			)}
		</PageWrapper>
	);
}
