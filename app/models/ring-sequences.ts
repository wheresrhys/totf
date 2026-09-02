import type { RingSequenceRow, RingSize } from '@/app/models/db';

// The 22 `ring_size` enum values in their natural ascending order, mirroring
// `Database['public']['Enums']['ring_size']`. Defined once and reused by both
// `groupRingSequencesBySize` (bucket ordering) and the edit modal's dropdown.
export const RING_SIZE_ENUM_ORDER: RingSize[] = [
	'AA',
	'A',
	'A2',
	'B',
	'B+',
	'B2',
	'SO',
	'C',
	'C2',
	'CC',
	'D2',
	'E',
	'Fc',
	'Fv',
	'G',
	'H',
	'J',
	'K',
	'L',
	'L+',
	'MI',
	'MS'
];

export type RingSequenceSizeGroup = {
	// `null` is the "missing size" bucket — rows whose `size` has not been set.
	size: RingSize | null;
	sequences: RingSequenceRow[];
};

// Buckets `RingSequences` rows by their real `size` column. The "missing
// size" bucket (size IS NULL) comes first so it reads as needing attention;
// populated size buckets follow in `RING_SIZE_ENUM_ORDER`.
export function groupRingSequencesBySize(
	sequences: RingSequenceRow[]
): RingSequenceSizeGroup[] {
	const buckets = new Map<RingSize | null, RingSequenceRow[]>();
	for (const sequence of sequences) {
		const key = sequence.size ?? null;
		if (!buckets.has(key)) buckets.set(key, []);
		buckets.get(key)!.push(sequence);
	}

	const groups: RingSequenceSizeGroup[] = [];
	if (buckets.has(null)) {
		groups.push({ size: null, sequences: buckets.get(null)! });
	}
	for (const size of RING_SIZE_ENUM_ORDER) {
		if (buckets.has(size)) {
			groups.push({ size, sequences: buckets.get(size)! });
		}
	}
	return groups;
}

// --- Unassigned import prefixes (issue #697) ---
//
// The Ring Sequences page lists every first-3-character prefix used by the
// group's newly-ringed (`record_type = 'N'`) birds that aren't yet assigned to
// a `RingSequences` row, so the user can create sequences for them. Prefix
// derivation matches `promoteControlToSequence`'s `ringNo.slice(0, 3)` — the
// exact text stored in `RingSequences.prefix`.

const IMPORT_PREFIX_LENGTH = 3;

// One first-3-character prefix used by the group's unassigned newly-ringed
// birds, plus the distinct ring numbers sharing it. Produced by
// `groupRingNosByPrefix` and rendered at the top of the Ring Sequences page.
export type UnassignedImportPrefix = {
	prefix: string;
	ring_nos: string[];
};

// Groups a flat list of unassigned birds' ring numbers into one entry per
// first-3-character prefix, each carrying the distinct ring numbers sharing it
// (sorted), with the prefixes themselves sorted. Pure so the fetch action and
// its tests share one grouping definition.
export function groupRingNosByPrefix(
	rows: { ring_no: string }[]
): UnassignedImportPrefix[] {
	const byPrefix = new Map<string, Set<string>>();
	for (const { ring_no } of rows) {
		const prefix = ring_no.slice(0, IMPORT_PREFIX_LENGTH);
		if (!byPrefix.has(prefix)) byPrefix.set(prefix, new Set());
		byPrefix.get(prefix)!.add(ring_no);
	}

	return [...byPrefix.entries()]
		.map(([prefix, ringNos]) => ({
			prefix,
			ring_nos: [...ringNos].sort()
		}))
		.sort((a, b) => a.prefix.localeCompare(b.prefix));
}

// Splits a ring number into its leading alphabetic prefix and trailing numeric
// portion, e.g. "AEL1699" -> { alpha: "AEL", width: 4, index: 1699 }. Mirrors
// the SQL `substring(... from '^[A-Za-z]+')` / `'[0-9]+$'` parse the removed
// bounds trigger used (#659/#695). Returns null for a ring with no leading
// letters or no trailing digits.
function parseRing(
	ringNo: string
): { alpha: string; width: number; index: number } | null {
	const alpha = ringNo.match(/^[A-Za-z]+/)?.[0];
	const numericStr = ringNo.match(/[0-9]+$/)?.[0];
	if (!alpha || !numericStr) return null;
	return { alpha, width: numericStr.length, index: parseInt(numericStr, 10) };
}

function numericSuffix(ringNo: string): number {
	return parseInt(ringNo.match(/[0-9]+$/)![0], 10);
}

