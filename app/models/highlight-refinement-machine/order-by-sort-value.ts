import {
	HIGHLIGHT_FAMILIES,
	type SessionHighlight
} from '@/app/models/session-highlights';

// Editorial family priority as a lookup: earlier in HIGHLIGHT_FAMILIES = higher.
const FAMILY_PRIORITY = new Map(
	HIGHLIGHT_FAMILIES.map((family, index) => [family, index])
);

// Ord-1 (final rule): sort every highlight by its explicit `sortValue`. Family
// comes first — a family always outranks every family listed after it — then
// `orderWithinFamily` (higher first) orders highlights sharing a family. Each
// highlight carries this key from creation (see the sort-value scheme in
// session-highlights.ts); the combine rules, which run before this one, stamp
// their merged highlights with an orderWithinFamily bumped above the parts they
// absorbed. A stable sort preserves generation order between highlights sharing
// a key.
export function orderBySortValue(
	highlights: SessionHighlight[]
): SessionHighlight[] {
	return [...highlights].sort((a, b) => {
		const familyDiff =
			FAMILY_PRIORITY.get(a.sortValue.family)! -
			FAMILY_PRIORITY.get(b.sortValue.family)!;
		if (familyDiff !== 0) return familyDiff;
		return b.sortValue.orderWithinFamily - a.sortValue.orderWithinFamily;
	});
}
