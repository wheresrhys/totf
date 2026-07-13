import { describe, it, expect, vi } from 'vitest';
import type { PostgrestSingleResponse } from '@supabase/supabase-js';
import { fetchAllPaginatedRows } from '../supabase';

const PAGE_SIZE = 1000;

function successResponse<T>(rows: T[]): PostgrestSingleResponse<T[]> {
	return {
		data: rows,
		error: null,
		count: null,
		status: 200,
		statusText: 'OK'
	};
}

function buildRows(count: number, offset = 0) {
	return Array.from({ length: count }, (_, index) => ({
		id: offset + index
	}));
}

describe('fetchAllPaginatedRows', () => {
	it('returns all rows from a single short page', async () => {
		const rows = buildRows(3);
		const buildPageQuery = vi.fn().mockResolvedValue(successResponse(rows));
		const result = await fetchAllPaginatedRows(buildPageQuery);
		expect(result).toEqual(rows);
		expect(buildPageQuery).toHaveBeenCalledTimes(1);
		expect(buildPageQuery).toHaveBeenCalledWith(0, PAGE_SIZE - 1);
	});

	it('keeps fetching pages while pages are full and concatenates results', async () => {
		const firstPage = buildRows(PAGE_SIZE);
		const secondPage = buildRows(30, PAGE_SIZE);
		const buildPageQuery = vi
			.fn()
			.mockResolvedValueOnce(successResponse(firstPage))
			.mockResolvedValueOnce(successResponse(secondPage));
		const result = await fetchAllPaginatedRows(buildPageQuery);
		expect(result).toEqual([...firstPage, ...secondPage]);
		expect(buildPageQuery).toHaveBeenCalledTimes(2);
		expect(buildPageQuery).toHaveBeenNthCalledWith(1, 0, PAGE_SIZE - 1);
		expect(buildPageQuery).toHaveBeenNthCalledWith(
			2,
			PAGE_SIZE,
			2 * PAGE_SIZE - 1
		);
	});

	it('makes a final empty request when total rows are an exact multiple of the page size', async () => {
		const fullPage = buildRows(PAGE_SIZE);
		const buildPageQuery = vi
			.fn()
			.mockResolvedValueOnce(successResponse(fullPage))
			.mockResolvedValueOnce(successResponse([]));
		const result = await fetchAllPaginatedRows(buildPageQuery);
		expect(result).toEqual(fullPage);
		expect(buildPageQuery).toHaveBeenCalledTimes(2);
	});

	it('throws when any page returns an error', async () => {
		const buildPageQuery = vi.fn().mockResolvedValue({
			data: null,
			error: { message: 'boom' },
			count: null,
			status: 500,
			statusText: 'Internal Server Error'
		});
		await expect(fetchAllPaginatedRows(buildPageQuery)).rejects.toThrow(
			'Failed to fetch data: boom'
		);
	});
});
