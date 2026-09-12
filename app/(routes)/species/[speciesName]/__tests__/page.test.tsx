import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	render,
	screen,
	cleanup,
	fireEvent,
	within
} from '@testing-library/react';
import Page, { getSpeciesStats } from '../page';
import spPageSnapshot from '@/test-fixtures/snapshots/fetchSpPageData.alpha.robin.json';
import type { FullFatPageData } from '../PageContent';
import type {
	AggregateStatsResult,
	BiometricsStatsResult
} from '@/app/models/db';

const { mockGetAuthenticatedSupabaseClient, mockFetchPageOfBirds } = vi.hoisted(
	() => ({
		mockGetAuthenticatedSupabaseClient: vi.fn(),
		mockFetchPageOfBirds: vi.fn()
	})
);

vi.mock('@/lib/group-auth', () => ({
	getAuthenticatedSupabaseClient: mockGetAuthenticatedSupabaseClient
}));

vi.mock('@/app/actions/sp-data', () => ({
	fetchPageOfBirds: mockFetchPageOfBirds
}));

vi.mock('@/app/components/pages/species/SpIndividualsTab', () => ({
	SpIndividualsTab: () => <div data-testid="sp-individuals-tab" />
}));

vi.mock('@/app/components/pages/species/SpNotableRetrapsTab', () => ({
	SpNotableRetrapsTab: () => <div data-testid="sp-notable-retraps-tab" />
}));

vi.mock('@/app/components/pages/species/SpBusiestSessionsTab', () => ({
	SpBusiestSessionsTab: () => <div data-testid="sp-busiest-sessions-tab" />
}));

vi.mock('@/app/components/pages/species/SpPopulationTab', () => ({
	SpPopulationTab: () => <div data-testid="sp-population-tab" />
}));

vi.mock('@/app/components/pages/species/SpBiometricsTab', () => ({
	SpBiometricsTab: () => <div data-testid="sp-biometrics-tab" />
}));

vi.mock('@/app/components/pages/species/SpYearTotalsTab', () => ({
	SpYearTotalsTab: () => <div data-testid="sp-year-totals-tab" />
}));

vi.mock('@/app/components/pages/species/SpCombinedMonthTotalsTab', () => ({
	SpCombinedMonthTotalsTab: () => (
		<div data-testid="sp-combined-month-totals-tab" />
	)
}));

vi.mock('@/app/components/pages/species/SpSessionTotalsTab', () => ({
	SpSessionTotalsTab: () => <div data-testid="sp-session-totals-tab" />
}));

const { birds, speciesStats } = spPageSnapshot as unknown as FullFatPageData;

function makeSpeciesClient() {
	const fromChain = {
		select: vi.fn().mockReturnThis(),
		eq: vi.fn().mockReturnThis(),
		single: vi.fn().mockReturnThis(),
		then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
			Promise.resolve({
				data: { id: spPageSnapshot.speciesId },
				error: null
			}).then(resolve)
	};
	const rpcThenable = {
		then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
			Promise.resolve({ data: [speciesStats], error: null }).then(resolve)
	};
	return {
		from: vi.fn().mockReturnValue(fromChain),
		rpc: vi.fn().mockReturnValue(rpcThenable)
	};
}

function renderSpeciesPage(speciesName = 'Robin', tabId?: string) {
	return Page({
		params: Promise.resolve({ speciesName }),
		...(tabId === undefined ? {} : { searchParams: Promise.resolve({ tabId }) })
	});
}

