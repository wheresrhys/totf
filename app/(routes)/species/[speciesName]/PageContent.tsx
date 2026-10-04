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
import { SpIndividualsTab } from '@/app/components/pages/species/SpIndividualsTab';
import { SpHighlightsTab } from '@/app/components/pages/species/SpHighlightsTab';
import { SpDemographicsTab } from '@/app/components/pages/species/SpDemographicsTab';
import { SpBiometricsTab } from '@/app/components/pages/species/SpBiometricsTab';
import { SpYearTotalsTab } from '@/app/components/pages/species/SpYearTotalsTab';
import { SpMonthTotalsTab } from '@/app/components/pages/species/SpMonthTotalsTab';
import { SpCombinedMonthTotalsTab } from '@/app/components/pages/species/SpCombinedMonthTotalsTab';
import { SpSquashedMonthYearTotalsTab } from '@/app/components/pages/species/SpSquashedMonthYearTotalsTab';
import { SpSessionTotalsTab } from '@/app/components/pages/species/SpSessionTotalsTab';
import {
	fetchYearTotalsTabData,
	fetchMonthTotalsTabData,
	fetchSessionTotalsTabData,
	type SpeciesTotalsTabParams
} from '@/app/actions/sp-data';
import { TabNav } from '@/app/components/TabNav';
import { useLinkableTabs } from '@/app/components/shared/useLinkableTabs';
import { ConditionalTabPanel } from '@/app/components/shared/ConditionalTabPanel';
import { TabSet } from '@/app/components/shared/TabSet';
import type { TabConfig } from '@/app/components/shared/TabContent';

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
// `SpeciesData` below (full render, including `label`/`TabComponent`), so
// there is exactly one place that decides which of the 3 apply at a given
// route depth.
//
// Deliberately excludes the squashed-month route's own "Year totals" tab
// (`squashed-month-year-totals`, rendered by `SpSquashedMonthYearTotalsTab`)
// even though it fills the same visual slot — migrating *that* tab's own
// internal fetching is explicitly out of scope for #1065 (it's one of the "6
// not-yet-migrated tabs", alongside Combined Month Totals/Highlights/
// Biometrics/Demographics/Individuals), so it stays on the old mechanism
// below rather than joining this array.
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

	// The 3 "totals" tabs (Year/Month/Session, #1065) render through the shared
	// `TabSet` below, each server-prefetched when it's the resolved initial tab
	// (`page.tsx`'s `prefetchActiveTabData` call). The other 6 species tabs
	// (Combined Month Totals, Squashed Month/Year Totals, Highlights,
	// Biometrics, Demographics, Individuals) aren't on `TabConfig` yet
	// (follow-ups, including #1060) and keep rendering below via the original
	// `useLinkableTabs`/`TabNav`/`ConditionalTabPanel` mechanism — so this page
	// deliberately shows two separate tab strips for the interim: `TabSet`'s
	// own nav covers just the totals tabs, this `TabNav` covers the rest. Each
	// strip resolves `initialTabId` independently against its own known ids
	// (see `getSpeciesKnownTabIds`'s doc comment), so a `?tabId=` naming a tab
	// in the *other* strip is a harmless no-op here — that strip simply starts
	// with nothing active/loaded, since the real initial tab lives elsewhere.
	const totalsTabs = buildSpeciesTotalsTabs(isAllTime, isYearScoped);
	const totalsTabParams: SpeciesTotalsTabParams = {
		speciesName: data.speciesName,
		year: data.year,
		fromDate: data.fromDate,
		toDate: data.toDate,
		monthFilter: data.squashedMonth
	};

	const defaultTabId = getDefaultSpeciesTabId(
		isAllTime,
		isYearScoped,
		isSquashedMonth
	);

	const tabs = [
		...(isAllTime
			? [{ id: 'all-time-month-totals', label: 'Month totals' }]
			: []),
		...(isSquashedMonth
			? [{ id: 'squashed-month-year-totals', label: 'Year totals' }]
			: []),
		{ id: 'highlights', label: 'Highlights' },
		{ id: 'biometrics', label: 'Biometrics' },
		{ id: 'demographics', label: 'Demographics' },
		{ id: 'bird-list', label: 'Bird list' }
	];

	// The `?tabId=` param (#803) wins over the route-depth default when it
	// names one of this route depth's actual tabs; an unknown/garbage value or
	// no param at all falls back to `defaultTabId` unchanged. Shared with the
	// summary and session pages via `useLinkableTabs` (#818). `defaultTabId`
	// may legitimately name a tab that isn't in this (reduced) `tabs` list any
	// more (e.g. `'year-totals'` on the all-time page) — that's fine, it just
	// means this strip starts with nothing active/loaded, since that tab now
	// lives in `TabSet` above instead.
	const { activeTab, loadedTabs, selectTab } = useLinkableTabs({
		tabIds: tabs.map((tab) => tab.id),
		defaultTabId,
		initialTabId
	});

	return (
		<>
			<TabSet
				tabs={totalsTabs}
				params={totalsTabParams}
				viewedGroup={viewedGroup}
				initialTabId={initialTabId}
				initialTabData={initialTabData}
				ariaLabel="Totals"
			/>
			<TabNav tabs={tabs} activeTab={activeTab} onTabChange={selectTab} />
			{isAllTime && (
				<ConditionalTabPanel
					loadedTabs={loadedTabs}
					tabId="all-time-month-totals"
					activeTabId={activeTab}
				>
					<SpCombinedMonthTotalsTab
						speciesName={data.speciesName}
						viewedGroupId={viewedGroup.id}
						isActive={activeTab === 'all-time-month-totals'}
					/>
				</ConditionalTabPanel>
			)}
			{isSquashedMonth && data.squashedMonth !== undefined && (
				<ConditionalTabPanel
					loadedTabs={loadedTabs}
					tabId="squashed-month-year-totals"
					activeTabId={activeTab}
				>
					<SpSquashedMonthYearTotalsTab
						speciesName={data.speciesName}
						viewedGroupId={viewedGroup.id}
						squashedMonth={data.squashedMonth}
					/>
				</ConditionalTabPanel>
			)}
			<ConditionalTabPanel
				loadedTabs={loadedTabs}
				tabId="highlights"
				activeTabId={activeTab}
			>
				<SpHighlightsTab
					speciesName={data.speciesName}
					viewedGroup={viewedGroup}
					fromDate={data.fromDate}
					toDate={data.toDate}
					year={data.year}
					month={data.year}
				/>
			</ConditionalTabPanel>
			<ConditionalTabPanel
				loadedTabs={loadedTabs}
				tabId="biometrics"
				activeTabId={activeTab}
			>
				<SpBiometricsTab
					speciesStats={data.speciesStats}
					speciesName={data.speciesName}
					speciesId={data.speciesId}
					viewedGroupId={viewedGroup.id}
					fromDate={data.fromDate}
					toDate={data.toDate}
				/>
			</ConditionalTabPanel>
			<ConditionalTabPanel
				loadedTabs={loadedTabs}
				tabId="demographics"
				activeTabId={activeTab}
			>
				<SpDemographicsTab
					speciesName={data.speciesName}
					viewedGroupId={viewedGroup.id}
					fromDate={data.fromDate}
					toDate={data.toDate}
				/>
			</ConditionalTabPanel>
			<ConditionalTabPanel
				loadedTabs={loadedTabs}
				tabId="bird-list"
				activeTabId={activeTab}
			>
				<SpIndividualsTab
					speciesId={data.speciesId}
					viewedGroupId={viewedGroup.id}
					birds={data.birds}
					birdCount={data.speciesStats.bird_count ?? 0}
					fromDate={data.fromDate}
					toDate={data.toDate}
				/>
			</ConditionalTabPanel>
		</>
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
