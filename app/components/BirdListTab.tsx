'use client';
import { SpeciesTable } from '@/app/components/SingleSpeciesTable';
import { useState } from 'react';
import { fetchPageOfBirds } from '../actions/single-species-data';
import { useOnInView } from 'react-intersection-observer';
import type { EnrichedBirdOfSpecies } from '@/app/models/bird';

export function BirdListTab({
	speciesId,
	viewedGroupId,
	birds: initialBirds,
	birdCount
}: {
	speciesId: number;
	viewedGroupId: number;
	birds: EnrichedBirdOfSpecies[];
	birdCount: number;
}) {
	const [loadedBirds, setLoadedBirds] = useState(initialBirds);
	const [page, setPage] = useState(0);

	async function loadMoreBirds() {
		const nextPage = page + 1;
		setPage(nextPage);
		const newBirds = await fetchPageOfBirds(speciesId, viewedGroupId, nextPage);
		const loadedIds = loadedBirds.map((bird) => bird.id);
		setLoadedBirds([
			...loadedBirds,
			...newBirds.filter((bird) => !loadedIds.includes(bird.id))
		]);
	}

	const isFullyLoaded = loadedBirds.length >= birdCount;

	const loadMoreRef = useOnInView(
		(inView) => {
			if (inView && !isFullyLoaded) {
				loadMoreBirds();
			}
		},
		{ threshold: 0 }
	);

	return (
		<>
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
		</>
	);
}
