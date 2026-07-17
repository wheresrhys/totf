import type { SessionHighlight } from '@/app/models/session-highlights';
import { removeBusiestSinceWhenBusiestRecordHeld } from './remove-busiest-since-when-busiest-record-held';
import { removeNarrowerScopeSpeciesRecords } from './remove-narrower-scope-species-records';
import { orderByScope } from './order-by-scope';
import { combineSessionTotalRecords } from './combine-session-total-records';
import { combineOnlyOfYearHighlights } from './combine-only-of-year-highlights';

export { removeBusiestSinceWhenBusiestRecordHeld } from './remove-busiest-since-when-busiest-record-held';
export { removeNarrowerScopeSpeciesRecords } from './remove-narrower-scope-species-records';
export { orderByScope } from './order-by-scope';
export { combineSessionTotalRecords } from './combine-session-total-records';
export { combineOnlyOfYearHighlights } from './combine-only-of-year-highlights';

type HighlightRule = (highlights: SessionHighlight[]) => SessionHighlight[];

// The highlight machine: every editorial refinement to the derived highlight
// pool is one rule below, applied in order — each rule takes the previous rule's
// output. Rules remove, order or combine; rewording is not a machine rule (it
// lives in a highlight's own renderer). Add a refinement by writing a rule file
// and slotting it into this list. Ordering rules must precede the combining
// rules that rely on the sorted list.
const RULES: HighlightRule[] = [
	removeBusiestSinceWhenBusiestRecordHeld, // Rem-1
	removeNarrowerScopeSpeciesRecords, // Rem-2
	orderByScope, // Ord-1
	combineSessionTotalRecords, // Comb-1
	combineOnlyOfYearHighlights // Comb-2
];

export function runHighlightMachine(
	highlights: SessionHighlight[]
): SessionHighlight[] {
	return RULES.reduce((current, rule) => rule(current), highlights);
}
