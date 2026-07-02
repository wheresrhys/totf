'use client';
import { SpeciesTable } from '@/app/components/SingleSpeciesTable';
import { useEffect, useState } from 'react';
import {
	PageWrapper,
	PrimaryHeading,
	SecondaryHeading
} from '@/app/components/shared/DesignSystem';
import { SingleSpeciesStats } from '@/app/components/SingleSpeciesStats';
import 'chartkick/chart.js';
import {
	fetchPageOfBirds,
	fetchNotableRetraps
} from '../actions/single-species-data';
import { useOnInView } from 'react-intersection-observer';
import { WeightVsWingLengthChart } from '@/app/components/WeightAndWingChart';
import { StatsHistoryChart } from '@/app/components/StatsHistoryChart';
import type {
	FullFatPageData,
	PageData,
	PageParams
} from '@/app/(routes)/species/[speciesName]/page';
import { NotableRetrapsTable } from './NotableRetrapsTable';
import type { NotableRetrapsResult } from '@/app/models/db';

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

function NotableRetrapsSection({
	speciesName,
	viewedGroupId
}: {
	speciesName: string;
	viewedGroupId: number;
}) {
	const [notableRetraps, setNotableRetraps] = useState<NotableRetrapsResult[]>(
		[]
	);
	const [isLoaded, setIsLoaded] = useState(false);
	useEffect(() => {
		if (notableRetraps.length > 0) return;
		fetchNotableRetraps(speciesName, viewedGroupId).then((data) => {
			setNotableRetraps(data);
			setIsLoaded(true);
		});
	}, [speciesName, viewedGroupId, notableRetraps.length]);
	return (
		<>
			<SecondaryHeading>Notable Retraps</SecondaryHeading>
			{notableRetraps.length > 0 ? (
				<NotableRetrapsTable data={notableRetraps} omitSpeciesName={true} />
			) : isLoaded ? (
				<p>No notable retraps found</p>
			) : (
				<div className="loading loading-spinner loading-xl"></div>
			)}
			{isLoaded ? null : (
				<div className="flex items-center justify-center">
					<div className="loading loading-spinner loading-xl"></div>
				</div>
			)}
		</>
	);
}

function SpeciesData({
	data,
	viewedGroupId
}: {
	data: FullFatPageData;
	viewedGroupId: number;
}) {
	const [loadedBirds, setLoadedBirds] = useState(data.birds);
	const [page, setPage] = useState(0);
	const [loadedTabs, setLoadedTabs] = useState<Set<string>>(
		new Set(['bird-list'])
	);

	const [activeTab, setActiveTab] = useState('bird-list');
	function handleTabClick(event: React.MouseEvent<HTMLButtonElement>) {
		const tab = event.currentTarget.id.replace('tabs-control-', '');
		setLoadedTabs((prev) => new Set([...prev, tab]));
		setActiveTab(tab);
	}

	async function loadMoreBirds() {
		const nextPage = page + 1;
		setPage(nextPage);
		const newBirds = await fetchPageOfBirds(
			data.speciesId,
			viewedGroupId,
			nextPage
		);
		setLoadedBirds([
			...loadedBirds,
			...newBirds.filter((bird) => !loadedIds.includes(bird.id))
		]);
	}
	const isFullyLoaded =
		loadedBirds.length >= (data.speciesStats.bird_count ?? 0);

	const loadMoreRef = useOnInView(
		(inView) => {
			if (inView && !isFullyLoaded) {
				loadMoreBirds();
			}
		},
		{ threshold: 0 }
	);

	const loadedIds = loadedBirds.map((bird) => bird.id);
	return (
		<>
			<SingleSpeciesStats {...data} viewedGroupId={viewedGroupId} />
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
					id="tabs-control-stats-history"
					className={`btn ${activeTab === 'stats-history' ? 'btn-default' : 'btn-secondary'}`}
					onClick={handleTabClick}
				>
					Stats history
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
				<SpeciesTable birds={loadedBirds} />
				{isFullyLoaded ? null : (
					<div
						ref={loadMoreRef}
						data-testid="infinite-scroll-loader"
						className="flex items-center justify-center"
					>
						<div className="loading loading-spinner loading-xl"></div>
					</div>
				)}
			</ConditionalTabPanel>
			<ConditionalTabPanel
				loadedTabs={loadedTabs}
				tabId="retraps"
				activeTabId={activeTab}
			>
				<NotableRetrapsSection
					speciesName={data.speciesName}
					viewedGroupId={viewedGroupId}
				/>
			</ConditionalTabPanel>
			<ConditionalTabPanel
				loadedTabs={loadedTabs}
				tabId="stats-history"
				activeTabId={activeTab}
			>
				<StatsHistoryChart
					speciesName={data.speciesName}
					viewedGroupId={viewedGroupId}
				/>
			</ConditionalTabPanel>
			<ConditionalTabPanel
				loadedTabs={loadedTabs}
				tabId="size-plot"
				activeTabId={activeTab}
			>
				<WeightVsWingLengthChart
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

export function SingleSpeciesPage({
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
