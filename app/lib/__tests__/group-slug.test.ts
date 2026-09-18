import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockFrom } = vi.hoisted(() => ({
	mockFrom: vi.fn()
}));

beforeEach(() => {
	mockFrom.mockReset();
});

vi.mock('@/lib/supabase', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../../../lib/supabase')>();
	return { ...actual, supabase: { from: mockFrom } };
});

import {
	resolveGroupIdBySlug,
	resolveGroupSlugById,
	resolveGroupPublicAreas
} from '../group-slug';

function makeGroupChain(data: unknown) {
	return {
		select: vi.fn().mockReturnThis(),
		eq: vi.fn().mockReturnThis(),
		maybeSingle: vi.fn().mockReturnThis(),
		then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
			Promise.resolve({ data, error: null }).then(resolve)
	};
}

function mockClientReturning(data: unknown) {
	mockFrom.mockReturnValue(makeGroupChain(data));
}

// Each test uses its own slug/id, distinct from every other test's — the
// resolver caches are module-scoped (matching production behaviour where a
// process caches across requests), so reusing a key across tests would leak
// a cache hit from one test into another.

describe('resolveGroupIdBySlug', () => {
	it('resolves a slug matching an existing RingingGroups row to its numeric id', async () => {
		mockClientReturning({ id: 42 });

		const result = await resolveGroupIdBySlug('resolves-slug');

		expect(result).toBe(42);
		expect(mockFrom).toHaveBeenCalledWith('RingingGroups');
	});

	it('returns null when no row matches the given slug', async () => {
		mockClientReturning(null);

		const result = await resolveGroupIdBySlug('no-match-slug');

		expect(result).toBeNull();
	});

	it('does not issue a second Supabase query for a second call with the same resolved slug', async () => {
		mockClientReturning({ id: 43 });

		await resolveGroupIdBySlug('cache-hit-slug');
		await resolveGroupIdBySlug('cache-hit-slug');

		expect(mockFrom).toHaveBeenCalledTimes(1);
	});

	it('re-queries Supabase for a second call with the same unresolved slug (no negative caching)', async () => {
		mockClientReturning(null);

		await resolveGroupIdBySlug('no-negative-cache-slug');
		await resolveGroupIdBySlug('no-negative-cache-slug');

		expect(mockFrom).toHaveBeenCalledTimes(2);
	});
});

describe('resolveGroupSlugById', () => {
	it('resolves an id matching an existing row to its slug', async () => {
		mockClientReturning({ slug: 'resolved-slug' });

		const result = await resolveGroupSlugById(101);

		expect(result).toBe('resolved-slug');
		expect(mockFrom).toHaveBeenCalledWith('RingingGroups');
	});

	it('returns null when no row matches the id', async () => {
		mockClientReturning(null);

		const result = await resolveGroupSlugById(102);

		expect(result).toBeNull();
	});

	it("returns null when the matching row's slug is null", async () => {
		mockClientReturning({ slug: null });

		const result = await resolveGroupSlugById(103);

		expect(result).toBeNull();
	});

	it('does not issue a second Supabase query for a second call with the same resolved id', async () => {
		mockClientReturning({ slug: 'cache-hit-by-id' });

		await resolveGroupSlugById(104);
		await resolveGroupSlugById(104);

		expect(mockFrom).toHaveBeenCalledTimes(1);
	});
});

describe('resolveGroupPublicAreas', () => {
	it("returns the row's public_areas when the group exists", async () => {
		mockClientReturning({ public_areas: ['summary'] });

		const result = await resolveGroupPublicAreas(201);

		expect(result).toEqual(['summary']);
		expect(mockFrom).toHaveBeenCalledWith('RingingGroups');
	});

	it('returns an empty array when no row matches the id', async () => {
		mockClientReturning(null);

		const result = await resolveGroupPublicAreas(202);

		expect(result).toEqual([]);
	});

	it('re-queries Supabase on every call — never caches a mutable public_areas value', async () => {
		mockClientReturning({ public_areas: [] });

		await resolveGroupPublicAreas(203);
		await resolveGroupPublicAreas(203);

		expect(mockFrom).toHaveBeenCalledTimes(2);
	});
});
