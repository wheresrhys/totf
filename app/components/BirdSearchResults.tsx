'use client';
import { useState } from 'react';
import { BoxyList, PageWrapper, PrimaryHeading } from './shared/DesignSystem';
import { NoPrefetchLink } from './shared/NoPrefetchLink';
import { RingSearchForm } from './shared/RingSearchForm';

export type SearchResult = {
	ring_no: string;
	species_name: string;
	closeness_score: number;
};

export function BirdSearchResults({
	params: { q },
	data
}: {
	params: { q: string };
	data: SearchResult[];
}) {
	const [selectedSpecies, setSelectedSpecies] = useState('all');

	const uniqueSpecies = [...new Set(data.map((r) => r.species_name))].sort();
	const filteredData =
		selectedSpecies === 'all'
			? data
			: data.filter((r) => r.species_name === selectedSpecies);

	return (
		<PageWrapper>
			<PrimaryHeading>Search results</PrimaryHeading>
			<p>No exact match found for {q}. Showing closest matches.</p>
			<div className="mt-4 mb-4 w-full sm:w-1/2 lg:w-1/3 xl:w-1/4">
				<RingSearchForm q={q} buttonText="Search again" />
			</div>
			{uniqueSpecies.length > 1 && (
				<div className="mt-2 mb-4">
					<select
						className="select"
						value={selectedSpecies}
						onChange={(e) => setSelectedSpecies(e.target.value)}
						aria-label="Filter by species"
					>
						<option value="all">All species</option>
						{uniqueSpecies.map((species) => (
							<option key={species} value={species}>
								{species}
							</option>
						))}
					</select>
				</div>
			)}
			<BoxyList>
				{filteredData.map(({ ring_no, species_name }) => (
					<li key={ring_no}>
						<NoPrefetchLink className="link" href={`/bird/${ring_no}`}>
							{ring_no}: {species_name}
						</NoPrefetchLink>
					</li>
				))}
			</BoxyList>
		</PageWrapper>
	);
}
