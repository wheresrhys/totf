import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import Page from '../page';
import recentSessionsSnapshot from '@/test-fixtures/snapshots/fetchRecentSessions.alpha.json';
import topSpeciesSnapshot from '@/test-fixtures/snapshots/fetchTopSpecies.alpha.json';
import type { GroupTicksResult } from '@/app/models/db';

const { mockGetAuthenticatedSupabaseClient } = vi.hoisted(() => ({
	mockGetAuthenticatedSupabaseClient: vi.fn()
}));

vi.mock('@/lib/group-auth', () => ({
	getAuthenticatedSupabaseClient: mockGetAuthenticatedSupabaseClient
}));

vi.mock('@/app/actions/top-performers', () => ({
	getTopStats: vi.fn().mockResolvedValue([])
}));

const defaultLastGroupTick: GroupTicksResult[] = [
	{ species_name: 'Carrion Crow', first_encounter_date: '2026-02-12' }
];

function makeChainClient(
	overrides: {
		Sessions?: unknown;
		Species?: unknown;
		lastGroupTick?: unknown;
	} = {}
) {
	const dataByTable: Record<string, unknown> = {
		Sessions: recentSessionsSnapshot,
		Species: topSpeciesSnapshot,
		...overrides
	};
	const lastGroupTick = overrides.lastGroupTick ?? defaultLastGroupTick;
	function chainFor(data: unknown) {
		const thenable = {
			then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
				Promise.resolve({ data, error: null }).then(resolve)
		};
		return {
			select: vi.fn().mockReturnThis(),
			eq: vi.fn().mockReturnThis(),
			order: vi.fn().mockReturnThis(),
			limit: vi.fn().mockReturnThis(),
			...thenable
		};
	}
	return {
		from: vi.fn((table: string) => chainFor(dataByTable[table] ?? [])),
		rpc: vi.fn().mockReturnValue({
			then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
				Promise.resolve({ data: lastGroupTick, error: null }).then(resolve)
		})
	};
}

