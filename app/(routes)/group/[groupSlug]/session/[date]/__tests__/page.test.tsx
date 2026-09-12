import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import Page from '../page';

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
			value: 3,
			year: 2024,
			isCurrentYear: false
		}
	])
}));

const TEST_DATE = '2024-03-15';
const TEST_GROUP_ID = '1';
const TEST_GROUP_SLUG = 'test-group-slug';

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
			proven_age: 5,
			species: { id: 1, species_name: 'Robin' }
		}
	},
	{
		id: 2,
		session_id: 1,
		age_code: 1,
		breeding_condition: null,
		capture_time: '08:15:00',
		moult_code: null,
		record_type: 'S',
		ringing_group_id: 1,
		sex: 'F',
		sexing_method: null,
		weight: null,
		wing_length: null,
		bird: {
			ring_no: 'XYZ002',
			proven_age: 2,
			species: { id: 1, species_name: 'Robin' }
		}
	},
	{
		id: 3,
		session_id: 1,
		age_code: 2,
		breeding_condition: null,
		capture_time: '08:30:00',
		moult_code: null,
		record_type: 'N',
		ringing_group_id: 1,
		sex: 'U',
		sexing_method: null,
		weight: 11.0,
		wing_length: 55,
		bird: {
			ring_no: 'DEF003',
			proven_age: 0,
			species: { id: 2, species_name: 'Blue Tit' }
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

// The wrapper page also resolves the group's numeric id from its slug via
// `resolveGroupIdBySlug` (`@/lib/group-slug`, mocked directly above) rather
// than through this page's own authenticated client — see #770, which moved
// that resolution onto an unauthenticated client so it works for a no-cookie
// visitor too.
function makeSessionClient(
	sessionAndEncounterChains: ReturnType<typeof makeChain>[]
) {
	let nextChainIndex = 0;
	const from = vi.fn(() => sessionAndEncounterChains[nextChainIndex++]);
	return { from, sessionAndEncounterChains };
}

function makeDefaultSessionClient() {
	return makeSessionClient([
		makeChain(mockSessions),
		makeChain(mockPreviousSession),
		makeChain(mockNextSession),
		makeChain(mockEncounters)
	]);
}

function renderPage(tabId?: string) {
	return Page({
		params: Promise.resolve({ groupSlug: TEST_GROUP_SLUG, date: TEST_DATE }),
		...(tabId === undefined ? {} : { searchParams: Promise.resolve({ tabId }) })
	});
}

describe('session detail page', () => {
	afterEach(() => {
		cleanup();
	});

	beforeEach(() => {
		mockResolveGroupIdBySlug.mockResolvedValue(Number(TEST_GROUP_ID));
		mockGetAuthenticatedSupabaseClient.mockResolvedValue(
			makeDefaultSessionClient()
		);
	});

	it('renders date as heading', async () => {
		render(await renderPage());
		const heading = await screen.findByRole('heading', { level: 1 });
		expect(heading.textContent).toContain('15th March 2024');
	});

	it('excludes non-FULL_GROWN sessions from the main Sessions query', async () => {
		const client = makeDefaultSessionClient();
		mockGetAuthenticatedSupabaseClient.mockResolvedValue(client);
		render(await renderPage());
		await screen.findByTestId('session-stats');
		const mainSessionsChain = client.sessionAndEncounterChains[0];
		expect(mainSessionsChain.eq).toHaveBeenCalledWith(
			'session_type',
			'FULL_GROWN'
		);
	});

	describe('adjacent session date lookups', () => {
		it('excludes non-FULL_GROWN sessions from the previous-session lookup', async () => {
			const client = makeDefaultSessionClient();
			mockGetAuthenticatedSupabaseClient.mockResolvedValue(client);
			render(await renderPage());
			await screen.findByTestId('session-stats');
			const previousChain = client.sessionAndEncounterChains[1];
			expect(previousChain.eq).toHaveBeenCalledWith(
				'session_type',
				'FULL_GROWN'
			);
		});

		it('excludes non-FULL_GROWN sessions from the next-session lookup', async () => {
			const client = makeDefaultSessionClient();
			mockGetAuthenticatedSupabaseClient.mockResolvedValue(client);
			render(await renderPage());
			await screen.findByTestId('session-stats');
			const nextChain = client.sessionAndEncounterChains[2];
			expect(nextChain.eq).toHaveBeenCalledWith('session_type', 'FULL_GROWN');
		});
	});

	describe('a date whose only Sessions row is PULLI or FIELD_OBSERVATION', () => {
		it('renders the "No session found" empty state instead of 404ing', async () => {
			const client = makeSessionClient([
				makeChain([]),
				makeChain(mockPreviousSession),
				makeChain(mockNextSession)
			]);
			mockGetAuthenticatedSupabaseClient.mockResolvedValue(client);
			render(await renderPage());
			await screen.findByText(/No session found/i);
		});
	});

	it('renders the summary sentence with bird, new, retrap, and species counts', async () => {
		render(await renderPage());
		const stats = await screen.findByTestId('session-stats');
		expect(stats.textContent).toContain(
			'3 birds of 2 species, 2 new and 1 retrap'
		);
	});

	it('renders one table row per species', async () => {
		render(await renderPage());
		const table = await screen.findByTestId('session-table');
		const rows = table.querySelectorAll('tbody tr');
		expect(rows.length).toBe(2);
	});

	it('does not render the highlights section on the date-level page', async () => {
		render(await renderPage());
		// The species table is always mounted; wait for it so the render has
		// settled before asserting the highlights section is absent.
		await screen.findByTestId('session-table');
		// The "highlights" ConditionalTabPanel only mounts once its tab is loaded,
		// and loadedTabs starts as Set(['species']) — so before the Highlights tab
		// is ever clicked, the section is not in the DOM at all.
		expect(screen.queryByTestId('session-highlights')).toBeNull();
	});

	it('renders the highlights section after clicking the tab', async () => {
		render(await renderPage());

		// The page content mounts asynchronously — wait for the tab nav to appear
		// before clicking the Highlights tab.
		const highlightsTab = await screen.findByRole('button', {
			name: 'Highlights'
		});
		fireEvent.click(highlightsTab);

		const highlights = await screen.findByTestId('session-highlights');
		// The section no longer carries a literal "Highlights" heading — that text
		// now lives only on the tab button. The mocked highlight is a Counts-group
		// type (session-total-record), so it renders under the "Counts" section;
		// the Best-of-the-session subsection holds the oldest-bird fact (ABC001,
		// proven_age 5, from this file's mockEncounters).
		expect(highlights.textContent).toContain('Counts');
		expect(highlights.textContent).toContain('Busiest session ever — 3 birds');
		expect(highlights.textContent).toContain(
			'Oldest: 5 years — Robin (ABC001)'
		);
	});

	describe('session navigation', () => {
		it('renders a "Previous" link pointing to the previous session date', async () => {
			render(await renderPage());
			const previousLink = await screen.findByRole('link', {
				name: /previous session/i
			});
			// The global BootstrapPage mock (vitest.setup.tsx) always supplies
			// viewedGroup as { id: 1, slug: 'alpha' }, not the slug passed via params.
			expect(previousLink.getAttribute('href')).toBe(
				`/group/alpha/session/${mockPreviousSession[0].visit_date}`
			);
		});

		it('renders a "Next" link pointing to the next session date', async () => {
			render(await renderPage());
			const nextLink = await screen.findByRole('link', {
				name: /next session/i
			});
			expect(nextLink.getAttribute('href')).toBe(
				`/group/alpha/session/${mockNextSession[0].visit_date}`
			);
		});
	});

	describe('multiple locations on the same date', () => {
		const mockMultiLocationSessions = [
			{
				id: 1,
				location_id: 10,
				location: { id: 10, location_name: 'Test Reserve', ringing_group_id: 1 }
			},
			{
				id: 2,
				location_id: 20,
				location: { id: 20, location_name: 'Other Site', ringing_group_id: 1 }
			}
		];

		it('links each location badge to the group-slug-based site href', async () => {
			const client = makeSessionClient([
				makeChain(mockMultiLocationSessions),
				makeChain(mockPreviousSession),
				makeChain(mockNextSession),
				makeChain(mockEncounters)
			]);
			mockGetAuthenticatedSupabaseClient.mockResolvedValue(client);
			render(await renderPage());
			const testReserveLink = await screen.findByRole('link', {
				name: 'Test Reserve'
			});
			const otherSiteLink = screen.getByRole('link', { name: 'Other Site' });
			expect(testReserveLink.getAttribute('href')).toBe(
				`/group/alpha/session/${TEST_DATE}/site/10`
			);
			expect(otherSiteLink.getAttribute('href')).toBe(
				`/group/alpha/session/${TEST_DATE}/site/20`
			);
		});
	});

	describe('?tabId= query param (#805)', () => {
		it('with no tabId search param, the Species totals tab renders unchanged', async () => {
			render(await renderPage());
			await screen.findByTestId('session-table');
			expect(screen.queryByText(/Net round 1/)).toBeNull();
			expect(screen.queryByTestId('session-highlights')).toBeNull();
		});

		it('?tabId=net-rounds focuses the Net rounds tab and renders its content without a click', async () => {
			render(await renderPage('net-rounds'));
			await screen.findByText('Net round 1: 08:00');
		});

		it('?tabId=highlights focuses the Highlights tab and loads it without a click', async () => {
			render(await renderPage('highlights'));
			const highlights = await screen.findByTestId('session-highlights');
			expect(highlights.textContent).toContain('Counts');
		});

		it('?tabId=not-a-real-tab falls back to the Species totals tab, with no crash and no blank pane', async () => {
			render(await renderPage('not-a-real-tab'));
			await screen.findByTestId('session-table');
			expect(screen.queryByTestId('session-highlights')).toBeNull();
			expect(screen.queryByText(/Net round 1/)).toBeNull();
		});
	});
});
