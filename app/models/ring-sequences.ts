import type { RingSequenceSummary } from '@/app/actions/ring-sequences';

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
