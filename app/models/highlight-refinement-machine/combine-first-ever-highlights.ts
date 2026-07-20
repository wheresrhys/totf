import {
	combinedSortValue,
	type CombinedFirstEverHighlight,
	type FirstEverSpeciesHighlight,
	type SessionHighlight
} from '@/app/models/session-highlights';

function isFirstEver(
	highlight: SessionHighlight
): highlight is FirstEverSpeciesHighlight {
	return highlight.type === 'first-ever-species' && !highlight.isOnlyRecord;
}

// Comb-5: multiple "First ever <species> record(s)" highlights merge into one
// "First ever A, B and C records" line listing every species. One first-ever
// highlight is left as-is; "Only <species> records ever" (isOnlyRecord)
// highlights are never merged. The combined line always reads "records" (plural)
// even if every part was singular, since it covers at least two species. The
// combined item takes the position of the first first-ever highlight.
export function combineFirstEverHighlights(
	highlights: SessionHighlight[]
): SessionHighlight[] {
	const firstEver = highlights.filter(isFirstEver);
	if (firstEver.length < 2) return highlights;
	const combined: CombinedFirstEverHighlight = {
		type: 'combined-first-ever',
		sortValue: combinedSortValue(firstEver),
		speciesNames: firstEver.map((highlight) => highlight.speciesName)
	};
	let combinedInserted = false;
	const result: SessionHighlight[] = [];
	for (const highlight of highlights) {
		if (isFirstEver(highlight)) {
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
