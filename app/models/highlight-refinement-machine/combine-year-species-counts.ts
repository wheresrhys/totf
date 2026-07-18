import {
	combinedSortValue,
	type CombinedSpeciesCountRecordHighlight,
	type SessionHighlight,
	type SpeciesCountRecordHighlight
} from '@/app/models/session-highlights';

// Only this-year species-count records merge into one line — their copy is
// "the most this year", which reads cleanly as a species list. All-time records
// stay per-species (placements, "the most ever") and are never merged.
function isCombinable(
	highlight: SessionHighlight
): highlight is SpeciesCountRecordHighlight & { scope: 'this-year' } {
	return (
		highlight.type === 'species-count-record' && highlight.scope === 'this-year'
	);
}

// Comb-3: multiple single-species "Record day for X — N caught, the most this
// year" highlights merge into one "Highest A, B and C counts of the year" line,
// dropping the per-species count. A lone this-year record is left unchanged. The
// combined item takes the position of the first this-year record.
export function combineYearSpeciesCounts(
	highlights: SessionHighlight[]
): SessionHighlight[] {
	const records = highlights.filter(isCombinable);
	// Only combine when at least two this-year records exist
	if (records.length < 2) return highlights;

	let inserted = false;
	const result: SessionHighlight[] = [];
	for (const highlight of highlights) {
		if (isCombinable(highlight)) {
			// Emit the combined line in place of the first record; drop the rest
			if (inserted) continue;
			inserted = true;
			const [first] = records;
			const combined: CombinedSpeciesCountRecordHighlight = {
				type: 'combined-species-count-record',
				sortValue: combinedSortValue(records),
				scope: 'this-year',
				speciesNames: records.map((record) => record.speciesName),
				year: first.year,
				isCurrentYear: first.isCurrentYear
			};
			result.push(combined);
			continue;
		}
		result.push(highlight);
	}
	return result;
}
