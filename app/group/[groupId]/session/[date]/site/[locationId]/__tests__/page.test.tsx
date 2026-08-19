import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import Page from '../page';

const { mockGetAuthenticatedSupabaseClient } = vi.hoisted(() => ({
	mockGetAuthenticatedSupabaseClient: vi.fn()
}));

vi.mock('@/lib/group-auth', () => ({
	getAuthenticatedSupabaseClient: mockGetAuthenticatedSupabaseClient
}));

vi.mock('@/app/actions/session-highlights', () => ({
	// The action returns plain highlight data; the component renders each
	fetchSessionHighlights: vi.fn().mockResolvedValue([
		{
			type: 'session-total-record',
			metric: 'encounters',
			scope: 'all-time',
			value: 1,
			year: 2024,
			isCurrentYear: false
		}
	])
}));

const TEST_DATE = '2024-03-15';
const TEST_GROUP_ID = '1';
const TEST_LOCATION_ID = '10';

const mockSessions = [
	{
		id: 1,
		location_id: 10,
		location: { id: 10, location_name: 'Test Reserve', ringing_group_id: 1 }
	}
];

const mockEncounters = [
	{
		id: 1,
		session_id: 1,
		age_code: 4,
		breeding_condition: null,
		capture_time: '08:00:00',
		moult_code: null,
		record_type: 'N',
		ringing_group_id: 1,
		sex: 'M',
		sexing_method: null,
		weight: 18.5,
		wing_length: 75,
		bird: {
			ring_no: 'ABC001',
			proven_age: 4,
			species: { id: 1, species_name: 'Robin' }
		}
	}
];

const mockPreviousSession = [{ visit_date: '2024-03-01' }];
const mockNextSession = [{ visit_date: '2024-04-01' }];

function makeChain(data: unknown) {
	return {
		select: vi.fn().mockReturnThis(),
		eq: vi.fn().mockReturnThis(),
		in: vi.fn().mockReturnThis(),
		lt: vi.fn().mockReturnThis(),
		gt: vi.fn().mockReturnThis(),
		order: vi.fn().mockReturnThis(),
		limit: vi.fn().mockReturnThis(),
		maybeSingle: vi.fn().mockReturnThis(),
		then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
			Promise.resolve({ data, error: null }).then(resolve)
	};
}

// The wrapper page also resolves the group's slug (RingingGroups) — via a
// module-scope cache in lib/group-slug.ts, so it's only fetched once per
// group id for the lifetime of this test file, not once per test. Dispatch
// on table name so RingingGroups is served on demand regardless of whether
// a given test hits the cache, without disturbing the ordered queue below
// that the Sessions/Encounters calls are matched against.
function makeSessionClient() {
	const sessionAndEncounterChains = [
		makeChain(mockSessions),
		makeChain(mockPreviousSession),
		makeChain(mockNextSession),
		makeChain(mockEncounters)
	];
	let nextChainIndex = 0;
	const from = vi.fn((table: string) => {
		if (table === 'RingingGroups') {
			return makeChain({ slug: 'test-group-slug' });
		}
		return sessionAndEncounterChains[nextChainIndex++];
	});
	return { from, sessionAndEncounterChains };
}

function renderPage() {
	return Page({
		params: Promise.resolve({
			groupId: TEST_GROUP_ID,
			date: TEST_DATE,
			locationId: TEST_LOCATION_ID
		})
	});
}

describe('session site page', () => {
	afterEach(() => {
		cleanup();
	});

	beforeEach(() => {
		mockGetAuthenticatedSupabaseClient.mockResolvedValue(makeSessionClient());
	});

	it('renders date as heading', async () => {
		render(await renderPage());
		const heading = await screen.findByRole('heading', { level: 1 });
		expect(heading.textContent).toContain('15th March 2024');
	});

	it('excludes non-FULL_GROWN sessions from the Sessions query', async () => {
		const client = makeSessionClient();
		mockGetAuthenticatedSupabaseClient.mockResolvedValue(client);
		render(await renderPage());
		await screen.findByTestId('session-stats');
		const mainSessionsChain = client.sessionAndEncounterChains[0];
		expect(mainSessionsChain.eq).toHaveBeenCalledWith(
			'session_type',
			'FULL_GROWN'
		);
	});

	it('does not render highlights on the location-filtered page', async () => {
		render(await renderPage());
		await screen.findByTestId('session-stats');
		const { fetchSessionHighlights } =
			await import('@/app/actions/session-highlights');
		expect(screen.queryByTestId('session-highlights')).toBeNull();
		expect(vi.mocked(fetchSessionHighlights)).not.toHaveBeenCalled();
	});
});
