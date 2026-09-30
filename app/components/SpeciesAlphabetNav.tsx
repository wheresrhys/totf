'use client';
import { useState } from 'react';
import { NoPrefetchLink } from '@/app/components/shared/NoPrefetchLink';
import {
	groupSpeciesByFirstLetter,
	type SpeciesWithBirdsCount
} from '@/app/models/species';

const PANEL_ID = 'species-alphabet-nav-panel';

// Home page species nav (#1025): one small circular button per letter that
// has at least one of the group's species, wrapping onto multiple lines.
// Tapping a letter expands an absolutely-positioned panel of links to that
// letter's species pages — absolute (not in normal flow) so opening it never
// shifts the content below, per the ticket's explicit requirement.
export function SpeciesAlphabetNav({
	species
}: {
	species: SpeciesWithBirdsCount[];
}) {
	const [expandedLetter, setExpandedLetter] = useState<string | null>(null);
	const groups = groupSpeciesByFirstLetter(species);
	const expandedGroup = groups.find((group) => group.letter === expandedLetter);

	function toggleLetter(letter: string) {
		setExpandedLetter((current) => (current === letter ? null : letter));
	}

	return (
		<div className="relative">
			<ul
				className="flex flex-wrap gap-2"
				aria-label="Browse species by letter"
			>
				{groups.map((group) => {
					const isExpanded = group.letter === expandedLetter;
					return (
						<li key={group.letter}>
							<button
								type="button"
								onClick={() => toggleLetter(group.letter)}
								aria-expanded={isExpanded}
								aria-controls={PANEL_ID}
								aria-label={`Show species starting with ${group.letter}`}
								className={`rounded-full h-8 w-8 flex items-center justify-center text-sm font-medium border border-base-content/25 cursor-pointer ${
									isExpanded
										? 'bg-primary text-primary-content'
										: 'bg-base-100 hover:bg-base-200'
								}`}
							>
								{group.letter}
							</button>
						</li>
					);
				})}
			</ul>
			{expandedGroup && (
				<div
					id={PANEL_ID}
					role="region"
					aria-label={`Species starting with ${expandedGroup.letter}`}
					className="absolute z-10 mt-2 w-full rounded-md border border-base-content/25 bg-base-100 p-3 shadow-lg"
				>
					<ul className="flex flex-wrap gap-2">
						{expandedGroup.species.map((speciesRow) => (
							<li key={speciesRow.id}>
								<NoPrefetchLink
									href={`/species/${speciesRow.species_name}`}
									className="link badge badge-outline"
								>
									{speciesRow.species_name}
								</NoPrefetchLink>
							</li>
						))}
					</ul>
				</div>
			)}
		</div>
	);
}
