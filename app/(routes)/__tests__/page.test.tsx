import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
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
	const rpc = vi.fn(
		(fnName: string, args: { from_date?: string; to_date?: string } = {}) => {
			const data =
				fnName === 'group_ticks'
					? lastGroupTick
					: args?.to_date
						? [summaryStats.lastYear]
						: args?.from_date
							? [summaryStats.thisYear]
							: [summaryStats.allTime];
			return {
				then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
					Promise.resolve({ data, error: null }).then(resolve)
			};
		}
	);
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

	it('renders Sessions heading with a "View all" link to /sessions', async () => {
		render(await Page());
		const heading = await screen.findByRole('heading', {
			name: 'Sessions View all'
		});
		expect(heading).toBeDefined();
		const link = within(heading).getByRole('link', { name: 'View all' });
		expect(link.getAttribute('href')).toBe('/sessions');
	});

	it('renders session links from fixture', async () => {
		render(await Page());
		const heading = await screen.findByRole('heading', {
			name: 'Sessions View all'
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
				name: 'Sessions View all'
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
				name: 'Sessions View all'
			});
			const sessionLinks =
				heading.nextElementSibling?.querySelectorAll('a') ?? [];
			// 2 sessions on same date: 1 day-total link (StatOutput) + 2 site links
			// + 1 link each for the 2 single-session dates = 5 total
			expect(sessionLinks.length).toBe(5);
		});
	});

	describe('species section', () => {
		it('renders Species heading with a "View all" link to /species', async () => {
			render(await Page());
			const heading = await screen.findByRole('heading', {
				name: 'Species View all'
			});
			expect(heading).toBeDefined();
			const link = within(heading).getByRole('link', { name: 'View all' });
			expect(link.getAttribute('href')).toBe('/species');
		});

		describe('last tick (last group tick)', () => {
			it('renders "Last tick: {species} on {date}" after the species badge list', async () => {
				render(await Page());
				const heading = await screen.findByRole('heading', {
					name: 'Species View all'
				});
				const container = heading.parentElement as HTMLElement;
				const children = Array.from(container.children);
				const list = container.querySelector('ul');
				const paragraph = children.find(
					(el) => el.tagName === 'P' && el.textContent?.includes('Last tick:')
				);
				expect(paragraph?.textContent).toContain(
					'Last tick: Carrion Crow on 12th February 2026'
				);
				expect(list).not.toBeNull();
				expect(children.indexOf(list as Element)).toBeLessThan(
					children.indexOf(paragraph as Element)
				);
			});

			it('renders a "View all ticks" link to /ticks', async () => {
				render(await Page());
				const link = await screen.findByRole('link', {
					name: 'View all ticks'
				});
				expect(link.getAttribute('href')).toBe('/ticks');
			});

			describe('with no ticks yet', () => {
				it('omits the paragraph entirely', async () => {
					mockGetAuthenticatedSupabaseClient.mockResolvedValue(
						makeChainClient({ lastGroupTick: [] })
					);
					render(await Page());
					const heading = await screen.findByRole('heading', {
						name: 'Species View all'
					});
					expect(heading).toBeDefined();
					expect(screen.queryByText(/Last tick:/)).toBeNull();
				});

				it('omits the "View all ticks" link', async () => {
					mockGetAuthenticatedSupabaseClient.mockResolvedValue(
						makeChainClient({ lastGroupTick: [] })
					);
					render(await Page());
					await screen.findByRole('heading', { name: 'Species View all' });
					expect(
						screen.queryByRole('link', { name: 'View all ticks' })
					).toBeNull();
				});
			});
		});

		it('renders a badge link per top species, sorted by bird count and excluding zero-count and beyond-10th species', async () => {
			render(await Page());
			const heading = await screen.findByRole('heading', {
				name: 'Species View all'
			});
			const speciesList = heading.parentElement?.querySelector('ul');
			const speciesLinks = Array.from(speciesList?.querySelectorAll('a') ?? []);
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
					name: 'Species View all'
				});
				const speciesList = heading.parentElement?.querySelector('ul');
				const speciesLinks = speciesList?.querySelectorAll('a') ?? [];
				expect(speciesLinks.length).toBe(0);
			});
		});
	});

	describe('summary stats table', () => {
		const summaryStatsRows: {
			label: string;
			field: keyof typeof summaryStatsSnapshot.allTime;
		}[] = [
			{ label: 'Sessions', field: 'session_count' },
			{ label: 'Birds', field: 'bird_count' },
			{ label: 'New', field: 'new_bird_count' },
			{ label: 'Encounters', field: 'encounter_count' },
			{ label: 'Species', field: 'species_count' }
		];

		function getRow(table: HTMLElement, label: string) {
			const row = within(table)
				.getAllByRole('row')
				.find((r) => within(r).queryByText(label));
			if (!row) throw new Error(`No row found for label "${label}"`);
			return row;
		}

		it('renders a "Totals" corner cell and a header column per period, labelled with the actual year and in this-year / last-year / all-time order', async () => {
			render(await Page());
			const table = await screen.findByTestId('summary-stats-table');
			const headers = within(table)
				.getAllByRole('columnheader')
				.map((h) => h.textContent);
			const currentYear = new Date().getFullYear();
			expect(headers).toEqual([
				'Totals',
				String(currentYear),
				String(currentYear - 1),
				'All time'
			]);
		});

		it('renders a row per metric with values from aggregate_stats for each period', async () => {
			render(await Page());
			const table = await screen.findByTestId('summary-stats-table');
			const { allTime, thisYear, lastYear } = summaryStatsSnapshot;
			summaryStatsRows.forEach(({ label, field }) => {
				const row = getRow(table, label);
				const cells = within(row)
					.getAllByRole('cell')
					.map((c) => c.textContent);
				expect(cells).toEqual([
					String(thisYear[field]),
					String(lastYear[field]),
					String(allTime[field])
				]);
			});
		});

		it('calls aggregate_stats for this year, last year, and all time, with the correct date bounds', async () => {
			const client = makeChainClient();
			mockGetAuthenticatedSupabaseClient.mockResolvedValue(client);
			render(await Page());
			await screen.findByTestId('summary-stats-table');
			const currentYear = new Date().getFullYear();
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
						(args as { from_date?: string }).from_date ===
						`${currentYear}-01-01`
				)
			).toBe(true);
			expect(
				calls.some(
					([, args]) =>
						(args as { from_date?: string; to_date?: string }).from_date ===
							`${currentYear - 1}-01-01` &&
						(args as { from_date?: string; to_date?: string }).to_date ===
							`${currentYear - 1}-12-31`
				)
			).toBe(true);
		});

		describe('with a brand-new group that has zero sessions', () => {
			it('renders "0" in every cell', async () => {
				mockGetAuthenticatedSupabaseClient.mockResolvedValue(
					makeChainClient({
						summaryStats:
							summaryStatsZeroSnapshot as unknown as HomePageSummaryStats
					})
				);
				render(await Page());
				const table = await screen.findByTestId('summary-stats-table');
				summaryStatsRows.forEach(({ label }) => {
					const row = getRow(table, label);
					const cells = within(row)
						.getAllByRole('cell')
						.map((c) => c.textContent);
					expect(cells).toEqual(['0', '0', '0']);
				});
			});
		});

		describe('with only all-time data (this-year and last-year missing)', () => {
			it('renders a dash for the missing periods and values for all time', async () => {
				mockGetAuthenticatedSupabaseClient.mockResolvedValue(
					makeChainClient({
						summaryStats: {
							allTime: summaryStatsSnapshot.allTime,
							thisYear: null,
							lastYear: null
						} as unknown as HomePageSummaryStats
					})
				);
				render(await Page());
				const table = await screen.findByTestId('summary-stats-table');
				const row = getRow(table, 'Sessions');
				const cells = within(row)
					.getAllByRole('cell')
					.map((c) => c.textContent);
				expect(cells).toEqual([
					'–',
					'–',
					String(summaryStatsSnapshot.allTime.session_count)
				]);
			});
		});

		describe('with every period missing', () => {
			it('renders no table', async () => {
				mockGetAuthenticatedSupabaseClient.mockResolvedValue(
					makeChainClient({
						summaryStats: {
							allTime: null,
							thisYear: null,
							lastYear: null
						} as unknown as HomePageSummaryStats
					})
				);
				render(await Page());
				await screen.findByRole('heading', { name: 'Sessions View all' });
				expect(screen.queryByTestId('summary-stats-table')).toBeNull();
			});
		});
	});
});
