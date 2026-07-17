import type { SessionHighlight } from '@/app/models/session-highlights';

// Ord-1 (final rule): sort every highlight by its explicit `sortValue`, highest
// first. Each highlight carries this value from creation (see the sort-value
// scheme in session-highlights.ts); the combine rules, which run before this one,
// stamp their merged highlights with a value bumped above the parts they absorbed.
// A stable sort preserves generation order between highlights sharing a value.
export function orderBySortValue(
	highlights: SessionHighlight[]
): SessionHighlight[] {
	return [...highlights].sort((a, b) => b.sortValue - a.sortValue);
}
