export type SpeciesAlphabetGroup<T> = {
	letter: string;
	species: T[];
};

/**
 * Groups species by the uppercased first character of `species_name`, one
 * group per letter that has at least one species. Groups are sorted
 * alphabetically by letter, and species within a group are sorted
 * alphabetically by name.
 */
export function groupSpeciesByFirstLetter<T extends { species_name: string }>(
	species: T[]
): SpeciesAlphabetGroup<T>[] {
	const speciesByLetter = new Map<string, T[]>();
	for (const speciesRow of species) {
		const letter = speciesRow.species_name.charAt(0).toUpperCase();
		const group = speciesByLetter.get(letter);
		if (group) {
			group.push(speciesRow);
		} else {
			speciesByLetter.set(letter, [speciesRow]);
		}
	}
	return [...speciesByLetter.entries()]
		.sort(([letterA], [letterB]) => letterA.localeCompare(letterB))
		.map(([letter, speciesForLetter]) => ({
			letter,
			species: [...speciesForLetter].sort((a, b) =>
				a.species_name.localeCompare(b.species_name)
			)
		}));
}
