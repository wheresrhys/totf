import {
	combinedSortValue,
	type CombinedFirstOfYearHighlight,
	type FirstOfYearSpeciesHighlight,
	type SessionHighlight
} from '@/app/models/session-highlights';

function isFirstOfYear(
	highlight: SessionHighlight
): highlight is FirstOfYearSpeciesHighlight {
	return highlight.type === 'first-of-year-species' && !highlight.isOnlyRecord;
}

// Comb-5: multiple "First <species> record(s) of the year" highlights merge into
// one "First A, B and C records of the year" line listing every species. One
// first-of-year highlight is left as-is; "Only ... of the year" (isOnlyRecord)
// highlights combine separately (Comb-2). The combined line always reads
// "records" (plural) even if every part was singular, since it covers at least
// two species. The combined item takes the position of the first first-of-year
// highlight.
export function combineFirstOfYearHighlights(
	highlights: SessionHighlight[]
): SessionHighlight[] {
	const firstOfYear = highlights.filter(isFirstOfYear);
	if (firstOfYear.length < 2) return highlights;
	const [first] = firstOfYear;
	const combined: CombinedFirstOfYearHighlight = {
		type: 'combined-first-of-year',
		sortValue: combinedSortValue(firstOfYear),
		speciesNames: firstOfYear.map((highlight) => highlight.speciesName),
		year: first.year,
		isCurrentYear: first.isCurrentYear
	};
	let combinedInserted = false;
	const result: SessionHighlight[] = [];
	for (const highlight of highlights) {
		if (isFirstOfYear(highlight)) {
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