describe('species detail page', () => {
	afterEach(() => {
		cleanup();
	});

	describe('with full data (Robin fixture)', () => {
		beforeEach(() => {
			mockGetAuthenticatedSupabaseClient.mockResolvedValue(makeSpeciesClient());
			mockFetchPageOfBirds.mockResolvedValue(birds);
		});

		describe('tab order and defaults (all-time page)', () => {
			it('renders tab buttons in the order Year totals, Month totals, Session totals, Highlights, Biometrics, Population, Bird list', async () => {
				render(await renderSpeciesPage());
				await screen.findByTestId('sp-year-totals-tab');
				const labels = within(screen.getByRole('tablist'))
					.getAllByRole('button')
					.map((button) => button.textContent);
				expect(labels).toEqual([
					'Year totals',
					'Month totals',
					'Session totals',
					'Highlights',
					'Biometrics',
					'Population',
					'Bird list'
				]);
				expect(screen.queryByRole('button', { name: 'Graphs' })).toBeNull();
				expect(
					screen.queryByRole('button', { name: 'Trend charts' })
				).toBeNull();
				expect(screen.queryByRole('button', { name: 'Size plot' })).toBeNull();
			});

			it('renders SpYearTotalsTab on initial render without clicking (eager default)', async () => {
				render(await renderSpeciesPage());
				await screen.findByTestId('sp-year-totals-tab');
			});

			it('does not mount SpIndividualsTab until the Bird list tab is clicked (now lazy)', async () => {
				render(await renderSpeciesPage());
				await screen.findByTestId('sp-year-totals-tab');
				expect(screen.queryByTestId('sp-individuals-tab')).toBeNull();
				fireEvent.click(screen.getByRole('button', { name: 'Bird list' }));
				await screen.findByTestId('sp-individuals-tab');
			});

			it('keeps Bird list mounted after being clicked once even when another tab is reselected', async () => {
				render(await renderSpeciesPage());
				await screen.findByTestId('sp-year-totals-tab');
				fireEvent.click(screen.getByRole('button', { name: 'Bird list' }));
				await screen.findByTestId('sp-individuals-tab');
				fireEvent.click(screen.getByRole('button', { name: 'Year totals' }));
				await screen.findByTestId('sp-year-totals-tab');
				// bird-list panel stays mounted (hidden) once loaded
				expect(screen.getByTestId('sp-individuals-tab')).toBeDefined();
			});
		});

		it("shows both 'Year totals' and 'Month totals' tabs on the all-time species page", async () => {
			render(await renderSpeciesPage());
			await screen.findByTestId('sp-year-totals-tab');
			expect(screen.getByRole('button', { name: 'Year totals' })).toBeDefined();
			expect(
				screen.getByRole('button', { name: 'Month totals' })
			).toBeDefined();
		});

		describe('highlights tab (click to activate)', () => {
			it('renders both SpNotableRetrapsTab and SpBusiestSessionsTab after clicking Highlights button', async () => {
				render(await renderSpeciesPage());
				await screen.findByTestId('sp-year-totals-tab');
				fireEvent.click(screen.getByRole('button', { name: 'Highlights' }));
				await screen.findByTestId('sp-notable-retraps-tab');
				await screen.findByTestId('sp-busiest-sessions-tab');
			});
		});

		describe('month-totals tab (click to activate)', () => {
			it('renders SpCombinedMonthTotalsTab after clicking Month totals button', async () => {
				render(await renderSpeciesPage());
				await screen.findByTestId('sp-year-totals-tab');
				fireEvent.click(screen.getByRole('button', { name: 'Month totals' }));
				await screen.findByTestId('sp-combined-month-totals-tab');
			});
		});

		describe('session-totals tab (click to activate)', () => {
			it('renders SpSessionTotalsTab after clicking Session totals button', async () => {
				render(await renderSpeciesPage());
				await screen.findByTestId('sp-year-totals-tab');
				fireEvent.click(screen.getByRole('button', { name: 'Session totals' }));
				await screen.findByTestId('sp-session-totals-tab');
			});

			it('lazily loads SpSessionTotalsTab only once "Session totals" is selected, consistent with the other tabs', async () => {
				render(await renderSpeciesPage());
				await screen.findByTestId('sp-year-totals-tab');
				expect(screen.queryByTestId('sp-session-totals-tab')).toBeNull();
				fireEvent.click(screen.getByRole('button', { name: 'Session totals' }));
				await screen.findByTestId('sp-session-totals-tab');
			});
		});

		describe('biometrics tab (click to activate)', () => {
			it('renders SpBiometricsTab after clicking Biometrics button', async () => {
				render(await renderSpeciesPage());
				await screen.findByTestId('sp-year-totals-tab');
				fireEvent.click(screen.getByRole('button', { name: 'Biometrics' }));
				await screen.findByTestId('sp-biometrics-tab');
			});
		});

		describe('population tab (click to activate, labelled "Population")', () => {
			it('renders SpPopulationTab after clicking the Population button', async () => {
				render(await renderSpeciesPage());
				await screen.findByTestId('sp-year-totals-tab');
				fireEvent.click(screen.getByRole('button', { name: 'Population' }));
				await screen.findByTestId('sp-population-tab');
			});

			it('lazily loads SpPopulationTab only once "Population" is selected', async () => {
				render(await renderSpeciesPage());
				await screen.findByTestId('sp-year-totals-tab');
				expect(screen.queryByTestId('sp-population-tab')).toBeNull();
				fireEvent.click(screen.getByRole('button', { name: 'Population' }));
				await screen.findByTestId('sp-population-tab');
			});

			it("renders a 'Population' button that activates the 'population' tab panel", async () => {
				render(await renderSpeciesPage());
				await screen.findByTestId('sp-year-totals-tab');
				expect(screen.queryByRole('button', { name: 'Graphs' })).toBeNull();
				fireEvent.click(screen.getByRole('button', { name: 'Population' }));
				await screen.findByTestId('sp-population-tab');
			});
		});

		describe('?tabId= query param (#803)', () => {
			it('with no tabId search param, the existing route-depth default tab renders and loads unchanged', async () => {
				render(await renderSpeciesPage('Robin'));
				await screen.findByTestId('sp-year-totals-tab');
				expect(
					screen
						.getByRole('button', { name: 'Year totals' })
						.getAttribute('aria-current')
				).toBe('true');
			});

			it('?tabId=biometrics focuses the Biometrics tab and renders SpBiometricsTab without a click', async () => {
				render(await renderSpeciesPage('Robin', 'biometrics'));
				await screen.findByTestId('sp-biometrics-tab');
				expect(
					screen
						.getByRole('button', { name: 'Biometrics' })
						.getAttribute('aria-current')
				).toBe('true');
			});

			it.each([
				['year-totals', 'Year totals', 'sp-year-totals-tab'],
				[
					'all-time-month-totals',
					'Month totals',
					'sp-combined-month-totals-tab'
				],
				['session-totals', 'Session totals', 'sp-session-totals-tab'],
				['highlights', 'Highlights', 'sp-busiest-sessions-tab'],
				['biometrics', 'Biometrics', 'sp-biometrics-tab'],
				['population', 'Population', 'sp-population-tab'],
				['bird-list', 'Bird list', 'sp-individuals-tab']
			])(
				'?tabId=%s selects the %s tab and loads its data without a click',
				async (tabId, buttonName, testId) => {
					render(await renderSpeciesPage('Robin', tabId));
					await screen.findByTestId(testId);
					expect(
						screen
							.getByRole('button', { name: buttonName })
							.getAttribute('aria-current')
					).toBe('true');
				}
			);

			it('?tabId=not-a-real-tab falls back to the route-depth default, with no crash and no blank pane', async () => {
				render(await renderSpeciesPage('Robin', 'not-a-real-tab'));
				await screen.findByTestId('sp-year-totals-tab');
				expect(
					screen
						.getByRole('button', { name: 'Year totals' })
						.getAttribute('aria-current')
				).toBe('true');
			});

			it("?tabId=bird-list wins over the all-time route's Year totals default", async () => {
				render(await renderSpeciesPage('Robin', 'bird-list'));
				await screen.findByTestId('sp-individuals-tab');
				expect(screen.queryByTestId('sp-year-totals-tab')).toBeNull();
				expect(
					screen
						.getByRole('button', { name: 'Bird list' })
						.getAttribute('aria-current')
				).toBe('true');
			});
		});
	});

	describe('not authorised state (data has speciesId only, no birds)', () => {
		beforeEach(() => {
			mockGetAuthenticatedSupabaseClient.mockResolvedValue(makeSpeciesClient());
			mockFetchPageOfBirds.mockResolvedValue([]);
		});

		it('renders "Not authorised to view any encounter data for this species" message', async () => {
			render(await renderSpeciesPage());
			await screen.findByText(
				'Not authorised to view any encounter data for this species'
			);
		});

		it('does not render tab buttons', async () => {
			render(await renderSpeciesPage());
			await screen.findByText(
				'Not authorised to view any encounter data for this species'
			);
			expect(screen.queryByRole('button', { name: 'Bird list' })).toBeNull();
		});
	});
});

