/**
 * Selection + URL plumbing for the species-comparison page (#115,
 * `/compare/species?name=x&name=y`).
 *
 * The page's whole state is which species are selected and which by-species
 * stats dataset is on show. Everything that reads or writes the species
 * selection's repeated `?name=` params (so a comparison can be
 * bookmarked/shared) lives here rather than in the page's client component —
 * the route's `page.tsx` needs the parse half on the server, the content
 * component needs the build/toggle halves on the client. The dataset half is
 * now plain `?tabId=` tab state, owned by `TabSet` and
 * `app/components/pages/compare-species/compare-species-tab-params.ts`.
 *
 * Deliberately free of React and of any table/column concerns: the column
 * definitions for each dataset live next to the components that render them
 * (`app/components/pages/compare-species/comparison-columns.ts`).
 */

/** The repeated multi-value query-string param carrying the selection. */
export const SPECIES_QUERY_PARAM = 'name';

/**
 * Normalise Next.js' `searchParams.name` into a species list. Next gives a
 * bare string for one occurrence and an array for several, and a hand-edited
 * URL can repeat the same species or carry an empty `name=` — so both are
 * flattened away here, keeping first-seen order (the order the table's rows
 * were originally added in).
 */
export function parseSelectedSpeciesParam(
	rawParam: string | string[] | undefined
): string[] {
	if (rawParam === undefined) {
		return [];
	}
	const speciesNames = Array.isArray(rawParam) ? rawParam : [rawParam];
	return [...new Set(speciesNames.filter((name) => name.length > 0))];
}

/**
 * The inverse: a `name=a&name=b` query string for a selection (no leading
 * `?`). An empty selection yields an empty string, letting the caller drop the
 * `?` entirely rather than leaving a bare one on the URL.
 */
export function buildSpeciesComparisonQuery(selectedSpecies: string[]): string {
	const searchParams = new URLSearchParams();
	selectedSpecies.forEach((speciesName) =>
		searchParams.append(SPECIES_QUERY_PARAM, speciesName)
	);
	return searchParams.toString();
}

/**
 * Tapping a pill adds the species if it isn't shown and removes it if it is
 * (the ticket's "Tapping one that is shown again removes it"). Additions go on
 * the end so the URL records the order rows were added in.
 */
export function toggleSpeciesSelection(
	selectedSpecies: string[],
	speciesName: string
): string[] {
	return selectedSpecies.includes(speciesName)
		? selectedSpecies.filter((name) => name !== speciesName)
		: [...selectedSpecies, speciesName];
}

/**
 * A comparison table's row: one of the three by-species stats rows, but with
 * every value column optional. A species can legitimately be present in
 * `core_stats` and absent from `biometrics_stats` (nothing measurable was
 * caught), and the table still owes it a row — so the missing case is a row
 * carrying only its `species_name`, rendered as a line of blank cells, rather
 * than a silently dropped row whose absence would make the three datasets
 * disagree about how many species are being compared.
 */
export type ComparisonRow<Row extends { species_name: string }> =
	Partial<Row> & { species_name: string };

/**
 * The species a group has any data for at all, alphabetically — the pill list.
 * Sourced from the `core_stats` rows (the only one of the three datasets that
 * emits a row for every species, regardless of measurements or age coding).
 */
export function listAvailableSpecies(
	coreStatsRows: { species_name: string }[]
): string[] {
	return [...new Set(coreStatsRows.map((row) => row.species_name))].sort(
		(oneName, otherName) => oneName.localeCompare(otherName)
	);
}

/**
 * Project a dataset's rows onto the current selection: exactly one row per
 * selected species, in selection order, with a `species_name`-only placeholder
 * standing in for a species the dataset has no row for (see `ComparisonRow`).
 * Rows for unselected species are dropped.
 */
export function selectComparisonRows<Row extends { species_name: string }>(
	datasetRows: Row[],
	selectedSpecies: string[]
): ComparisonRow<Row>[] {
	const rowsBySpeciesName = new Map(
		datasetRows.map((row) => [row.species_name, row])
	);
	return selectedSpecies.map(
		(speciesName) =>
			// TypeScript can't see that a bare `{ species_name }` satisfies
			// `Partial<Row>` while `Row` is still generic (it has no way to know
			// `Row`'s other keys are all optional in the intersection), so the
			// placeholder needs asserting — a single assertion, not one through
			// `unknown`, so the `species_name` field is still checked.
			rowsBySpeciesName.get(speciesName) ??
			({ species_name: speciesName } as ComparisonRow<Row>)
	);
}
