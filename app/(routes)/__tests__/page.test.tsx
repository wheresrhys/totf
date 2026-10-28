import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	render,
	screen,
	cleanup,
	within,
	fireEvent
} from '@testing-library/react';
import HomePage, { fetchHomePageSummaryStats } from '../page';
import recentSessionsSnapshot from '@/test-fixtures/snapshots/tables/Sessions/alpha.recent-sessions.json';
import topSpeciesSnapshot from '@/test-fixtures/snapshots/tables/Species/alpha.top-species.json';
import summaryStatsSnapshot from '@/test-fixtures/snapshots/core_stats/alpha.home-page-summary.json';
import summaryStatsZeroSnapshot from '@/test-fixtures/snapshots/synthetic/zero.home-page-summary.json';
import type { HomePageSummaryStats } from '../PageContent';
import type { CoreStatsResult, GroupTicksResult } from '@/app/models/db';
import type { ViewedGroup } from '@/app/lib/group-slug';
import type { StatsCacheReadParams } from '@/modules/stats/stats-cache';

const { mockGetAuthenticatedSupabaseClient, mockReadStatsCacheRows } =
	vi.hoisted(() => ({
		mockGetAuthenticatedSupabaseClient: vi.fn(),
		mockReadStatsCacheRows: vi.fn()
	}));

vi.mock('@/app/lib/auth/group-auth', () => ({
	getAuthenticatedSupabaseClient: mockGetAuthenticatedSupabaseClient
}));

vi.mock('@/modules/stats/stats-cache', () => ({
	readStatsCacheRows: mockReadStatsCacheRows
}));

const defaultLastGroupTick: GroupTicksResult[] = [
	{ species_name: 'Carrion Crow', first_encounter_date: '2026-02-12' }
];

const CURRENT_YEAR = new Date().getFullYear();
const START_OF_CURRENT_YEAR = `${CURRENT_YEAR}-01-01`;
const START_OF_LAST_YEAR = `${CURRENT_YEAR - 1}-01-01`;

// Points `readStatsCacheRows` (mocked above — fetchHomePageSummaryStats'
// one collaborator, #1236) at `stats`: the all-time grain resolves to a
// single-row read, and the year grain resolves to every year row the group
// has, tagged with the real `time_period` fetchHomePageSummaryStats matches
// against, regardless of whatever `time_period` the source fixture carried
// (the legacy core_stats-RPC fixtures below predate the cache tables and
// carry `time_period: null`).
function mockSummaryStats(stats: HomePageSummaryStats | null) {
	mockReadStatsCacheRows.mockImplementation(
		async ({ temporalUnit }: StatsCacheReadParams) => {
			if (stats == null) {
				return [];
			}
			if (temporalUnit === 'all-time') {
				return stats.allTime ? [stats.allTime] : [];
			}
			if (temporalUnit === 'year') {
				return [
					...(stats.thisYear
						? [{ ...stats.thisYear, time_period: START_OF_CURRENT_YEAR }]
						: []),
					...(stats.lastYear
						? [{ ...stats.lastYear, time_period: START_OF_LAST_YEAR }]
						: [])
				];
			}
			return [];
		}
	);
}

const defaultSummaryStats =
	// This is an ungrouped core_stats fixture, so species_name/time_period
	// are genuinely null; HomePageSummaryStats' NonNullable mapped type
	// (app/models/db.ts) assumes every column is always present, so a
	// direct assertion doesn't compile (#895).
	// eslint-disable-next-line no-restricted-syntax -- see comment above
	summaryStatsSnapshot as unknown as HomePageSummaryStats;

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
	const rpc = vi.fn(() => ({
		then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
			Promise.resolve({ data: lastGroupTick, error: null }).then(resolve)
	}));
	return {
		from: vi.fn((table: string) => chainFor(dataByTable[table] ?? [])),
		rpc
	};
}

