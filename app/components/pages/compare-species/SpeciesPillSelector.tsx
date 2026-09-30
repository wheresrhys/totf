'use client';

/**
 * The species-comparison page's picker (#115): every species the group has data
 * for, as pill buttons. Tapping one adds it to the table, tapping a selected
 * one removes it — so each pill is a toggle, exposed as `aria-pressed` rather
 * than as a checkbox, since visually it's a button and its effect is on the
 * table below, not on a form submission.
 *
 * Stateless: the caller owns `selectedSpecies` (it also has to mirror it onto
 * the URL) and decides what a toggle does.
 */
export function SpeciesPillSelector({
	availableSpecies,
	selectedSpecies,
	onToggle
}: {
	availableSpecies: string[];
	selectedSpecies: string[];
	onToggle: (speciesName: string) => void;
}) {
	if (availableSpecies.length === 0) {
		return <p data-testid="no-species-message">No species recorded.</p>;
	}
	return (
		<ul
			data-testid="species-pill-selector"
			className="my-3 flex flex-wrap gap-2"
		>
			{availableSpecies.map((speciesName) => {
				const isSelected = selectedSpecies.includes(speciesName);
				return (
					<li key={speciesName}>
						<button
							type="button"
							aria-pressed={isSelected}
							className={`btn btn-sm rounded-full ${
								isSelected ? 'btn-primary' : 'btn-soft btn-secondary'
							}`}
							onClick={() => onToggle(speciesName)}
						>
							{speciesName}
						</button>
					</li>
				);
			})}
		</ul>
	);
}
