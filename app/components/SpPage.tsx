'use client';
import { useState } from 'react';
import { PageWrapper } from '@/app/components/shared/DesignSystem';
import { SpStats } from '@/app/components/SpStats';
import { SpeciesHeading } from '@/app/(routes)/species/_shared';
import 'chartkick/chart.js';
import type {
	FullFatPageData,
	PageData,
	PageParams
} from '@/app/(routes)/species/[speciesName]/page';
import type { ViewedGroup } from '@/lib/group-slug';
import { SpIndividualsTab } from './SpIndividualsTab';
import { SpNotableRetrapsTab } from './SpNotableRetrapsTab';
import { SpStatsHistoryTab } from './SpStatsHistoryTab';
import { SpWeightWingTab } from './SpWeightWingTab';
import { SpYearTotalsTab } from './SpYearTotalsTab';
import { SpMonthTotalsTab } from './SpMonthTotalsTab';
import { SpCombinedMonthTotalsTab } from './SpCombinedMonthTotalsTab';
import { SpSessionTotalsTab } from './SpSessionTotalsTab';
import { TabNav } from './TabNav';

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
					{ id: 'trend-charts', label: 'Trend charts' },
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
					{ id: 'size-plot', label: 'Size plot' }
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
			<ConditionalTabPanel
				loadedTabs={loadedTabs}
				tabId="trend-charts"
				activeTabId={activeTab}
			>
				<SpStatsHistoryTab
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
				tabId="size-plot"
				activeTabId={activeTab}
			>
				<SpWeightWingTab
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

export function SpPage({
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
