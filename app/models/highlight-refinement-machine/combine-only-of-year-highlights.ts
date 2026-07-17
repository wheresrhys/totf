import type {
	CombinedOnlyOfYearHighlight,
	FirstOfYearSpeciesHighlight,
	SessionHighlight
} from '@/app/models/session-highlights';

function isOnlyOfYear(
	highlight: SessionHighlight
): highlight is FirstOfYearSpeciesHighlight {
	return highlight.type === 'first-of-year-species' && highlight.isOnlyRecord;
}

// Comb-2: multiple "Only <species> records of the year" highlights merge into a
// single line listing every species. One only-of-year highlight is left as-is;
// first-of-year (non-only) highlights are never merged. The combined item takes
// the position of the first only-of-year highlight.
export function combineOnlyOfYearHighlights(
	highlights: SessionHighlight[]
): SessionHighlight[] {
	const onlyOfYear = highlights.filter(isOnlyOfYear);
	if (onlyOfYear.length < 2) return highlights;
	const [first] = onlyOfYear;
	const combined: CombinedOnlyOfYearHighlight = {
		type: 'combined-only-of-year',
		speciesNames: onlyOfYear.map((highlight) => highlight.speciesName),
		year: first.year,
		isCurrentYear: first.isCurrentYear
	};
	let combinedInserted = false;
	const result: SessionHighlight[] = [];
	for (const highlight of highlights) {
		if (isOnlyOfYear(highlight)) {
			if (!combinedInserted) {
				result.push(combined);
				combinedInserted = true;
			}
			continue;
		}
		result.push(highlight);
	}
	return result;
}
