import { describe, it, expect, vi } from 'vitest';

const { mockGetAuthenticatedSupabaseClient } = vi.hoisted(() => ({
	mockGetAuthenticatedSupabaseClient: vi.fn()
}));

vi.mock('../group-auth', () => ({
	getAuthenticatedSupabaseClient: mockGetAuthenticatedSupabaseClient
}));

import { resolveGroupIdBySlug, resolveGroupSlugById } from '../group-slug';

function makeGroupChain(data: unknown) {
	return {
		select: vi.fn().mockReturnThis(),
		eq: vi.fn().mockReturnThis(),
		maybeSingle: vi.fn().mockReturnThis(),
		then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
			Promise.resolve({ data, error: null }).then(resolve)
	};
}

function makeClient(data: unknown) {
	return { from: vi.fn().mockReturnValue(makeGroupChain(data)) };
}

// Each test uses its own slug/id, distinct from every other test's — the
// resolver caches are module-scoped (matching production behaviour where a
// process caches across requests), so reusing a key across tests would leak
// a cache hit from one test into another.

describe('resolveGroupIdBySlug', () => {
	it('resolves a slug matching an existing RingingGroups row to its numeric id', async () => {
		const client = makeClient({ id: 42 });
		mockGetAuthenticatedSupabaseClient.mockResolvedValue(client);

		const result = await resolveGroupIdBySlug('resolves-slug');

		expect(result).toBe(42);
		expect(client.from).toHaveBeenCalledWith('RingingGroups');
	});

	it('returns null when no row matches the given slug', async () => {
		const client = makeClient(null);
		mockGetAuthenticatedSupabaseClient.mockResolvedValue(client);

		const result = await resolveGroupIdBySlug('no-match-slug');

		expect(result).toBeNull();
	});

	it('does not issue a second Supabase query for a second call with the same resolved slug', async () => {
		const client = makeClient({ id: 43 });
		mockGetAuthenticatedSupabaseClient.mockResolvedValue(client);

		await resolveGroupIdBySlug('cache-hit-slug');
		await resolveGroupIdBySlug('cache-hit-slug');

		expect(client.from).toHaveBeenCalledTimes(1);
	});

	it('re-queries Supabase for a second call with the same unresolved slug (no negative caching)', async () => {
		const client = makeClient(null);
		mockGetAuthenticatedSupabaseClient.mockResolvedValue(client);

		await resolveGroupIdBySlug('no-negative-cache-slug');
		await resolveGroupIdBySlug('no-negative-cache-slug');

		expect(client.from).toHaveBeenCalledTimes(2);
	});
});

describe('resolveGroupSlugById', () => {
	it('resolves an id matching an existing row to its slug', async () => {
		const client = makeClient({ slug: 'resolved-slug' });
		mockGetAuthenticatedSupabaseClient.mockResolvedValue(client);

		const result = await resolveGroupSlugById(101);

		expect(result).toBe('resolved-slug');
		expect(client.from).toHaveBeenCalledWith('RingingGroups');
	});

	it('returns null when no row matches the id', async () => {
		const client = makeClient(null);
		mockGetAuthenticatedSupabaseClient.mockResolvedValue(client);

		const result = await resolveGroupSlugById(102);

		expect(result).toBeNull();
	});

	it("returns null when the matching row's slug is null", async () => {
		const client = makeClient({ slug: null });
		mockGetAuthenticatedSupabaseClient.mockResolvedValue(client);

		const result = await resolveGroupSlugById(103);

		expect(result).toBeNull();
	});

	it('does not issue a second Supabase query for a second call with the same resolved id', async () => {
		const client = makeClient({ slug: 'cache-hit-by-id' });
		mockGetAuthenticatedSupabaseClient.mockResolvedValue(client);

		await resolveGroupSlugById(104);
		await resolveGroupSlugById(104);

		expect(client.from).toHaveBeenCalledTimes(1);
	});
});
