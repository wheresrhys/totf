import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import Page from '../page';
import {
	TEST_DATE,
	TEST_GROUP_ID,
	TEST_GROUP_SLUG,
	mockSessions,
	mockMultiLocationSessions,
	mockPreviousSession,
	mockNextSession,
	makeMockEncounter,
	makeChain
} from '@/app/__tests__/helpers/session-page-fixtures';

const { mockGetAuthenticatedSupabaseClient, mockResolveGroupIdBySlug } =
	vi.hoisted(() => ({
		mockGetAuthenticatedSupabaseClient: vi.fn(),
		mockResolveGroupIdBySlug: vi.fn()
	}));

vi.mock('@/app/lib/auth/group-auth', () => ({
	getAuthenticatedSupabaseClient: mockGetAuthenticatedSupabaseClient
}));

vi.mock('@/app/lib/group-slug', () => ({
	resolveGroupIdBySlug: mockResolveGroupIdBySlug
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

const TEST_LOCATION_ID = '10';

const mockEncounters = [
	makeMockEncounter({
		bird: {
			ring_no: 'ABC001',
			proven_age: 4,
			species: { id: 1, species_name: 'Robin' }
		}
	})
];

// The wrapper page also resolves the group's numeric id from its slug via
// `resolveGroupIdBySlug` (`@/lib/group-slug`, mocked directly above) rather
// than through this page's own authenticated client — see #770, which moved
// that resolution onto an unauthenticated client so it works for a no-cookie
// visitor too.
function makeSessionClient() {
	const sessionAndEncounterChains = [
		makeChain(mockSessions),
		makeChain(mockPreviousSession),
		makeChain(mockNextSession),
		makeChain(mockEncounters)
	];
	let nextChainIndex = 0;
	const from = vi.fn(() => sessionAndEncounterChains[nextChainIndex++]);
	return { from, sessionAndEncounterChains };
}

function renderPage(tabId?: string) {
	return Page({
		params: Promise.resolve({
			groupSlug: TEST_GROUP_SLUG,
			date: TEST_DATE,
			locationId: TEST_LOCATION_ID
		}),
		...(tabId === undefined ? {} : { searchParams: Promise.resolve({ tabId }) })
	});
}

describe('session site page', () => {
	afterEach(() => {
		cleanup();
	});

	beforeEach(() => {
		mockResolveGroupIdBySlug.mockResolvedValue(Number(TEST_GROUP_ID));
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

	it('renders the summary sentence for the filtered location', async () => {
		render(await renderPage());
		const stats = await screen.findByTestId('session-stats');
		expect(stats.textContent).toContain(
			'1 bird of 1 species, 1 new and 0 retraps'
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

	describe('when the date has more than one location', () => {
		it('links "View all" to the group-slug-based session href', async () => {
			const sessionAndEncounterChains = [
				makeChain(mockMultiLocationSessions),
				makeChain(mockPreviousSession),
				makeChain(mockNextSession),
				makeChain(mockEncounters)
			];
			let nextChainIndex = 0;
			const client = {
				from: vi.fn((table: string) => {
					if (table === 'RingingGroups') {
						return makeChain({ id: Number(TEST_GROUP_ID) });
					}
					return sessionAndEncounterChains[nextChainIndex++];
				})
			};
			mockGetAuthenticatedSupabaseClient.mockResolvedValue(client);
			render(await renderPage());
			const viewAllLink = await screen.findByRole('link', {
				name: 'View all'
			});
			expect(viewAllLink.getAttribute('href')).toBe(
				`/group/alpha/session/${TEST_DATE}`
			);
		});
	});

	describe('?tabId= query param (#805)', () => {
		it('with no tabId search param, the Species totals tab renders unchanged', async () => {
			render(await renderPage());
			await screen.findByTestId('session-table');
			expect(screen.queryByText(/Net round 1/)).toBeNull();
		});

		it('?tabId=net-rounds focuses the Net rounds tab and renders its content without a click', async () => {
			render(await renderPage('net-rounds'));
			await screen.findByText('Net round 1: 08:00');
		});

		it('?tabId=highlights falls back to the Species totals tab (highlights is not a known tab on this location-scoped route), with no crash and no blank pane', async () => {
			render(await renderPage('highlights'));
			await screen.findByTestId('session-table');
			expect(screen.queryByTestId('session-highlights')).toBeNull();
			expect(screen.queryByText(/Net round 1/)).toBeNull();
		});
	});
});
