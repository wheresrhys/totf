import { describe, it, expect } from 'vitest';
import {
	findUnusedRings,
	groupRingSequencesBySize,
	RING_SIZE_ENUM_ORDER
} from '../ring-sequences';
import type { RingSequenceRow, RingSize } from '@/app/models/db';

function makeSequence(
	id: number,
	prefix: string,
	size: RingSize | null
): RingSequenceRow {
	return {
		id,
		prefix,
		size,
		owned_by_group: true,
		ringing_group_id: 1,
		first_ring: `${prefix}00001`,
		last_ring: `${prefix}00009`,
		first_index: 1,
		last_index: 9
	};
}

describe('findUnusedRings', () => {
	it('returns empty array when no gaps exist', () => {
		const rings = ['ARW000001', 'ARW000002', 'ARW000003'];
		expect(findUnusedRings(rings, 3)).toEqual([]);
	});

	it('returns missing ring numbers between min and max suffix', () => {
		const rings = ['ARW000001', 'ARW000003', 'ARW000005'];
		expect(findUnusedRings(rings, 3)).toEqual(['ARW000002', 'ARW000004']);
	});

	it('pads suffix with leading zeros to match original ring length', () => {
		const rings = ['ARW000001', 'ARW000010'];
		const unused = findUnusedRings(rings, 3);
		expect(unused).toContain('ARW000002');
		expect(unused).toContain('ARW000009');
		expect(unused[0]).toHaveLength(9);
	});

	it('returns empty array for a single ring', () => {
		expect(findUnusedRings(['ARW000001'], 3)).toEqual([]);
	});

	it('returns empty array when input is empty', () => {
		expect(findUnusedRings([], 3)).toEqual([]);
	});
});

describe('groupRingSequencesBySize', () => {
	it('returns no groups for an empty input', () => {
		expect(groupRingSequencesBySize([])).toEqual([]);
	});

	it('buckets sequences by their real size column', () => {
		const sequences = [
			makeSequence(1, 'ARW', 'A'),
			makeSequence(2, 'ABT', 'A'),
			makeSequence(3, 'CJ', 'C')
		];
		const groups = groupRingSequencesBySize(sequences);
		expect(groups.map((g) => g.size)).toEqual(['A', 'C']);
		expect(groups[0].sequences).toHaveLength(2);
		expect(groups[1].sequences).toHaveLength(1);
	});

	it('orders populated size groups by RING_SIZE_ENUM_ORDER, not input order', () => {
		const sequences = [
			makeSequence(1, 'MS', 'MS'),
			makeSequence(2, 'AA', 'AA'),
			makeSequence(3, 'B', 'B')
		];
		const groups = groupRingSequencesBySize(sequences).filter(
			(g) => g.size !== null
		);
		expect(groups.map((g) => g.size)).toEqual(['AA', 'B', 'MS']);
	});

	it('collects null-size rows into their own group placed first', () => {
		const sequences = [
			makeSequence(1, 'ARW', 'A'),
			makeSequence(2, 'ZZZ', null),
			makeSequence(3, 'YYY', null)
		];
		const groups = groupRingSequencesBySize(sequences);
		expect(groups[0].size).toBeNull();
		expect(groups[0].sequences).toHaveLength(2);
		expect(groups[1].size).toBe('A');
	});

	it('lists all 22 ring_size enum values in ascending order', () => {
		expect(RING_SIZE_ENUM_ORDER).toHaveLength(22);
		expect(RING_SIZE_ENUM_ORDER[0]).toBe('AA');
		expect(RING_SIZE_ENUM_ORDER.at(-1)).toBe('MS');
	});
});