// Suggests `first_ring`/`last_ring` bounds for a new ring sequence created from
// a set of ring numbers, by folding the removed bounds trigger's per-bird
// algorithm (#659/#695) over the rings in ascending numeric order. That trigger
// widened a sequence's bounds one assignment at a time; replaying it over the
// whole set in a stable order reproduces the same suggestion it would have
// arrived at, so the ring-sequences UI can offer it before the user confirms.
// Returns null when no ring parses into an alpha-prefix + numeric-suffix shape.
export function deriveRingBounds(
	ringNos: string[]
): { first_ring: string; last_ring: string } | null {
	const parsed = ringNos
		.map(parseRing)
		.filter((ring): ring is NonNullable<typeof ring> => ring !== null)
		.sort((a, b) => a.index - b.index);
	if (parsed.length === 0) return null;

	let firstRing: string | null = null;
	let lastRing: string | null = null;

	for (const { alpha, width, index: ringIndex } of parsed) {
		// This ring's decade start — greatest number ending in 1 that is <= it.
		// Matches the trigger's `10 * floor((ring_index - 1) / 10) + 1`.
		const startIndex = 10 * Math.floor((ringIndex - 1) / 10) + 1;
		const startRing = alpha + String(startIndex).padStart(width, '0');

		// Maybe move first_ring backward to cover this ring's decade start.
		const newFirstRing: string =
			firstRing === null || startIndex < numericSuffix(firstRing)
				? startRing
				: firstRing;

		// Current last index, defaulting to one full decade when empty.
		let lastIndex: number =
			lastRing !== null ? numericSuffix(lastRing) : startIndex + 9;

		// Widen to cover this ring if needed, rounding up to the nearest ten.
		if (ringIndex > lastIndex) {
			lastIndex =
				ringIndex % 10 === 0 ? ringIndex : ringIndex + (10 - (ringIndex % 10));
		}

		// Escalate the batch width in tiers relative to the (possibly just-moved)
		// first_ring, largest-tier-first so a span over 100 reaches the 500 tier.
		const firstIndex = numericSuffix(newFirstRing);
		if (lastIndex - firstIndex > 100) {
			lastIndex = firstIndex + 500;
		} else if (lastIndex - firstIndex > 50) {
			lastIndex = firstIndex + 100;
		}

		// Pad to the ring's numeric width, growing the digit count rather than
		// truncating if escalation pushed last_index past what that width holds.
		const lastWidth = Math.max(width, String(lastIndex).length);
		firstRing = newFirstRing;
		lastRing = alpha + String(lastIndex).padStart(lastWidth, '0');
	}

	return { first_ring: firstRing!, last_ring: lastRing! };
}

// The trailing digits of a ring number as an integer, or null when it has no
// trailing digits (so it can't be range-compared). Mirrors the
// `substring(... FROM '[0-9]+$')` parse the `first_index`/`last_index` generated
// columns use, and `createRingSequenceLookup`'s `ringNo.match(/[0-9]+$/)`.
// Exported so the reconciliation helper in `app/actions/ring-sequences.ts` can
// match candidate birds against a sequence's numeric window with the same parse.
export function trailingRingNumber(ringNo: string): number | null {
	const match = ringNo.match(/[0-9]+$/);
	return match ? parseInt(match[0], 10) : null;
}

// Validates a proposed `first_ring`/`last_ring` pair for a ring sequence before
// it hits the DB. Returns a friendly error message, or null when the pair is
// valid. Bounds are set as a pair: either both present or both absent (clearing
// isn't in scope — "neither set" is valid and leaves existing bounds untouched).
// When present, both must start with the sequence's immutable `prefix` (mirroring
// #729's DB CHECK, surfaced before the write) and `first_ring` must not be
// numerically greater than `last_ring`. Pure so the edit action and its unit
// tests share one definition.
export function validateRingSequenceBounds(
	prefix: string,
	firstRing: string | null,
	lastRing: string | null
): string | null {
	const hasFirst = firstRing != null && firstRing !== '';
	const hasLast = lastRing != null && lastRing !== '';

	if (hasFirst !== hasLast) {
		return 'Set both a first and last ring, or neither';
	}
	if (!hasFirst && !hasLast) {
		return null;
	}

	if (!firstRing!.startsWith(prefix) || !lastRing!.startsWith(prefix)) {
		return `First and last ring must start with the prefix "${prefix}"`;
	}

	const firstIndex = trailingRingNumber(firstRing!);
	const lastIndex = trailingRingNumber(lastRing!);
	if (firstIndex === null || lastIndex === null) {
		return 'First and last ring must end in a number';
	}
	if (firstIndex > lastIndex) {
		return 'First ring must not be greater than last ring';
	}

	return null;
}

export function findUnusedRings(
	rings: string[],
	prefixLength: number
): string[] {
	if (rings.length === 0) return [];

	const suffixLength = rings[0].length - prefixLength;
	const prefix = rings[0].slice(0, prefixLength);
	const suffixes = rings.map((ring) => parseInt(ring.slice(prefixLength), 10));
	const min = Math.min(...suffixes);
	const max = Math.max(...suffixes);
	const suffixSet = new Set(suffixes);

	const unused: string[] = [];
	for (let i = min + 1; i < max; i++) {
		if (!suffixSet.has(i)) {
			unused.push(`${prefix}${String(i).padStart(suffixLength, '0')}`);
		}
	}
	return unused;
}