describe('home page', () => {
	afterEach(() => {
		cleanup();
	});

	beforeEach(() => {
		mockGetAuthenticatedSupabaseClient.mockResolvedValue(makeChainClient());
	});

	it('renders Recent Sessions heading', async () => {
		render(await Page());
		const heading = await screen.findByRole('heading', {
			name: 'Recent Sessions'
		});
		expect(heading).toBeDefined();
	});

	it('renders stats accordion', async () => {
		render(await Page());
		const accordions = await screen.findAllByTestId('stats-accordion-group');
		expect(accordions.length).toBeGreaterThan(0);
	});

	it('renders session links from fixture', async () => {
		render(await Page());
		const heading = await screen.findByRole('heading', {
			name: 'Recent Sessions'
		});
		const sessionLinks =
			heading.nextElementSibling?.querySelectorAll('a') ?? [];
		expect(sessionLinks.length).toBe(recentSessionsSnapshot.length);
	});

	describe('with no recent sessions', () => {
		it('renders empty session list', async () => {
			mockGetAuthenticatedSupabaseClient.mockResolvedValue(
				makeChainClient({ Sessions: [] })
			);
			render(await Page());
			const heading = await screen.findByRole('heading', {
				name: 'Recent Sessions'
			});
			const sessionLinks =
				heading.nextElementSibling?.querySelectorAll('a') ?? [];
			expect(sessionLinks.length).toBe(0);
		});
	});

	describe('with multiple sessions on the same date', () => {
		it('renders all sessions from the last 3 distinct dates', async () => {
			const sessionsWithSharedDate = [
				{
					id: 1,
					visit_date: '2024-05-10',
					location_id: 1,
					ringing_group_id: 3,
					location: { location_name: 'Site A' },
					encounters: [{ count: 4 }]
				},
				{
					id: 2,
					visit_date: '2024-05-10',
					location_id: 2,
					ringing_group_id: 3,
					location: { location_name: 'Site B' },
					encounters: [{ count: 2 }]
				},
				{
					id: 3,
					visit_date: '2024-04-15',
					location_id: 1,
					ringing_group_id: 3,
					location: { location_name: 'Site A' },
					encounters: [{ count: 1 }]
				},
				{
					id: 4,
					visit_date: '2024-03-20',
					location_id: 1,
					ringing_group_id: 3,
					location: { location_name: 'Site A' },
					encounters: [{ count: 3 }]
				}
			];
			mockGetAuthenticatedSupabaseClient.mockResolvedValue(
				makeChainClient({ Sessions: sessionsWithSharedDate })
			);
			render(await Page());
			const heading = await screen.findByRole('heading', {
				name: 'Recent Sessions'
			});
			const sessionLinks =
				heading.nextElementSibling?.querySelectorAll('a') ?? [];
			// 2 sessions on same date: 1 day-total link (StatOutput) + 2 site links
			// + 1 link each for the 2 single-session dates = 5 total
			expect(sessionLinks.length).toBe(5);
		});
	});

	describe('last group tick', () => {
		it('renders "Last group tick: {species} on {date}" paragraph when data is present', async () => {
			render(await Page());
			expect(
				await screen.findByText(
					'Last group tick: Carrion Crow on 12th February 2026'
				)
			).toBeDefined();
		});

		it('renders a "View all" link to /ticks when data is present', async () => {
			render(await Page());
			const link = await screen.findByRole('link', { name: 'View all' });
			expect(link.getAttribute('href')).toBe('/ticks');
		});

		describe('with no ticks yet', () => {
			it('omits the paragraph entirely', async () => {
				mockGetAuthenticatedSupabaseClient.mockResolvedValue(
					makeChainClient({ lastGroupTick: [] })
				);
				render(await Page());
				const heading = await screen.findByRole('heading', {
					name: 'Recent Sessions'
				});
				expect(heading).toBeDefined();
				expect(screen.queryByText(/Last group tick:/)).toBeNull();
			});

			it('omits the "View all" link', async () => {
				mockGetAuthenticatedSupabaseClient.mockResolvedValue(
					makeChainClient({ lastGroupTick: [] })
				);
				render(await Page());
				await screen.findByRole('heading', { name: 'Recent Sessions' });
				expect(screen.queryByRole('link', { name: 'View all' })).toBeNull();
			});
		});
	});

	describe('top species section', () => {
		it('renders Top species heading', async () => {
			render(await Page());
			const heading = await screen.findByRole('heading', {
				name: 'Top species'
			});
			expect(heading).toBeDefined();
		});

		it('renders a badge link per top species, sorted by bird count and excluding zero-count and beyond-10th species', async () => {
			render(await Page());
			const heading = await screen.findByRole('heading', {
				name: 'Top species'
			});
			const speciesLinks = Array.from(
				heading.nextElementSibling?.querySelectorAll('a') ?? []
			);
			expect(speciesLinks.map((link) => link.textContent?.trim())).toEqual([
				'Blackbird',
				'Blue Tit',
				'Robin',
				'Great Tit',
				'Chaffinch',
				'Wren',
				'Dunnock',
				'Goldfinch',
				'Song Thrush',
				'Nuthatch'
			]);
			expect(speciesLinks.map((link) => link.getAttribute('href'))).toEqual([
				'/species/Blackbird',
				'/species/Blue Tit',
				'/species/Robin',
				'/species/Great Tit',
				'/species/Chaffinch',
				'/species/Wren',
				'/species/Dunnock',
				'/species/Goldfinch',
				'/species/Song Thrush',
				'/species/Nuthatch'
			]);
		});

		describe('with no species yet caught', () => {
			it('renders no badge links', async () => {
				mockGetAuthenticatedSupabaseClient.mockResolvedValue(
					makeChainClient({ Species: [] })
				);
				render(await Page());
				const heading = await screen.findByRole('heading', {
					name: 'Top species'
				});
				const speciesLinks =
					heading.nextElementSibling?.querySelectorAll('a') ?? [];
				expect(speciesLinks.length).toBe(0);
			});
		});
	});
});
