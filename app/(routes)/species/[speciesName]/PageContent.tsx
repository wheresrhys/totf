'use client';
import { useState } from 'react';
import { format } from 'date-fns';
import {
	PageWrapper,
	PrimaryHeading
} from '@/app/components/shared/DesignSystem';
import { NoPrefetchLink } from '@/app/components/shared/NoPrefetchLink';
import { SpStats } from '@/app/components/pages/species/SpStats';
import { type EnrichedBirdOfSpecies } from '@/app/models/bird';
import type { AggregateStatsResult, TopPeriodsResult } from '@/app/models/db';
import type { ViewedGroup } from '@/lib/group-slug';
import { SpIndividualsTab } from '@/app/components/pages/species/SpIndividualsTab';
import { SpNotableRetrapsTab } from '@/app/components/pages/species/SpNotableRetrapsTab';
import { SpGraphsTab } from '@/app/components/pages/species/SpGraphsTab';
import { SpYearTotalsTab } from '@/app/components/pages/species/SpYearTotalsTab';
import { SpMonthTotalsTab } from '@/app/components/pages/species/SpMonthTotalsTab';
import { SpCombinedMonthTotalsTab } from '@/app/components/pages/species/SpCombinedMonthTotalsTab';
import { SpSessionTotalsTab } from '@/app/components/pages/species/SpSessionTotalsTab';
import { TabNav } from '@/app/components/TabNav';

// `year`/`month` are only present on the period-scoped child routes
// (`[year]`, `[year]/[month]`); the unscoped route supplies just `speciesName`.
export type PageParams = { speciesName: string; year?: string; month?: string };

// A resolved period passed to `fetchSpeciesPageContentForPeriod`. `year`/`month`
// drive the heading and top-session filtering; `fromDate`/`toDate` (a
// `yyyy-MM-dd` range) scope the encounter-level fetchers. All optional — an
// all-time page passes none.
export type PeriodScope = {
	year?: number;
	month?: number;
	fromDate?: string;
	toDate?: string;
};

export type FullFatPageData = {
	topSessions: TopPeriodsResult[];
	birds: EnrichedBirdOfSpecies[];
	speciesStats: AggregateStatsResult;
	speciesId: number;
	speciesName: string;
} & PeriodScope;
export type ThinPageData = { speciesId: number } & PeriodScope;
export type PageData = FullFatPageData | ThinPageData;

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

// Period-aware heading shared by the all-time, year and year+month species routes.
// When a period is in play it appends an "All time" link back to the unscoped
// `/species/{name}` page (mirroring #614's `{species} {period} [All time]` spec);
// with no period it renders the bare species name, matching today's behaviour.
export function SpeciesHeading({
	speciesName,
	year,
	month
}: {
	speciesName: string;
	year?: number;
	month?: number;
}) {
	return (
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
	viewedGroup
}: {
	data: FullFatPageData;
	viewedGroup: ViewedGroup;
}) {
	const [loadedTabs, setLoadedTabs] = useState<Set<string>>(
		new Set(['bird-list'])
	);
	const [activeTab, setActiveTab] = useState('bird-list');

	function handleTabChange(tab: string) {
		setLoadedTabs((prev) => new Set([...prev, tab]));
		setActiveTab(tab);
	}

	// Cascading period tab, same convention `SummaryTotalsSection` uses: the
	// all-time page gets "Year totals" (drilling into a year), the year-scoped
	// page gets "Month totals" instead (drilling into a month); the month-scoped
	// page gets neither.
	const isAllTime = data.year === undefined;
	const isYearScoped = data.year !== undefined && data.month === undefined;

	return (
		<>
			<SpStats {...data} viewedGroup={viewedGroup} />
			<TabNav
				tabs={[
					{ id: 'bird-list', label: 'Bird list' },
					{ id: 'retraps', label: 'Retraps' },
					...(isAllTime ? [{ id: 'year-totals', label: 'Year totals' }] : []),
					...(isAllTime
						? [{ id: 'all-time-month-totals', label: 'Month totals' }]
						: []),
					...(isYearScoped
						? [{ id: 'month-totals', label: 'Month totals' }]
						: []),
					...(isAllTime || isYearScoped
						? [{ id: 'session-totals', label: 'Session totals' }]
						: []),
					{ id: 'graphs', label: 'Graphs' }
				]}
				activeTab={activeTab}
				onTabChange={handleTabChange}
			/>
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
			<ConditionalTabPanel
				loadedTabs={loadedTabs}
				tabId="retraps"
				activeTabId={activeTab}
			>
				<SpNotableRetrapsTab
					speciesName={data.speciesName}
					viewedGroupId={viewedGroup.id}
					fromDate={data.fromDate}
					toDate={data.toDate}
				/>
			</ConditionalTabPanel>
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
			{(isAllTime || isYearScoped) && (
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
			)}
			<ConditionalTabPanel
				loadedTabs={loadedTabs}
				tabId="graphs"
				activeTabId={activeTab}
			>
				<SpGraphsTab
					speciesName={data.speciesName}
					speciesId={data.speciesId}
					viewedGroupId={viewedGroup.id}
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
	params: { speciesName, year, month },
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
			/>
			{fullFatTypeGuard(data) ? (
				<SpeciesData data={data} viewedGroup={viewedGroup} />
			) : (
				<p>Not authorised to view any encounter data for this species</p>
			)}
		</PageWrapper>
	);
}
