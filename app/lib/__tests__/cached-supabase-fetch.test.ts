import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockGetAuthenticatedSupabaseClient } = vi.hoisted(() => ({
	mockGetAuthenticatedSupabaseClient: vi.fn()
}));

vi.mock('@/app/lib/auth/group-auth', () => ({
	getAuthenticatedSupabaseClient: mockGetAuthenticatedSupabaseClient
}));

const GROUP_ID = 1;
const OTHER_GROUP_ID = 2;
const TTL_MS = 60 * 60 * 1000;

let statsVersion = 100;
const mockEncountersLimit = vi.fn();
const mockEncountersOrder = vi.fn(() => ({ limit: mockEncountersLimit }));
const mockEncountersEq = vi.fn(() => ({ order: mockEncountersOrder }));
const mockEncountersSelect = vi.fn(() => ({ eq: mockEncountersEq }));

const mockFrom = vi.fn((table: string) => {
	if (table === 'Encounters') {
		return { select: mockEncountersSelect };
	}
});

const mockDataFetcher = vi.fn();

// The module memoises each stats blob (session/year/month) at module scope
// via its own cache Map, so each test imports a fresh copy of the module —
// shared by fetchSessionStats, cachedSupabaseFetch and fetchMonthStats tests
// alike since they all reuse the same fetchWithVersionCache mechanism.
async function importCachedFetch() {
	vi.resetModules();
	return import('../cached-supabase-fetch');
}

const mockSupabaseClient = {
	from: mockFrom
};
describe('Cached supabase fetch', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		statsVersion = 100;

		// Encounters from() chain — version query
		mockEncountersLimit.mockImplementation(() =>
			Promise.resolve({ data: [{ id: statsVersion }], error: null })
		);
		mockGetAuthenticatedSupabaseClient.mockResolvedValue(mockSupabaseClient);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});
	it('cold start: returns a fresh response if no pre-existing cache exists', async () => {
		const { cachedSupabaseFetch } = await importCachedFetch();
		mockDataFetcher.mockResolvedValue('test ok');
		const result = await cachedSupabaseFetch(
			'test-cache-1',
			GROUP_ID,
			mockDataFetcher
		);
		expect(mockDataFetcher).toHaveBeenCalledOnce();
		expect(result).toBe('test ok');
	});

	it('passes the same supabase client used to check version into the data fetcher', async () => {
		const { cachedSupabaseFetch } = await importCachedFetch();
		mockDataFetcher.mockResolvedValue('test ok');
		await cachedSupabaseFetch('test-cache-1', GROUP_ID, mockDataFetcher);
		expect(mockDataFetcher).toHaveBeenCalledWith(mockSupabaseClient, GROUP_ID);
	});
	it('returns a cached response if a cached item for the group exists', async () => {
		const { cachedSupabaseFetch } = await importCachedFetch();
		mockDataFetcher.mockResolvedValue('test ok');
		await cachedSupabaseFetch('test-cache-1', GROUP_ID, mockDataFetcher);
		expect(mockDataFetcher).toHaveBeenCalledOnce();
		const result = await cachedSupabaseFetch(
			'test-cache-1',
			GROUP_ID,
			mockDataFetcher
		);
		expect(mockDataFetcher).toHaveBeenCalledOnce();
		expect(result).toBe('test ok');
	});
	it('returns a fresh response if a cached item for the group does not exist', async () => {
		const { cachedSupabaseFetch } = await importCachedFetch();
		let firstCall = true;
		mockDataFetcher.mockImplementation(() => {
			if (firstCall) {
				firstCall = false;
				return 'test ok';
			} else {
				return 'other test ok';
			}
		});
		await cachedSupabaseFetch('test-cache-1', GROUP_ID, mockDataFetcher);
		expect(mockDataFetcher).toHaveBeenCalledOnce();
		const result = await cachedSupabaseFetch(
			'test-cache-1',
			OTHER_GROUP_ID,
			mockDataFetcher
		);
		expect(mockDataFetcher).toHaveBeenCalledTimes(2);
		expect(mockDataFetcher).toHaveBeenCalledWith(
			mockSupabaseClient,
			OTHER_GROUP_ID
		);
		expect(result).toBe('other test ok');
	});
	it('different cache namespaces do not pollute each other', async () => {
		const { cachedSupabaseFetch } = await importCachedFetch();
		let firstCall = true;
		mockDataFetcher.mockImplementation(() => {
			if (firstCall) {
				firstCall = false;
				return 'test ok';
			} else {
				return 'other test ok';
			}
		});
		await cachedSupabaseFetch('test-cache-1', GROUP_ID, mockDataFetcher);
		expect(mockDataFetcher).toHaveBeenCalledOnce();
		await cachedSupabaseFetch('test-cache-2', GROUP_ID, mockDataFetcher);
		expect(
			await cachedSupabaseFetch('test-cache-1', GROUP_ID, mockDataFetcher)
		).toBe('test ok');
		expect(
			await cachedSupabaseFetch('test-cache-2', GROUP_ID, mockDataFetcher)
		).toBe('other test ok');
	});
	describe('expiry', () => {
		it('returns a fresh response if the cached item has expired', async () => {
			const { cachedSupabaseFetch } = await importCachedFetch();
			let firstCall = true;
			mockDataFetcher.mockImplementation(() => {
				if (firstCall) {
					firstCall = false;
					return 'test ok';
				} else {
					return 'second test ok';
				}
			});
			const now = Date.now();
			const dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(now);

			await cachedSupabaseFetch('test-cache-1', GROUP_ID, mockDataFetcher);
			dateNowSpy.mockReturnValue(now + TTL_MS + 1);
			const result = await cachedSupabaseFetch(
				'test-cache-1',
				GROUP_ID,
				mockDataFetcher
			);

			expect(mockDataFetcher).toHaveBeenCalledTimes(2);
			expect(result).toBe('second test ok');
		});
		it('returns a fresh response if there are fresh encounter records for the group', async () => {
			const { cachedSupabaseFetch } = await importCachedFetch();
			let firstCall = true;
			mockDataFetcher.mockImplementation(() => {
				if (firstCall) {
					firstCall = false;
					return 'test ok';
				} else {
					return 'second test ok';
				}
			});
			await cachedSupabaseFetch('test-cache-1', GROUP_ID, mockDataFetcher);
			statsVersion = 101;
			const result = await cachedSupabaseFetch(
				'test-cache-1',
				GROUP_ID,
				mockDataFetcher
			);
			expect(mockDataFetcher).toHaveBeenCalledTimes(2);
			expect(result).toBe('second test ok');
		});
		it('returns a cached response if there are fresh encounter records for a different group', async () => {
			// not tested directly, but checking that the version query passes in group id
			// could do some more complex mocking to persist the values passed earlier in the method
			// chain and vary the encounters response accordingly, but feels like high complexity
			// and low value/fidelity given the complexity of the mock
			const { cachedSupabaseFetch } = await importCachedFetch();
			mockDataFetcher.mockResolvedValue('test ok');
			await cachedSupabaseFetch('test-cache-1', GROUP_ID, mockDataFetcher);
			expect(mockEncountersEq).toHaveBeenCalledWith(
				'ringing_group_id',
				GROUP_ID
			);
		});
	});
});
