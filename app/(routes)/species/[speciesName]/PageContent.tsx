'use client';
import { format } from 'date-fns';
import {
	PageWrapper,
	PrimaryHeading,
	Standfirst
} from '@/app/components/shared/DesignSystem';
import { NoPrefetchLink } from '@/app/components/shared/NoPrefetchLink';
import { type EnrichedBirdOfSpecies } from '@/app/models/bird';
import type { AggregateStatsWithBiometrics } from '@/app/models/db';
import type { ViewedGroup } from '@/app/lib/group-slug';
import { SpIndividualsTab } from '@/app/components/pages/species/SpIndividualsTab';
import { SpNotableRetrapsTab } from '@/app/components/pages/species/SpNotableRetrapsTab';
import { SpBusiestSessionsTab } from '@/app/components/pages/species/SpBusiestSessionsTab';
import { SpPopulationTab } from '@/app/components/pages/species/SpPopulationTab';
import { SpBiometricsTab } from '@/app/components/pages/species/SpBiometricsTab';
import { SpYearTotalsTab } from '@/app/components/pages/species/SpYearTotalsTab';
import { SpMonthTotalsTab } from '@/app/components/pages/species/SpMonthTotalsTab';
import { SpCombinedMonthTotalsTab } from '@/app/components/pages/species/SpCombinedMonthTotalsTab';
import { SpSessionTotalsTab } from '@/app/components/pages/species/SpSessionTotalsTab';
import { TabNav } from '@/app/components/TabNav';
import { useLinkableTabs } from '@/app/components/shared/useLinkableTabs';

// `year`/`month` are only present on the period-scoped child routes
// (`[year]`, `[year]/[month]`); the unscoped route supplies just `speciesName`.
// `tabId` (#803) is the optional `?tabId=` search param, threaded in from
// each route depth's `page.tsx` — it never affects `getCacheKeys`, only which
// tab `SpeciesData` focuses/loads first.
export type PageParams = {
	speciesName: string;
	year?: string;
	month?: string;
	tabId?: string;
};

// A resolved period passed to `fetchSpeciesPageContentForPeriod`. `year`/`month`
// drive the heading and the Highlights tab's Busiest sessions filtering;
// `fromDate`/`toDate` (a `yyyy-MM-dd` range) scope the encounter-level
// fetchers. All optional — an all-time page passes none.
export type PeriodScope = {
	year?: number;
	month?: number;
	fromDate?: string;
	toDate?: string;
};

export type FullFatPageData = {
	birds: EnrichedBirdOfSpecies[];
	speciesStats: AggregateStatsWithBiometrics;
	speciesId: number;
	speciesName: string;
} & PeriodScope;
export type ThinPageData = { speciesId: number } & PeriodScope;
export type PageData = FullFatPageData | ThinPageData;

// The tab eagerly mounted (and initially active) at each route depth: the
// first totals tab shown for that depth. Mirrors the route-depth cascade the
// `tabs` array uses (all-time → Year totals, year-scoped → Month totals,
// month-scoped → Session totals) so the first visible tab is loaded on initial
// page load instead of always eager-loading the Bird list.
export function getDefaultSpeciesTabId(
	isAllTime: boolean,
	isYearScoped: boolean
): 'year-totals' | 'month-totals' | 'session-totals' {
	if (isAllTime) {
		return 'year-totals';
	}
	if (isYearScoped) {
		return 'month-totals';
	}
	return 'session-totals';
}

