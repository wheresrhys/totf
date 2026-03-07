'use client';
import { SpeciesTable } from '@/app/components/SingleSpeciesTable';
import { type TopPeriodsResult } from '@/app/models/db';
import { EnrichedBirdOfSpecies } from '@/app/models/bird';
import { useState } from 'react';
import {
	PageWrapper,
	PrimaryHeading
} from '@/app/components/shared/DesignSystem';
import { SingleSpeciesStats } from '@/app/components/SingleSpeciesStats';
import type { SpeciesStatsRow } from '@/app/models/db';
import 'chartkick/chart.js';
import { fetchPageOfBirds } from '../actions/single-species-data';
import { useOnInView } from 'react-intersection-observer';
import { WeightVsWingLengthChart } from '@/app/components/WeightAndWingChart';
import { SingleSpeciesFilters } from '@/app/components/SingleSpeciesFilters';

type PageParams = { speciesName: string };

export type PageData = {
	topSessions: TopPeriodsResult[];
	birds: EnrichedBirdOfSpecies[];
	speciesStats: SpeciesStatsRow;
};

export function SpeciesPageWithFilters({
	params: { speciesName },
	data
}: {
	params: PageParams;
	data: PageData;
}) {
	const [retrappedOnly, setRetrappedOnly] = useState(false);
	const [sexedOnly, setSexedOnly] = useState(false);
	const [loadedBirds, setLoadedBirds] = useState(data.birds);
	const [page, setPage] = useState(0);

	async function loadMoreBirds() {
		const nextPage = page + 1;
		setPage(nextPage);
		const newBirds = await fetchPageOfBirds(speciesName, nextPage);
		setLoadedBirds([
			...loadedBirds,
			...newBirds.filter((bird) => !loadedIds.includes(bird.id))
		]);
	}

	const loadMoreRef = useOnInView(
		(inView) => {
			if (inView) {
				loadMoreBirds();
			}
		},
		{ threshold: 0 }
	);

	const isFullyLoaded =
		loadedBirds.length >= (data.speciesStats.bird_count ?? 0);
	const [showChart, setShowChart] = useState(false);
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
		<PageWrapper>
			<PrimaryHeading>{speciesName}</PrimaryHeading>
			<SingleSpeciesStats {...data} />
			{showChart ? <WeightVsWingLengthChart birds={birds} /> : null}
			<SingleSpeciesFilters
				retrappedOnly={retrappedOnly}
				setRetrappedOnly={setRetrappedOnly}
				setSexedOnly={setSexedOnly}
				sexedOnly={sexedOnly}
				setShowChart={setShowChart}
				showChart={showChart}
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
		</PageWrapper>
	);
}
