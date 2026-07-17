import type { SessionHighlight } from '@/app/models/session-highlights';

// Pass 1 — removal. Identity for now: #360's removal rules land here
// (Rem-1: drop busiest-since when a busiest session-total record is present;
// Rem-2: drop a narrower-scope species record when a broader-scope record for
// the same species is present). Kept as a single function while the rules are
// simple; it may later split into an array of removal-rule functions.
export function removeRedundantHighlights(
	highlights: SessionHighlight[]
): SessionHighlight[] {
	return [...highlights];
}

// Pass 2 — ordering. Reproduces the pre-machine fixed type-priority order
// like-for-like; #360 replaces this with scope-breadth ordering (Ord-1:
// all-time > any-season > this-year > this-season, non-scoped after records).
const HIGHLIGHT_TYPE_PRIORITY: SessionHighlight['type'][] = [
	'session-total-record',
	'since-comparison',
	'species-count-record',
	'first-ever-species',
	'first-of-year-species',
	'rare-species',
	'long-absence-retrap',
	'weight-record'
];

export function orderByScope(
	highlights: SessionHighlight[]
): SessionHighlight[] {
	return [...highlights].sort(
		(a, b) =>
			HIGHLIGHT_TYPE_PRIORITY.indexOf(a.type) -
			HIGHLIGHT_TYPE_PRIORITY.indexOf(b.type)
	);
}

// Pass 3 — combining. Identity for now: #360's combine rules land here
// (Comb-1: merge same-scope busiest + most-varied session records; Comb-2:
// merge multiple only-of-year items), folding a series of combine-rule
// functions over the ordered list.
export function combineHighlights(
	highlights: SessionHighlight[]
): SessionHighlight[] {
	return [...highlights];
}

// The three-pass highlight machine: every editorial refinement to the derived
// highlight pool is expressed as a removal, ordering or combining rule in one
// of the passes (rewording is not a machine rule — it lives in a highlight's
// own renderer).
export function runHighlightMachine(
	highlights: SessionHighlight[]
): SessionHighlight[] {
	return combineHighlights(orderByScope(removeRedundantHighlights(highlights)));
}