const BIOMETRICS_FIELD_KEYS = [
	'min_weight',
	'max_weight',
	'avg_weight',
	'median_weight',
	'min_wing',
	'max_wing',
	'avg_wing',
	'median_wing'
] as const;

function omitBiometricsFields(row: AggregateStatsResult): AggregateStatsResult {
	const copy: Record<string, unknown> = { ...row };
	for (const key of BIOMETRICS_FIELD_KEYS) delete copy[key];
	return copy as unknown as AggregateStatsResult;
}

function makeAggregateRow(
	overrides: Partial<AggregateStatsResult> = {}
): AggregateStatsResult {
	return {
		...(speciesStats as AggregateStatsResult),
		...overrides
	};
}

function makeBiometricsRow(
	overrides: Partial<BiometricsStatsResult> = {}
): BiometricsStatsResult {
	return {
		species_name: null,
		time_period: null,
		min_weight: 10,
		max_weight: 20,
		avg_weight: 15,
		median_weight: 15,
		min_wing: 60,
		max_wing: 70,
		avg_wing: 65,
		median_wing: 65,
		...overrides
	} as unknown as BiometricsStatsResult;
}

function makeStatsClient({
	aggregateRows,
	biometricsRows
}: {
	aggregateRows: unknown[];
	biometricsRows: unknown[];
}) {
	const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
	const client = {
		rpc: vi.fn((name: string, args: Record<string, unknown>) => {
			rpcCalls.push({ name, args });
			const data = name === 'aggregate_stats' ? aggregateRows : biometricsRows;
			return {
				then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
					Promise.resolve({ data, error: null }).then(resolve)
			};
		})
	};
	mockGetAuthenticatedSupabaseClient.mockResolvedValue(client);
	return { rpcCalls };
}

