'use client';
import { SpeciesTable } from '@/app/components/SingleSpeciesTable';
import { useState } from 'react';
import {
	PageWrapper,
	PrimaryHeading
} from '@/app/components/shared/DesignSystem';
import { SingleSpeciesStats } from '@/app/components/SingleSpeciesStats';
import 'chartkick/chart.js';
import { fetchPageOfBirds } from '../actions/single-species-data';
import { useOnInView } from 'react-intersection-observer';
import { WeightVsWingLengthChart } from '@/app/components/WeightAndWingChart';
import { StatsHistoryChart } from '@/app/components/StatsHistoryChart';
import { SingleSpeciesFilters } from '@/app/components/SingleSpeciesFilters';
import type {
	FullFatPageData,
	PageData,
	PageParams
} from '@/app/(routes)/species/[speciesName]/page';

function SpeciesData({
	data,
	groupId
}: {
	data: FullFatPageData;
	groupId: number;
}) {
	const [retrappedOnly, setRetrappedOnly] = useState(false);
	const [sexedOnly, setSexedOnly] = useState(false);
	const [loadedBirds, setLoadedBirds] = useState(data.birds);
	const [page, setPage] = useState(0);

	async function loadMoreBirds() {
		const nextPage = page + 1;
		setPage(nextPage);
		const newBirds = await fetchPageOfBirds(data.speciesId, groupId, nextPage);
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

	const [showWeightVsWingChart, setShowWeightVsWingChart] = useState(false);
	const [showStatsHistory, setShowStatsHistory] = useState(false);
	let birds = loadedBirds;
	const loadedIds = loadedBirds.map((bird) => bird.id);
	if (retrappedOnly) {
		birds = birds.filter((bird) =>
			bird.encounters.some((encounter) => encounter.record_type === 'S')
		);
	}
	if (sexedOnly) {
		birds = birds.filter((bird) => bird.sex !== 'U');
	}
	return (
		<>
			<SingleSpeciesStats {...data} groupId={groupId} />
			{showWeightVsWingChart ? (
				<WeightVsWingLengthChart birds={data.graphableEncounterData} />
			) : null}
			{showStatsHistory ? (
				<StatsHistoryChart statsHistory={data.speciesStatsHistory} />
			) : null}
			<SingleSpeciesFilters
				retrappedOnly={retrappedOnly}
				setRetrappedOnly={setRetrappedOnly}
				setSexedOnly={setSexedOnly}
				sexedOnly={sexedOnly}
				setShowWeightVsWingChart={setShowWeightVsWingChart}
				showWeightVsWingChart={showWeightVsWingChart}
				setShowStatsHistory={setShowStatsHistory}
				showStatsHistory={showStatsHistory}
			/>
			<SpeciesTable birds={birds} />
			{isFullyLoaded ? null : (
				<div
					ref={loadMoreRef}
					data-testid="infinite-scroll-loader"
					className="flex items-center justify-center"
				>
					<div className="loading loading-spinner loading-xl"></div>
				</div>
			)}
		</>
	);
}

function fullFatTypeGuard(data: PageData): data is FullFatPageData {
	return 'birds' in data;
}

export function SpeciesPageWithFilters({
	params: { speciesName },
	data,
	groupId
}: {
	params: PageParams;
	data: PageData;
	groupId: number;
}) {
	return (
		<PageWrapper>
			<PrimaryHeading>{speciesName}</PrimaryHeading>
			{fullFatTypeGuard(data) ? (
				<SpeciesData data={data} groupId={groupId} />
			) : (
				<p>Not authorised to view any encounter data for this species</p>
			)}
		</PageWrapper>
	);
}
