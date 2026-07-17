import type { SessionHighlight } from '@/app/models/session-highlights';
import { SCOPE_BREADTH_RANK } from './scope-breadth';

// Ord-1: the scoped record block sorts strictly by scope breadth (all-time
// first), interleaving session-total and species-count records. Everything else
// keeps its former relative order: the quietest-since comparison, then the
// first/rare/long-absence block, then weights last.
const SCOPED_RECORD_TYPES = new Set<SessionHighlight['type']>([
	'session-total-record',
	'combined-session-total-record',
	'species-count-record'
]);

// Order of the non-scoped highlight families that follow the record block
const TRAILING_TYPE_ORDER: SessionHighlight['type'][] = [
	'since-comparison',
	'first-ever-species',
	'first-of-year-species',
	'combined-only-of-year',
	'rare-species',
	'long-absence-retrap',
	'weight-record'
];

function scopeOf(highlight: SessionHighlight): number {
	if ('scope' in highlight) return SCOPE_BREADTH_RANK.get(highlight.scope)!;
	return 0;
}

// Within one scope a session-total record (or its combined form) leads its
// species-count records — so a "Busiest and most varied session" line heads the
// scope's block rather than trailing the individual species records.
const SESSION_TOTAL_TYPES = new Set<SessionHighlight['type']>([
	'session-total-record',
	'combined-session-total-record'
]);

// Sort key [group, scope, withinScope]: scoped records form the first group
// (sub-ordered by scope, then session-totals before species records); each
// trailing family follows in a fixed order. A stable sort preserves generation
// order within any group sharing a key.
function orderingKey(highlight: SessionHighlight): [number, number, number] {
	if (SCOPED_RECORD_TYPES.has(highlight.type)) {
		return [
			0,
			scopeOf(highlight),
			SESSION_TOTAL_TYPES.has(highlight.type) ? 0 : 1
		];
	}
	return [1 + TRAILING_TYPE_ORDER.indexOf(highlight.type), 0, 0];
}

export function orderByScope(
	highlights: SessionHighlight[]
): SessionHighlight[] {
	return [...highlights].sort((a, b) => {
		const [groupA, scopeA, withinA] = orderingKey(a);
		const [groupB, scopeB, withinB] = orderingKey(b);
		return groupA - groupB || scopeA - scopeB || withinA - withinB;
	});
}
