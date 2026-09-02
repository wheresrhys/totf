import { describe, it, expect } from 'vitest';
import {
	deriveRingBounds,
	findUnusedRings,
	groupRingNosByPrefix,
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

describe('groupRingNosByPrefix', () => {
	it('groups ring numbers by their first 3 characters, sorted and deduped', () => {
		const result = groupRingNosByPrefix([
			{ ring_no: 'AEL1700' },
			{ ring_no: 'AEL1699' },
			{ ring_no: 'DB12345' },
			{ ring_no: 'AEL1699' }
		]);
		expect(result).toEqual([
			{ prefix: 'AEL', ring_nos: ['AEL1699', 'AEL1700'] },
			{ prefix: 'DB1', ring_nos: ['DB12345'] }
		]);
	});

	it('returns a single entry when all rings share a prefix', () => {
		const result = groupRingNosByPrefix([
			{ ring_no: 'XYZ001' },
			{ ring_no: 'XYZ002' }
		]);
		expect(result).toEqual([{ prefix: 'XYZ', ring_nos: ['XYZ001', 'XYZ002'] }]);
	});

	it('returns an empty array for no rows', () => {
		expect(groupRingNosByPrefix([])).toEqual([]);
	});
});

describe('deriveRingBounds', () => {
	it('suggests decade-aligned bounds for a batch of rings (matches the removed trigger)', () => {
		// AEL1699 decade start 1691; AEL1701 widens last to 1710 (rounded up).
		expect(deriveRingBounds(['AEL1699', 'AEL1700', 'AEL1701'])).toEqual({
			first_ring: 'AEL1691',
			last_ring: 'AEL1710'
		});
	});

	it('uses a ring ending in 1 as its own decade start (not the decade below)', () => {
		// Guards the trigger's `floor((ring_index - 1) / 10)`: 1701 -> start 1701,
		// not 1691. A one-decade default window then gives last 1710.
		expect(deriveRingBounds(['AEL1701'])).toEqual({
			first_ring: 'AEL1701',
			last_ring: 'AEL1710'
		});
	});

	it('rounds the last ring up to the nearest ten when widening past the window', () => {
		expect(deriveRingBounds(['AEL1705', 'AEL1727'])).toEqual({
			first_ring: 'AEL1701',
			last_ring: 'AEL1730'
		});
	});

	it('escalates the window to +100 once the span exceeds 50', () => {
		expect(deriveRingBounds(['AEL1705', 'AEL1760'])).toEqual({
			first_ring: 'AEL1701',
			last_ring: 'AEL1801'
		});
	});

	it('escalates the window to +500 once the span exceeds 100', () => {
		expect(deriveRingBounds(['AEL1705', 'AEL1860'])).toEqual({
			first_ring: 'AEL1701',
			last_ring: 'AEL2201'
		});
	});

	it('grows the digit width rather than truncating when the last ring overflows it', () => {
		expect(deriveRingBounds(['XY995'])).toEqual({
			first_ring: 'XY991',
			last_ring: 'XY1000'
		});
	});

	it('is independent of input order', () => {
		expect(deriveRingBounds(['AEL1701', 'AEL1699', 'AEL1700'])).toEqual(
			deriveRingBounds(['AEL1699', 'AEL1700', 'AEL1701'])
		);
	});

	it('ignores ring numbers that do not parse into prefix + numeric suffix', () => {
		expect(deriveRingBounds(['AEL1699', 'GARBAGE'])).toEqual({
			first_ring: 'AEL1691',
			last_ring: 'AEL1700'
		});
	});

	it('returns null when no ring number parses', () => {
		expect(deriveRingBounds([])).toBeNull();
		expect(deriveRingBounds(['ABCDEF', ''])).toBeNull();
	});
});
