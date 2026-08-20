'use client';
import { useState } from 'react';
import {
	PageWrapper,
	PrimaryHeading
} from '@/app/components/shared/DesignSystem';
import { SpStats } from '@/app/components/SpStats';
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
import { SpYearComparisonTab } from './SpYearComparisonTab';
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

	return (
		<>
			<SpStats {...data} viewedGroup={viewedGroup} />
			<TabNav
				tabs={[
					{ id: 'bird-list', label: 'Bird list' },
					{ id: 'retraps', label: 'Retraps' },
					{ id: 'trend-charts', label: 'Trend charts' },
					{ id: 'year-comparison', label: 'Year comparison' },
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
				/>
			</ConditionalTabPanel>
			<ConditionalTabPanel
				loadedTabs={loadedTabs}
				tabId="year-comparison"
				activeTabId={activeTab}
			>
				<SpYearComparisonTab
					speciesName={data.speciesName}
					viewedGroupId={viewedGroup.id}
				/>
			</ConditionalTabPanel>
			<ConditionalTabPanel
				loadedTabs={loadedTabs}
				tabId="size-plot"
				activeTabId={activeTab}
			>
				<SpWeightWingTab
					speciesId={data.speciesId}
					viewedGroupId={viewedGroup.id}
				/>
			</ConditionalTabPanel>
		</>
	);
}

function fullFatTypeGuard(data: PageData): data is FullFatPageData {
	return 'birds' in data;
}

export function SpPage({
	params: { speciesName },
	data,
	viewedGroup
}: {
	params: PageParams;
	data: PageData;
	viewedGroup: ViewedGroup;
}) {
	return (
		<PageWrapper>
			<PrimaryHeading>{speciesName}</PrimaryHeading>
			{fullFatTypeGuard(data) ? (
				<SpeciesData data={data} viewedGroup={viewedGroup} />
			) : (
				<p>Not authorised to view any encounter data for this species</p>
			)}
		</PageWrapper>
	);
}