const STATS_SPECIES_NAME = 'Robin';
const STATS_GROUP_ID = 7;
const STATS_FROM_DATE = '2023-01-01';
const STATS_TO_DATE = '2023-12-31';

describe('getSpeciesStats', () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it('merges biometrics_stats wing/weight fields onto the aggregate_stats row when both calls succeed', async () => {
		makeStatsClient({
			aggregateRows: [makeAggregateRow()],
			biometricsRows: [makeBiometricsRow({ min_weight: 99 })]
		});

		const result = await getSpeciesStats(STATS_SPECIES_NAME, STATS_GROUP_ID);

		expect(result[0].min_weight).toBe(99);
		expect(result[0].bird_count).toBe(
			(speciesStats as AggregateStatsResult).bird_count
		);
	});

	it('calls biometrics_stats with the same species_name_filter/ringing_group_filter it passes to aggregate_stats', async () => {
		const { rpcCalls } = makeStatsClient({
			aggregateRows: [makeAggregateRow()],
			biometricsRows: [makeBiometricsRow()]
		});

		await getSpeciesStats(STATS_SPECIES_NAME, STATS_GROUP_ID);

		const aggregateCall = rpcCalls.find(
			(call) => call.name === 'aggregate_stats'
		);
		const biometricsCall = rpcCalls.find(
			(call) => call.name === 'biometrics_stats'
		);
		expect(biometricsCall?.args).toMatchObject({
			species_name_filter: STATS_SPECIES_NAME,
			ringing_group_filter: STATS_GROUP_ID
		});
		expect(biometricsCall?.args.species_name_filter).toBe(
			aggregateCall?.args.species_name_filter
		);
		expect(biometricsCall?.args.ringing_group_filter).toBe(
			aggregateCall?.args.ringing_group_filter
		);
	});

	it('omits from_date/to_date from both calls when the page is unscoped (no date range)', async () => {
		const { rpcCalls } = makeStatsClient({
			aggregateRows: [makeAggregateRow()],
			biometricsRows: [makeBiometricsRow()]
		});

		await getSpeciesStats(STATS_SPECIES_NAME, STATS_GROUP_ID);

		expect(rpcCalls).toHaveLength(2);
		for (const call of rpcCalls) {
			expect(call.args).not.toHaveProperty('from_date');
			expect(call.args).not.toHaveProperty('to_date');
		}
	});

	it('includes from_date/to_date in both calls when the page is date-scoped', async () => {
		const { rpcCalls } = makeStatsClient({
			aggregateRows: [makeAggregateRow()],
			biometricsRows: [makeBiometricsRow()]
		});

		await getSpeciesStats(
			STATS_SPECIES_NAME,
			STATS_GROUP_ID,
			STATS_FROM_DATE,
			STATS_TO_DATE
		);

		expect(rpcCalls).toHaveLength(2);
		for (const call of rpcCalls) {
			expect(call.args).toMatchObject({
				from_date: STATS_FROM_DATE,
				to_date: STATS_TO_DATE
			});
		}
	});

	it('still returns a valid speciesStats row when aggregate_stats happens to already omit the wing/weight columns', async () => {
		makeStatsClient({
			aggregateRows: [omitBiometricsFields(makeAggregateRow())],
			biometricsRows: [makeBiometricsRow({ min_weight: 12, max_wing: 88 })]
		});

		const result = await getSpeciesStats(STATS_SPECIES_NAME, STATS_GROUP_ID);

		expect(result[0].min_weight).toBe(12);
		expect(result[0].max_wing).toBe(88);
		expect(result[0].bird_count).toBe(
			(speciesStats as AggregateStatsResult).bird_count
		);
	});
});