export function buildSpeciesHeadingText(
	speciesName: string,
	year?: number,
	month?: number
): string {
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
// (#784). `null` counts (a possible shape for `AggregateStatsResult`'s count
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
	counts
}: {
	speciesName: string;
	year?: number;
	month?: number;
	counts?: SpeciesHeadingCounts;
}) {
	return (
		<>
			<PrimaryHeading>
				{buildSpeciesHeadingText(speciesName, year, month)}
				{year !== undefined && (
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

function ConditionalTabPanel({
	loadedTabs,
	tabId,
	activeTabId,
	children
}: {
	loadedTabs: Set<string>;
	tabId: string;
	activeTabId: string;
	children: React.ReactNode;
}) {
	if (loadedTabs.has(tabId)) {
		return tabId === activeTabId ? (
			<div>{children}</div>
		) : (
			<div className="hidden" aria-hidden="true">
				{children}
			</div>
		);
	}
	return null;
}

function SpeciesData({
	data,
	viewedGroup,
	initialTabId
}: {
	data: FullFatPageData;
	viewedGroup: ViewedGroup;
	initialTabId?: string;
}) {
	// Cascading period tab, same convention `SummaryTotalsSection` uses: the
	// all-time page gets "Year totals" (drilling into a year), the year-scoped
	// page gets "Month totals" instead (drilling into a month); the month-scoped
	// page gets neither.
	const isAllTime = data.year === undefined;
	const isYearScoped = data.year !== undefined && data.month === undefined;
	const defaultTabId = getDefaultSpeciesTabId(isAllTime, isYearScoped);

	const tabs = [
		...(isAllTime ? [{ id: 'year-totals', label: 'Year totals' }] : []),
		...(isAllTime
			? [{ id: 'all-time-month-totals', label: 'Month totals' }]
			: []),
		...(isYearScoped ? [{ id: 'month-totals', label: 'Month totals' }] : []),
		{ id: 'session-totals', label: 'Session totals' },
		{ id: 'highlights', label: 'Highlights' },
		{ id: 'biometrics', label: 'Biometrics' },
		{ id: 'population', label: 'Population' },
		{ id: 'bird-list', label: 'Bird list' }
	];

	// The `?tabId=` param (#803) wins over the route-depth default when it
	// names one of this route depth's actual tabs; an unknown/garbage value or
	// no param at all falls back to `defaultTabId` unchanged. Shared with the
	// summary and session pages via `useLinkableTabs` (#818).
	const { activeTab, loadedTabs, selectTab } = useLinkableTabs({
		tabIds: tabs.map((tab) => tab.id),
		defaultTabId,
		initialTabId
	});

	return (
		<>
			<TabNav tabs={tabs} activeTab={activeTab} onTabChange={selectTab} />
			{isAllTime && (
				<ConditionalTabPanel
					loadedTabs={loadedTabs}
					tabId="year-totals"
					activeTabId={activeTab}
				>
					<SpYearTotalsTab
						speciesName={data.speciesName}
						viewedGroupId={viewedGroup.id}
					/>
				</ConditionalTabPanel>
			)}
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
			{isYearScoped && data.year !== undefined && (
				<ConditionalTabPanel
					loadedTabs={loadedTabs}
					tabId="month-totals"
					activeTabId={activeTab}
				>
					<SpMonthTotalsTab
						speciesName={data.speciesName}
						viewedGroupId={viewedGroup.id}
						year={data.year}
						fromDate={data.fromDate}
						toDate={data.toDate}
					/>
				</ConditionalTabPanel>
			)}
			<ConditionalTabPanel
				loadedTabs={loadedTabs}
				tabId="session-totals"
				activeTabId={activeTab}
			>
				<SpSessionTotalsTab
					speciesName={data.speciesName}
					viewedGroup={viewedGroup}
					fromDate={data.fromDate}
					toDate={data.toDate}
				/>
			</ConditionalTabPanel>
			<ConditionalTabPanel
				loadedTabs={loadedTabs}
				tabId="highlights"
				activeTabId={activeTab}
			>
				<SpBusiestSessionsTab
					speciesName={data.speciesName}
					viewedGroupId={viewedGroup.id}
					viewedGroup={viewedGroup}
					year={data.year}
					month={data.month}
					isActive={activeTab === 'highlights'}
				/>
				<SpNotableRetrapsTab
					speciesName={data.speciesName}
					viewedGroupId={viewedGroup.id}
					fromDate={data.fromDate}
					toDate={data.toDate}
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
				tabId="population"
				activeTabId={activeTab}
			>
				<SpPopulationTab
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
	params: { speciesName, year, month, tabId },
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
				year={year === undefined ? undefined : Number(year)}
				month={month === undefined ? undefined : Number(month)}
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
					initialTabId={tabId}
				/>
			) : (
				<p>Not authorised to view any encounter data for this species</p>
			)}
		</PageWrapper>
	);
}
