import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import Page from '../page';
import { RESIGHTING_RECORD_TYPES } from '@/lib/demon-import';
import {
	TEST_DATE,
	TEST_GROUP_ID,
	TEST_GROUP_SLUG,
	testReserveLocation,
	otherSiteLocation,
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

// Counts comes from the highlights pipeline's getCondensedHighlightsAtTimePeriod.
// Mock it as the one collaborator it is; the printer is a test double returning a
// fixed sentence, not the real formatting logic (covered by the pipeline's own
// tests).
vi.mock('@/app/lib/highlights', () => ({
	getCondensedHighlightsAtTimePeriod: vi.fn().mockResolvedValue([
		{
			formatters: {
				combinedHighlightPrinter: () => 'Busiest session ever — 3 birds',
				highlightListPrefixPrinter: () => ''
			},
			descriptor: {
				category: 'count',
				type: 'session-total',
				unit: 'encounter'
			},
			value: { timePeriod: '2024-03-15', value: 3, species: null },
			species: undefined,
			bestPosition: 1,
			scopes: []
		}
	])
}));

const mockEncounters = [
	makeMockEncounter(),
	makeMockEncounter({
		id: 2,
		age_code: 1,
		capture_time: '08:15:00',
		record_type: 'S',
		sex: 'F',
		weight: null,
		wing_length: null,
		bird: {
			ring_no: 'XYZ002',
			proven_age: 2,
			species: { id: 1, species_name: 'Robin' }
		}
	}),
	makeMockEncounter({
		id: 3,
		age_code: 2,
		capture_time: '08:30:00',
		sex: 'U',
		weight: 11.0,
		wing_length: 55,
		bird: {
			ring_no: 'DEF003',
			proven_age: 0,
			species: { id: 2, species_name: 'Blue Tit' }
		}
	})
];

// The page fires three `Encounters` queries, in this order: the day's own
// encounters, then (in parallel) the previous- and next-session-date lookups.
const DAY_ENCOUNTERS_CHAIN = 0;
const PREVIOUS_DATE_CHAIN = 1;
const NEXT_DATE_CHAIN = 2;

// The wrapper page also resolves the group's numeric id from its slug via
// `resolveGroupIdBySlug` (`@/lib/group-slug`, mocked directly above) rather
// than through this page's own authenticated client — see #770, which moved
// that resolution onto an unauthenticated client so it works for a no-cookie
// visitor too.
function makeSessionClient(encounterChains: ReturnType<typeof makeChain>[]) {
	let nextChainIndex = 0;
	const from = vi.fn(() => encounterChains[nextChainIndex++]);
	return { from, encounterChains };
}

function makeDefaultSessionClient(dayEncounters = mockEncounters) {
	return makeSessionClient([
		makeChain(dayEncounters),
		makeChain(mockPreviousSession),
		makeChain(mockNextSession)
	]);
}

function renderPage(tabId?: string) {
	return Page({
		params: Promise.resolve({ groupSlug: TEST_GROUP_SLUG, date: TEST_DATE }),
		...(tabId === undefined ? {} : { searchParams: Promise.resolve({ tabId }) })
	});
}

/** Renders with a purpose-built client and hands back its query-builder doubles. */
async function renderWithClient(
	client: ReturnType<typeof makeDefaultSessionClient>
) {
	mockGetAuthenticatedSupabaseClient.mockResolvedValue(client);
	render(await renderPage());
	return client.encounterChains;
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

	describe("querying the day's encounters", () => {
		it('queries the Encounters table directly, not via Sessions', async () => {
			const client = makeDefaultSessionClient();
			mockGetAuthenticatedSupabaseClient.mockResolvedValue(client);
			render(await renderPage());
			await screen.findByTestId('session-stats');
			expect(client.from).toHaveBeenCalledWith('Encounters');
			expect(client.from).not.toHaveBeenCalledWith('Sessions');
		});

		it('scopes the query to the viewed group and the requested visit_date', async () => {
			const chains = await renderWithClient(makeDefaultSessionClient());
			await screen.findByTestId('session-stats');
			const dayChain = chains[DAY_ENCOUNTERS_CHAIN];
			expect(dayChain.eq).toHaveBeenCalledWith(
				'ringing_group_id',
				Number(TEST_GROUP_ID)
			);
			expect(dayChain.eq).toHaveBeenCalledWith('visit_date', TEST_DATE);
		});

		it('excludes resighting-type encounters, so totals match the summary pages', async () => {
			const chains = await renderWithClient(makeDefaultSessionClient());
			await screen.findByTestId('session-stats');
			expect(chains[DAY_ENCOUNTERS_CHAIN].not).toHaveBeenCalledWith(
				'record_type',
				'in',
				`(${RESIGHTING_RECORD_TYPES.join(',')})`
			);
		});

		it('no longer filters on Sessions.session_type', async () => {
			const chains = await renderWithClient(makeDefaultSessionClient());
			await screen.findByTestId('session-stats');
			chains.forEach((chain) => {
				expect(chain.eq).not.toHaveBeenCalledWith(
					'session_type',
					expect.anything()
				);
			});
		});
	});

	describe('adjacent session date lookups', () => {
		it('finds the previous date from encounters strictly before this one', async () => {
			const chains = await renderWithClient(makeDefaultSessionClient());
			await screen.findByTestId('session-stats');
			const previousChain = chains[PREVIOUS_DATE_CHAIN];
			expect(previousChain.lt).toHaveBeenCalledWith('visit_date', TEST_DATE);
			expect(previousChain.order).toHaveBeenCalledWith('visit_date', {
				ascending: false
			});
			expect(previousChain.not).toHaveBeenCalledWith(
				'record_type',
				'in',
				`(${RESIGHTING_RECORD_TYPES.join(',')})`
			);
		});

		it('finds the next date from encounters strictly after this one', async () => {
			const chains = await renderWithClient(makeDefaultSessionClient());
			await screen.findByTestId('session-stats');
			const nextChain = chains[NEXT_DATE_CHAIN];
			expect(nextChain.gt).toHaveBeenCalledWith('visit_date', TEST_DATE);
			expect(nextChain.order).toHaveBeenCalledWith('visit_date', {
				ascending: true
			});
			expect(nextChain.not).toHaveBeenCalledWith(
				'record_type',
				'in',
				`(${RESIGHTING_RECORD_TYPES.join(',')})`
			);
		});

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

	describe('locations info strip', () => {
		it("names each distinct location the day's encounters were caught at", async () => {
			await renderWithClient(
				makeDefaultSessionClient([
					makeMockEncounter(),
					makeMockEncounter({
						id: 2,
						location_id: otherSiteLocation.id,
						location: otherSiteLocation
					})
				])
			);
			const strip = await screen.findByTestId('session-locations');
			expect(strip.textContent).toContain('Other Site');
			expect(strip.textContent).toContain('Test Reserve');
		});

		it('lists a location once however many encounters share it', async () => {
			await renderWithClient(
				makeDefaultSessionClient([
					makeMockEncounter(),
					makeMockEncounter({ id: 2 })
				])
			);
			const strip = await screen.findByTestId('session-locations');
			expect(strip.textContent?.match(/Test Reserve/g)).toHaveLength(1);
		});

		it('is display-only — no location is a link', async () => {
			await renderWithClient(
				makeDefaultSessionClient([
					makeMockEncounter(),
					makeMockEncounter({
						id: 2,
						location_id: otherSiteLocation.id,
						location: otherSiteLocation
					})
				])
			);
			const strip = await screen.findByTestId('session-locations');
			expect(strip.querySelectorAll('a')).toHaveLength(0);
			expect(
				screen.queryByRole('link', { name: testReserveLocation.location_name })
			).toBeNull();
		});
	});

	describe('a date with no non-resighting encounters', () => {
		it('renders the "No session found" empty state instead of 404ing', async () => {
			await renderWithClient(makeDefaultSessionClient([]));
			await screen.findByText(/No session found/i);
			expect(screen.queryByTestId('session-locations')).toBeNull();
		});
	});

	it('renders date as heading', async () => {
		render(await renderPage());
		const heading = await screen.findByRole('heading', { level: 1 });
		expect(heading.textContent).toContain('15th March 2024');
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

	it('does not render the highlights section before its tab is opened', async () => {
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
		// now lives only on the tab button. The mocked v2 highlight renders under
		// the "Counts" section; the Best-of-the-session subsection holds the
		// oldest-bird fact (ABC001, proven_age 5, from this file's mockEncounters).
		expect(highlights.textContent).toContain('Counts');
		expect(highlights.textContent).toContain('Busiest session ever — 3 birds');
		expect(highlights.textContent).toContain(
			'Oldest: 5 years — Robin (ABC001)'
		);
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
