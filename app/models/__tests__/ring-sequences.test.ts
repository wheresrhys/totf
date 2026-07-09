import { describe, it, expect } from 'vitest';
import {
	findUnusedRings,
	classifyRingSize,
	groupSummariesByRingSize
} from '../ring-sequences';
import type { RingSequenceSummary } from '@/app/actions/ring-sequences';

function makeSummary(
	sequence_prefix: string,
	ring_length: number,
	ring_count = 1
): RingSequenceSummary {
	return {
		sequence_prefix,
		ring_length,
		ring_count,
		earliest_date: '2022-01-01',
		latest_date: '2024-01-01'
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

describe('classifyRingSize', () => {
	it('classifies 3-alpha prefix, length 6 as AA', () => {
		expect(classifyRingSize(makeSummary('ARW', 6))).toBe('AA');
	});

	it('classifies 3-alpha prefix, length 7 as A', () => {
		expect(classifyRingSize(makeSummary('ARW', 7))).toBe('A');
	});

	it('classifies 2-alpha, length 7, first letter B as B, C, C2', () => {
		expect(classifyRingSize(makeSummary('BK', 7))).toBe('B, C, C2');
	});

	it('classifies 2-alpha, length 7, first letter C as B, C, C2', () => {
		expect(classifyRingSize(makeSummary('CA', 7))).toBe('B, C, C2');
	});

	it('classifies 2-alpha, length 7, first letter D as D', () => {
		expect(classifyRingSize(makeSummary('DA', 7))).toBe('D');
	});

	it('classifies 2-alpha, length 7, first letter E as E', () => {
		expect(classifyRingSize(makeSummary('EB', 7))).toBe('E');
	});

	it('classifies 2-alpha, length 7, first letter F as F', () => {
		expect(classifyRingSize(makeSummary('FA', 7))).toBe('F');
	});

	it('classifies 2-alpha, length 7, first letter S as SO', () => {
		expect(classifyRingSize(makeSummary('SA', 7))).toBe('SO');
	});

	it('classifies 3-alpha prefix, length 9 as Large', () => {
		expect(classifyRingSize(makeSummary('ARW', 9))).toBe('Large');
	});

	it('classifies 2-alpha prefix, length 8 as Large', () => {
		expect(classifyRingSize(makeSummary('AB', 8))).toBe('Large');
	});

	it('classifies 1-alpha prefix, length 7 as Large', () => {
		expect(classifyRingSize(makeSummary('A', 7))).toBe('Large');
	});

	it('classifies 4-alpha prefix, length 6 as Large', () => {
		expect(classifyRingSize(makeSummary('ARWX', 6))).toBe('Large');
	});
});

describe('groupSummariesByRingSize', () => {
	it('returns groups in RING_SIZE_ORDER order', () => {
		const summaries = [
			makeSummary('BK', 7),
			makeSummary('ARW', 6),
			makeSummary('ARW', 7)
		];
		const groups = groupSummariesByRingSize(summaries);
		expect(groups.map((g) => g.name)).toEqual(['AA', 'A', 'B, C, C2']);
	});

	it('sums ring_count across sequences within a group', () => {
		const summaries = [makeSummary('ARW', 7, 10), makeSummary('ABT', 7, 5)];
		const groups = groupSummariesByRingSize(summaries);
		expect(groups[0].name).toBe('A');
		expect(groups[0].totalRingCount).toBe(15);
	});

	it('omits empty categories', () => {
		const summaries = [makeSummary('ARW', 7)];
		const groups = groupSummariesByRingSize(summaries);
		expect(groups.map((g) => g.name)).toEqual(['A']);
	});

	it('places multiple summaries of same size in same group', () => {
		const summaries = [makeSummary('ARW', 7), makeSummary('ABT', 7)];
		const groups = groupSummariesByRingSize(summaries);
		expect(groups).toHaveLength(1);
		expect(groups[0].summaries).toHaveLength(2);
	});
});
