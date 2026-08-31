import type { RingSequenceSummary } from '@/app/actions/ring-sequences';
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

// Buckets `RingSequences` rows by their real `size` column (not the heuristic
// `classifyRingSize`). The "missing size" bucket (size IS NULL) comes first so
// it reads as needing attention; populated size buckets follow in
// `RING_SIZE_ENUM_ORDER`.
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

export type RingSizeName =
	| 'AA'
	| 'A'
	| 'B, C, C2'
	| 'D'
	| 'E'
	| 'F'
	| 'SO'
	| 'Large';

export const RING_SIZE_ORDER: RingSizeName[] = [
	'AA',
	'A',
	'B, C, C2',
	'D',
	'E',
	'F',
	'SO',
	'Large'
];

export type RingSizeGroup = {
	name: RingSizeName;
	totalRingCount: number;
	summaries: RingSequenceSummary[];
};

export function classifyRingSize(summary: RingSequenceSummary): RingSizeName {
	const { sequence_prefix, ring_length } = summary;
	const alphaCount = (sequence_prefix.match(/^[A-Za-z]+/) || [''])[0].length;

	if (alphaCount === 3 && ring_length === 6) return 'AA';
	if (alphaCount === 3 && ring_length === 7) return 'A';

	if (alphaCount === 2 && ring_length === 7) {
		const firstLetter = sequence_prefix[0].toUpperCase();
		if (firstLetter === 'D') return 'D';
		if (firstLetter === 'E') return 'E';
		if (firstLetter === 'F') return 'F';
		if (firstLetter === 'S') return 'SO';
		return 'B, C, C2';
	}

	return 'Large';
}

export function groupSummariesByRingSize(
	summaries: RingSequenceSummary[]
): RingSizeGroup[] {
	const buckets = new Map<RingSizeName, RingSequenceSummary[]>();

	for (const summary of summaries) {
		const name = classifyRingSize(summary);
		if (!buckets.has(name)) buckets.set(name, []);
		buckets.get(name)!.push(summary);
	}

	return RING_SIZE_ORDER.filter((name) => buckets.has(name)).map((name) => {
		const groupSummaries = buckets.get(name)!;
		return {
			name,
			totalRingCount: groupSummaries.reduce((sum, s) => sum + s.ring_count, 0),
			summaries: groupSummaries
		};
	});
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
