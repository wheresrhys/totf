import { describe, it, expect, vi } from 'vitest';
import {
	createClient,
	type PostgrestSingleResponse
} from '@supabase/supabase-js';
import {
	createSupabaseClientWithJwt,
	fetchAllPaginatedRows
} from '../supabase';

// `createClient` is the single collaborator this module orchestrates, and the
// only way to observe the options it hands over — a constructed client doesn't
// expose them back.
vi.mock('@supabase/supabase-js', async (importOriginal) => ({
	...(await importOriginal<typeof import('@supabase/supabase-js')>()),
	createClient: vi.fn(() => ({}))
}));
const mockedCreateClient = vi.mocked(createClient);

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

/**
 * #1216: this app never calls `.auth.*` — it signs its own group JWTs — but
 * supabase-js' bundled `GoTrueClient` defaults `autoRefreshToken` to `true`,
 * which on a non-browser platform starts a 30-second `setInterval` nothing
 * here ever stops. Since `createSupabaseClientWithJwt` is called per request
 * with no cache in front of it, every client left at those defaults stays
 * permanently reachable from its own timer. Asserted on the options rather
 * than on a live client, because a constructed client doesn't expose them.
 */
describe('disabling the unused Supabase Auth session machinery', () => {
	const noSessionAuthOptions = {
		autoRefreshToken: false,
		persistSession: false
	};

	it('creates the module-level anonymous client with no auto-refresh or session persistence', () => {
		// Constructed at import time, so the recorded first call is the one.
		expect(mockedCreateClient.mock.calls[0]?.[2]).toMatchObject({
			auth: noSessionAuthOptions
		});
	});

	it('creates a per-request JWT-scoped client with the same options alongside its Authorization header', () => {
		createSupabaseClientWithJwt('a-signed-group-jwt');

		const [, , options] = mockedCreateClient.mock.lastCall ?? [];
		expect(options).toMatchObject({
			auth: noSessionAuthOptions,
			global: { headers: { Authorization: 'Bearer a-signed-group-jwt' } }
		});
	});
});
