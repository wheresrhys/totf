import type { SessionHighlight } from '@/app/models/session-highlights';
import { removeBusiestSinceWhenBusiestRecordHeld } from './remove-busiest-since-when-busiest-record-held';
import { removeNarrowerScopeSpeciesRecords } from './remove-narrower-scope-species-records';
import { combineSessionTotalRecords } from './combine-session-total-records';
import { combineOnlyOfYearHighlights } from './combine-only-of-year-highlights';
import { orderBySortValue } from './order-by-sort-value';

export { removeBusiestSinceWhenBusiestRecordHeld } from './remove-busiest-since-when-busiest-record-held';
export { removeNarrowerScopeSpeciesRecords } from './remove-narrower-scope-species-records';
export { combineSessionTotalRecords } from './combine-session-total-records';
export { combineOnlyOfYearHighlights } from './combine-only-of-year-highlights';
export { orderBySortValue } from './order-by-sort-value';

type HighlightRule = (highlights: SessionHighlight[]) => SessionHighlight[];

// The highlight machine: every editorial refinement to the derived highlight
// pool is one rule below, applied in order — each rule takes the previous rule's
// output. Rules remove, combine or order; rewording is not a machine rule (it
// lives in a highlight's own renderer). Add a refinement by writing a rule file
// and slotting it into this list. Combining precedes the final ordering, which is
// the last rule and sorts purely by each highlight's `sortValue` — so a combined
// highlight's own value determines where it lands.
const RULES: HighlightRule[] = [
	removeBusiestSinceWhenBusiestRecordHeld, // Rem-1
	removeNarrowerScopeSpeciesRecords, // Rem-2
	combineSessionTotalRecords, // Comb-1
	combineOnlyOfYearHighlights, // Comb-2
	orderBySortValue // Ord-1
];

export function runHighlightMachine(
	highlights: SessionHighlight[]
): SessionHighlight[] {
	return RULES.reduce((current, rule) => rule(current), highlights);
}
