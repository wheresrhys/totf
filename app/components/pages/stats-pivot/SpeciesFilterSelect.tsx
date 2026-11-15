'use client';

/** All species combined (empty value), or one species. Stateless. */
export function SpeciesFilterSelect({
	availableSpecies,
	selectedSpecies,
	onChange
}: {
	availableSpecies: string[];
	selectedSpecies: string | null;
	onChange: (species: string | null) => void;
}) {
	return (
		<select
			className="select select-sm my-3 w-auto"
			aria-label="Filter by species"
			value={selectedSpecies ?? ''}
			onChange={(event) => onChange(event.target.value || null)}
		>
			<option value="">All species</option>
			{availableSpecies.map((speciesName) => (
				<option key={speciesName} value={speciesName}>
					{speciesName}
				</option>
			))}
		</select>
	);
}
