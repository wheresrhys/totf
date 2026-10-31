import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	StatsCacheFetchPool,
	globalStatsCacheFetchPool
} from '../stats-cache-fetch-pool';
import { readStatsCacheRows } from '../stats-cache';
import type { ViewedGroup } from '@/app/lib/group-slug';

vi.mock('../stats-cache', () => ({
	readStatsCacheRows: vi.fn()
}));

const GROUP_A: ViewedGroup = { id: 1, slug: 'alpha' };
const GROUP_B: ViewedGroup = { id: 2, slug: 'beta' };

function params(overrides: Partial<Parameters<typeof readStatsCacheRows>[0]> = {}) {
	return {
		viewedGroup: GROUP_A,
		bySpecies: false,
		temporalUnit: 'day' as const,
		...overrides
	};
}

beforeEach(() => {
	vi.clearAllMocks();
	vi.mocked(readStatsCacheRows).mockResolvedValue([]);
});

describe('StatsCacheFetchPool', () => {
	describe('cache miss', () => {
		it('calls readStatsCacheRows with the given params on the first fetch for a key', () => {
			const pool = new StatsCacheFetchPool();
			pool.fetch(params());
			expect(readStatsCacheRows).toHaveBeenCalledWith(params());
		});
	});

	describe('cache hit', () => {
		it('returns the same promise and does not call readStatsCacheRows again for a repeat fetch with the same group/temporalUnit/bySpecies', () => {
			const pool = new StatsCacheFetchPool();
			const first = pool.fetch(params());
			const second = pool.fetch(params());

			expect(second).toBe(first);
			expect(readStatsCacheRows).toHaveBeenCalledTimes(1);
		});
	});

	describe('distinct cache keys', () => {
		it('issues a fresh call for a different viewedGroup.id', () => {
			const pool = new StatsCacheFetchPool();
			pool.fetch(params({ viewedGroup: GROUP_A }));
			pool.fetch(params({ viewedGroup: GROUP_B }));
			expect(readStatsCacheRows).toHaveBeenCalledTimes(2);
		});

		it('issues a fresh call for a different temporalUnit', () => {
			const pool = new StatsCacheFetchPool();
			pool.fetch(params({ temporalUnit: 'day' }));
			pool.fetch(params({ temporalUnit: 'year' }));
			expect(readStatsCacheRows).toHaveBeenCalledTimes(2);
		});

		it('issues a fresh call for a different bySpecies value', () => {
			const pool = new StatsCacheFetchPool();
			pool.fetch(params({ bySpecies: false }));
			pool.fetch(params({ bySpecies: true }));
			expect(readStatsCacheRows).toHaveBeenCalledTimes(2);
		});
	});

	describe('globalStatsCacheFetchPool', () => {
		it('is a StatsCacheFetchPool instance', () => {
			expect(globalStatsCacheFetchPool).toBeInstanceOf(StatsCacheFetchPool);
		});
	});
});