describe('home page', () => {
	let authenticatedClient: ReturnType<typeof makeChainClient>;

	afterEach(() => {
		cleanup();
	});

	beforeEach(() => {
		authenticatedClient = makeChainClient();
		mockGetAuthenticatedSupabaseClient.mockResolvedValue(authenticatedClient);
		mockSummaryStats(defaultSummaryStats);
	});

	it('renders Sessions heading with a "View all" link to /sessions', async () => {
		render(await HomePage());
		const heading = await screen.findByRole('heading', {
			name: 'Sessions View all'
		});
		expect(heading).toBeDefined();
		const link = within(heading).getByRole('link', { name: 'View all' });
		expect(link.getAttribute('href')).toBe('/sessions');
	});

	it('renders session links from fixture', async () => {
		render(await HomePage());
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
			render(await HomePage());
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
					ringing_group_id: 3,
					encounters: [{ count: 4 }]
				},
				{
					id: 2,
					visit_date: '2024-05-10',
					ringing_group_id: 3,
					encounters: [{ count: 2 }]
				},
				{
					id: 3,
					visit_date: '2024-04-15',
					ringing_group_id: 3,
					encounters: [{ count: 1 }]
				},
				{
					id: 4,
					visit_date: '2024-03-20',
					ringing_group_id: 3,
					encounters: [{ count: 3 }]
				}
			];
			mockGetAuthenticatedSupabaseClient.mockResolvedValue(
				makeChainClient({ Sessions: sessionsWithSharedDate })
			);
			render(await HomePage());
			const heading = await screen.findByRole('heading', {
				name: 'Sessions View all'
			});
			const sessionLinks =
				heading.nextElementSibling?.querySelectorAll('a') ?? [];
			// One link per distinct date: the shared date contributes a single
			// day-total link (StatOutput, with no per-session location display any
			// more), plus 1 link each for the 2 single-session dates = 3 total.
			expect(sessionLinks.length).toBe(3);
		});
	});

	describe('last tick (last group tick)', () => {
		it('renders "Last tick: {species} on {date}" after the species letter nav', async () => {
			render(await HomePage());
			await screen.findByRole('heading', {
				name: 'Sessions View all'
			});
			const paragraph = screen.getByText(/Last tick:/);
			expect(paragraph.textContent).toContain(
				'Last tick: Carrion Crow on 12th February 2026'
			);
		});

		it('renders a "View all ticks" link to /ticks', async () => {
			render(await HomePage());
			const link = await screen.findByRole('link', {
				name: 'View all ticks'
			});
			expect(link.getAttribute('href')).toBe('/ticks');
		});
	});

	describe('species nav', () => {
		it('renders one letter button per distinct first letter among species the group has actually caught', async () => {
			render(await HomePage());
			await screen.findByRole('button', {
				name: 'Show species starting with B'
			});
			// Fixture species: Blue Tit, Reed Warbler, Fieldfare, Redwing,
			// Kingfisher, Wren, Robin (count > 0) and Chaffinch (count 0, so its
			// letter "C" must not appear).
			const letterButtons = screen.getAllByRole('button');
			expect(letterButtons.map((button) => button.textContent)).toEqual([
				'B',
				'F',
				'K',
				'R',
				'W'
			]);
		});

		describe('tapping a letter button', () => {
			it('reveals links to every species page starting with that letter, sorted alphabetically', async () => {
				render(await HomePage());
				await screen.findByRole('button', {
					name: 'Show species starting with B'
				});
				fireEvent.click(
					screen.getByRole('button', { name: 'Show species starting with R' })
				);
				const links = screen.getAllByRole('link', { name: /^[A-Z]/ });
				const speciesLinks = links.filter((link) =>
					link.getAttribute('href')?.startsWith('/species/')
				);
				expect(speciesLinks.map((link) => link.textContent?.trim())).toEqual([
					'Redwing',
					'Reed Warbler',
					'Robin'
				]);
				expect(speciesLinks[0].getAttribute('href')).toBe('/species/Redwing');
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
			render(await HomePage());
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

		it('renders a row per metric with values from core_stats for each period', async () => {
			render(await HomePage());
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

		it('reads the all-time and year grains from the cache via readStatsCacheRows', async () => {
			render(await HomePage());
			await screen.findByTestId('summary-stats-table');
			expect(mockReadStatsCacheRows).toHaveBeenCalledWith({
				client: authenticatedClient,
				viewedGroup: { id: 1, slug: 'alpha' },
				bySpecies: false,
				temporalUnit: 'all-time'
			});
			expect(mockReadStatsCacheRows).toHaveBeenCalledWith({
				client: authenticatedClient,
				viewedGroup: { id: 1, slug: 'alpha' },
				bySpecies: false,
				temporalUnit: 'year'
			});
		});

		describe('with a brand-new group that has zero sessions', () => {
			it('renders "0" in every cell', async () => {
				mockSummaryStats(
					// eslint-disable-next-line no-restricted-syntax -- see comment above defaultSummaryStats (#895)
					summaryStatsZeroSnapshot as unknown as HomePageSummaryStats
				);
				render(await HomePage());
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
				mockSummaryStats({
					// species_name/time_period are genuinely null on this ungrouped
					// core_stats fixture (#895, see comment above defaultSummaryStats).
					// eslint-disable-next-line no-restricted-syntax -- see comment above
					allTime: summaryStatsSnapshot.allTime as unknown as CoreStatsResult,
					thisYear: null,
					lastYear: null
				});
				render(await HomePage());
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
				mockSummaryStats({
					allTime: null,
					thisYear: null,
					lastYear: null
				});
				render(await HomePage());
				await screen.findByRole('heading', { name: 'Sessions View all' });
				expect(screen.queryByTestId('summary-stats-table')).toBeNull();
			});
		});
	});
});

describe('fetchHomePageSummaryStats', () => {
	const viewedGroup: ViewedGroup = { id: 1, slug: 'alpha' };
	const client = { from: vi.fn() };

	// Hand-built, minimal `CoreStatsResult` rows — only the columns these
	// tests actually read (#895's "hand-built object that only fills in the
	// columns a test actually reads" exception), tagged with distinguishing
	// `session_count` values so a wrong-row bug (e.g. this-year/last-year
	// swapped) would show up as a wrong number rather than passing by luck.
	function statsRow(overrides: Partial<CoreStatsResult>): CoreStatsResult {
		// eslint-disable-next-line no-restricted-syntax -- hand-built partial row with null species_name/time_period (#895)
		return {
			species_name: null,
			time_period: null,
			session_count: 0,
			total_effort: '00:00:00',
			effort_per_session: '00:00:00',
			effort_per_encounter: '00:00:00',
			avg_encounters_per_session: 0,
			max_per_session: 0,
			species_count: 0,
			bird_count: 0,
			encounter_count: 0,
			new_bird_count: 0,
			pullus_bird_count: 0,
			juv_bird_count: 0,
			postjuv_bird_count: 0,
			adult_bird_count: 0,
			unknown_age_bird_count: 0,
			pullus_enc_count: 0,
			juv_enc_count: 0,
			postjuv_enc_count: 0,
			adult_enc_count: 0,
			unknown_age_enc_count: 0,
			max_new_per_session: 0,
			...overrides
		} as unknown as CoreStatsResult;
	}

	beforeEach(() => {
		vi.clearAllMocks();
		mockGetAuthenticatedSupabaseClient.mockResolvedValue(client);
	});

	it('returns all-time, this-year and last-year rows read via readStatsCacheRows', async () => {
		const allTimeRow = statsRow({ session_count: 1 });
		const thisYearRow = statsRow({
			session_count: 2,
			time_period: START_OF_CURRENT_YEAR
		});
		const lastYearRow = statsRow({
			session_count: 3,
			time_period: START_OF_LAST_YEAR
		});
		mockReadStatsCacheRows.mockImplementation(
			async ({ temporalUnit }: StatsCacheReadParams) =>
				temporalUnit === 'all-time' ? [allTimeRow] : [thisYearRow, lastYearRow]
		);

		const result = await fetchHomePageSummaryStats(viewedGroup);

		expect(result).toEqual({
			allTime: allTimeRow,
			thisYear: thisYearRow,
			lastYear: lastYearRow
		});
		expect(mockReadStatsCacheRows).toHaveBeenCalledWith({
			client,
			viewedGroup,
			bySpecies: false,
			temporalUnit: 'all-time'
		});
		expect(mockReadStatsCacheRows).toHaveBeenCalledWith({
			client,
			viewedGroup,
			bySpecies: false,
			temporalUnit: 'year'
		});
	});

	it('matches "this year"\'s row by the current calendar year\'s time_period', async () => {
		const thisYearRow = statsRow({
			session_count: 42,
			time_period: START_OF_CURRENT_YEAR
		});
		// A row for some other, unrelated year must be ignored, not picked up
		// as "this year" by position.
		const someOtherYearRow = statsRow({
			session_count: 999,
			time_period: '1999-01-01'
		});
		mockReadStatsCacheRows.mockImplementation(
			async ({ temporalUnit }: StatsCacheReadParams) =>
				temporalUnit === 'all-time' ? [] : [someOtherYearRow, thisYearRow]
		);

		const result = await fetchHomePageSummaryStats(viewedGroup);

		expect(result?.thisYear).toEqual(thisYearRow);
	});

	it('matches "last year"\'s row by the previous calendar year\'s time_period', async () => {
		const lastYearRow = statsRow({
			session_count: 7,
			time_period: START_OF_LAST_YEAR
		});
		const someOtherYearRow = statsRow({
			session_count: 999,
			time_period: '1999-01-01'
		});
		mockReadStatsCacheRows.mockImplementation(
			async ({ temporalUnit }: StatsCacheReadParams) =>
				temporalUnit === 'all-time' ? [] : [someOtherYearRow, lastYearRow]
		);

		const result = await fetchHomePageSummaryStats(viewedGroup);

		expect(result?.lastYear).toEqual(lastYearRow);
	});

	it('returns null when all three rows are missing', async () => {
		mockReadStatsCacheRows.mockResolvedValue([]);

		const result = await fetchHomePageSummaryStats(viewedGroup);

		expect(result).toBeNull();
	});
});
