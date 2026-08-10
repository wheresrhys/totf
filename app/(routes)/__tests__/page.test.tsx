import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import Page from '../page';
import recentSessionsSnapshot from '@/test-fixtures/snapshots/fetchRecentSessions.alpha.json';
import topSpeciesSnapshot from '@/test-fixtures/snapshots/fetchTopSpecies.alpha.json';
import summaryStatsSnapshot from '@/test-fixtures/snapshots/fetchHomePageSummaryStats.alpha.json';
import summaryStatsZeroSnapshot from '@/test-fixtures/snapshots/fetchHomePageSummaryStats.zero.json';
import type { HomePageSummaryStats } from '../page';
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
		summaryStats?: HomePageSummaryStats;
		lastGroupTick?: unknown;
	} = {}
) {
	const dataByTable: Record<string, unknown> = {
		Sessions: recentSessionsSnapshot,
		Species: topSpeciesSnapshot,
		...overrides
	};
	const summaryStats =
		overrides.summaryStats ??
		(summaryStatsSnapshot as unknown as HomePageSummaryStats);
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
	const rpc = vi.fn((fnName: string, args: { from_date?: string } = {}) => {
		const data =
			fnName === 'group_ticks'
				? lastGroupTick
				: args?.from_date
					? [summaryStats.thisYear]
					: [summaryStats.allTime];
		return {
			then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
				Promise.resolve({ data, error: null }).then(resolve)
		};
	});
	return {
		from: vi.fn((table: string) => chainFor(dataByTable[table] ?? [])),
		rpc
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

	describe('summary stats', () => {
		it('renders the all-time summary paragraph with bold counts from aggregate_stats', async () => {
			const { container } = render(await Page());
			await screen.findByRole('heading', { name: 'Recent Sessions' });
			const { allTime } = summaryStatsSnapshot;
			const paragraph = Array.from(container.querySelectorAll('p')).find((p) =>
				p.textContent?.includes('sessions, with')
			);
			expect(paragraph?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
				`${allTime.session_count} sessions, with ${allTime.bird_count} birds of ${allTime.species_count} species encountered ${allTime.encounter_count} times`
			);
			const boldValues = Array.from(
				paragraph?.querySelectorAll('.font-bold') ?? []
			).map((el) => el.textContent);
			expect(boldValues).toEqual([
				String(allTime.session_count),
				String(allTime.bird_count),
				String(allTime.species_count),
				String(allTime.encounter_count)
			]);
		});

		it('renders the this-year summary paragraph with bold counts from aggregate_stats', async () => {
			const { container } = render(await Page());
			await screen.findByRole('heading', { name: 'Recent Sessions' });
			const { thisYear } = summaryStatsSnapshot;
			const paragraph = Array.from(container.querySelectorAll('p')).find((p) =>
				p.textContent?.startsWith('This year:')
			);
			expect(paragraph?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
				`This year: ${thisYear.session_count} sessions, with ${thisYear.bird_count} birds of ${thisYear.species_count} species encountered ${thisYear.encounter_count} times`
			);
		});

		it('calls aggregate_stats with from_date set to 1 Jan of the current year for the this-year paragraph, and no date filter for the all-time paragraph', async () => {
			const client = makeChainClient();
			mockGetAuthenticatedSupabaseClient.mockResolvedValue(client);
			render(await Page());
			await screen.findByRole('heading', { name: 'Recent Sessions' });
			const currentYearStart = `${new Date().getFullYear()}-01-01`;
			const calls = client.rpc.mock.calls.filter(
				([fnName]) => fnName === 'aggregate_stats'
			);
			expect(
				calls.some(
					([, args]) => (args as { from_date?: string }).from_date === undefined
				)
			).toBe(true);
			expect(
				calls.some(
					([, args]) =>
						(args as { from_date?: string }).from_date === currentYearStart
				)
			).toBe(true);
		});

		describe('with a brand-new group that has zero sessions', () => {
			it('renders "0" in each stat slot for both paragraphs', async () => {
				mockGetAuthenticatedSupabaseClient.mockResolvedValue(
					makeChainClient({
						summaryStats:
							summaryStatsZeroSnapshot as unknown as HomePageSummaryStats
					})
				);
				const { container } = render(await Page());
				await screen.findByRole('heading', { name: 'Recent Sessions' });
				const paragraphs = Array.from(container.querySelectorAll('p')).filter(
					(p) => p.textContent?.includes('sessions, with')
				);
				expect(paragraphs.length).toBe(2);
				paragraphs.forEach((paragraph) => {
					const boldValues = Array.from(
						paragraph.querySelectorAll('.font-bold')
					).map((el) => el.textContent);
					expect(boldValues).toEqual(['0', '0', '0', '0']);
				});
			});
		});

		describe('with all-time data but no this-year data', () => {
			it('renders only the all-time paragraph', async () => {
				mockGetAuthenticatedSupabaseClient.mockResolvedValue(
					makeChainClient({
						summaryStats: {
							allTime: summaryStatsSnapshot.allTime,
							thisYear: null
						} as unknown as HomePageSummaryStats
					})
				);
				const { container } = render(await Page());
				await screen.findByRole('heading', { name: 'Recent Sessions' });
				const paragraphs = Array.from(container.querySelectorAll('p')).filter(
					(p) => p.textContent?.includes('sessions, with')
				);
				expect(paragraphs.length).toBe(1);
				expect(paragraphs[0].textContent?.startsWith('This year:')).toBe(false);
			});
		});

		describe('with this-year data but no all-time data', () => {
			it('renders only the this-year paragraph', async () => {
				mockGetAuthenticatedSupabaseClient.mockResolvedValue(
					makeChainClient({
						summaryStats: {
							allTime: null,
							thisYear: summaryStatsSnapshot.thisYear
						} as unknown as HomePageSummaryStats
					})
				);
				const { container } = render(await Page());
				await screen.findByRole('heading', { name: 'Recent Sessions' });
				const paragraphs = Array.from(container.querySelectorAll('p')).filter(
					(p) => p.textContent?.includes('sessions, with')
				);
				expect(paragraphs.length).toBe(1);
				expect(paragraphs[0].textContent?.startsWith('This year:')).toBe(true);
			});
		});
	});
});
