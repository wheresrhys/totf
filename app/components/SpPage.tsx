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
import { SpIndividualsTab } from './SpIndividualsTab';
import { SpNotableRetrapsTab } from './SpNotableRetrapsTab';
import { SpStatsHistoryTab } from './SpStatsHistoryTab';
import { SpWeightWingTab } from './SpWeightWingTab';
import { SpYearComparisonTab } from './SpYearComparisonTab';

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
	viewedGroupId
}: {
	data: FullFatPageData;
	viewedGroupId: number;
}) {
	const [loadedTabs, setLoadedTabs] = useState<Set<string>>(
		new Set(['bird-list'])
	);
	const [activeTab, setActiveTab] = useState('bird-list');

	function handleTabClick(event: React.MouseEvent<HTMLButtonElement>) {
		const tab = event.currentTarget.id.replace('tabs-control-', '');
		setLoadedTabs((prev) => new Set([...prev, tab]));
		setActiveTab(tab);
	}

	return (
		<>
			<SpStats {...data} viewedGroupId={viewedGroupId} />
			<nav
				className="bg-base-200 rounded-field w-fit space-x-1 overflow-x-auto p-1 mt-4"
				aria-label="Tabs"
				role="tablist"
				aria-orientation="horizontal"
			>
				<button
					type="button"
					id="tabs-control-bird-list"
					className={`btn  ${activeTab === 'bird-list' ? 'btn-default' : 'btn-secondary'}`}
					onClick={handleTabClick}
				>
					Bird list
				</button>
				<button
					type="button"
					id="tabs-control-retraps"
					className={`btn ${activeTab === 'retraps' ? 'btn-default' : 'btn-secondary'}`}
					onClick={handleTabClick}
				>
					Retraps
				</button>
				<button
					type="button"
					id="tabs-control-trend-charts"
					className={`btn ${activeTab === 'trend-charts' ? 'btn-default' : 'btn-secondary'}`}
					onClick={handleTabClick}
				>
					Trend charts
				</button>
				<button
					type="button"
					id="tabs-control-year-comparison"
					className={`btn ${activeTab === 'year-comparison' ? 'btn-default' : 'btn-secondary'}`}
					onClick={handleTabClick}
				>
					Year comparison
				</button>
				<button
					type="button"
					id="tabs-control-size-plot"
					className={`btn ${activeTab === 'size-plot' ? 'btn-default' : 'btn-secondary'}`}
					onClick={handleTabClick}
				>
					Size plot
				</button>
			</nav>
			<ConditionalTabPanel
				loadedTabs={loadedTabs}
				tabId="bird-list"
				activeTabId={activeTab}
			>
				<SpIndividualsTab
					speciesId={data.speciesId}
					viewedGroupId={viewedGroupId}
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
					viewedGroupId={viewedGroupId}
				/>
			</ConditionalTabPanel>
			<ConditionalTabPanel
				loadedTabs={loadedTabs}
				tabId="trend-charts"
				activeTabId={activeTab}
			>
				<SpStatsHistoryTab
					speciesName={data.speciesName}
					viewedGroupId={viewedGroupId}
				/>
			</ConditionalTabPanel>
			<ConditionalTabPanel
				loadedTabs={loadedTabs}
				tabId="year-comparison"
				activeTabId={activeTab}
			>
				<SpYearComparisonTab
					speciesName={data.speciesName}
					viewedGroupId={viewedGroupId}
				/>
			</ConditionalTabPanel>
			<ConditionalTabPanel
				loadedTabs={loadedTabs}
				tabId="size-plot"
				activeTabId={activeTab}
			>
				<SpWeightWingTab
					speciesId={data.speciesId}
					viewedGroupId={viewedGroupId}
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
	viewedGroupId
}: {
	params: PageParams;
	data: PageData;
	viewedGroupId: number;
}) {
	return (
		<PageWrapper>
			<PrimaryHeading>{speciesName}</PrimaryHeading>
			{fullFatTypeGuard(data) ? (
				<SpeciesData data={data} viewedGroupId={viewedGroupId} />
			) : (
				<p>Not authorised to view any encounter data for this species</p>
			)}
		</PageWrapper>
	);
}
