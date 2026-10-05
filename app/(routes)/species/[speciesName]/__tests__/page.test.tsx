import '@/app/__tests__/helpers/mock-species-tab-components';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import Page, {
	getSpeciesStats,
	fetchSpeciesPageContentForPeriod
} from '../page';
import birdsSnapshot from '@/test-fixtures/snapshots/tables/Birds/robin-alpha.page-of-birds.json';
import robinBiometricsHeadline from '@/test-fixtures/snapshots/biometrics_stats/robin-alpha.headline.json';
import {
	makeSpeciesClient,
	robinSpeciesStats as speciesStats
} from '@/app/__tests__/helpers/robin-species-page-fixtures';
import type { FullFatPageData } from '../PageContent';
import type { CoreStatsResult, BiometricsStatsResult } from '@/app/models/db';
import type { ViewedGroup } from '@/app/lib/group-slug';

const VIEWED_GROUP: ViewedGroup = { id: 1, slug: 'alpha' };

const {
	mockGetAuthenticatedSupabaseClient,
	mockFetchPageOfBirds,
	mockFetchYearTotalsTabData,
	mockFetchMonthTotalsTabData,
	mockFetchSessionTotalsTabData,
	mockFetchCombinedMonthTotalsTabData,
	mockFetchSquashedMonthYearTotalsTabData
} = vi.hoisted(() => ({
	mockGetAuthenticatedSupabaseClient: vi.fn(),
	mockFetchPageOfBirds: vi.fn(),
	mockFetchYearTotalsTabData: vi.fn(),
	mockFetchMonthTotalsTabData: vi.fn(),
	mockFetchSessionTotalsTabData: vi.fn(),
	mockFetchCombinedMonthTotalsTabData: vi.fn(),
	mockFetchSquashedMonthYearTotalsTabData: vi.fn()
}));

vi.mock('@/app/lib/auth/group-auth', () => ({
	getAuthenticatedSupabaseClient: mockGetAuthenticatedSupabaseClient
}));

vi.mock('@/app/actions/sp-data', () => ({
	fetchPageOfBirds: mockFetchPageOfBirds,
	fetchYearTotalsTabData: mockFetchYearTotalsTabData,
	fetchMonthTotalsTabData: mockFetchMonthTotalsTabData,
	fetchSessionTotalsTabData: mockFetchSessionTotalsTabData,
	fetchCombinedMonthTotalsTabData: mockFetchCombinedMonthTotalsTabData,
	fetchSquashedMonthYearTotalsTabData: mockFetchSquashedMonthYearTotalsTabData
}));

const birds = birdsSnapshot as FullFatPageData['birds'];

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
			vi.clearAllMocks();
			mockGetAuthenticatedSupabaseClient.mockResolvedValue(makeSpeciesClient());
			mockFetchPageOfBirds.mockResolvedValue(birds);
			mockFetchYearTotalsTabData.mockResolvedValue([]);
			mockFetchMonthTotalsTabData.mockResolvedValue([]);
			mockFetchSessionTotalsTabData.mockResolvedValue([]);
			mockFetchCombinedMonthTotalsTabData.mockResolvedValue({
				monthlyStats: [],
				monthSquashedStats: []
			});
			mockFetchSquashedMonthYearTotalsTabData.mockResolvedValue([]);
		});

		// `page.tsx`'s own `fetchSpeciesPageContentForPeriod` is what resolves
		// `?tabId=` server-side and decides whether to prefetch — exercised
		// directly here (same style as the `getSpeciesStats` describe below),
		// rather than through the full `Page(...)` → `BootstrapPage` → React
		// render pipeline, since that pipeline's own async-Server-Component
		// resolution timing can't distinguish "prefetched server-side" from "the
		// resolved tab was merely mounted and fetched client-side a moment
		// later" — this function's return value and the dataFetcher mocks it
		// calls can. Tab-by-tab rendering/click-through behaviour (which buttons
		// appear, which panel a click reveals) is covered at the
		// `PageContent.test.tsx` level instead, closer to the components that
		// actually render it.
		describe('initial tab resolution', () => {
			it('resolves ?tabId= to one of the 3 in-scope tabs and calls prefetchActiveTabData', async () => {
				const data = await fetchSpeciesPageContentForPeriod(
					{ speciesName: 'Robin', tabId: 'year-totals' },
					VIEWED_GROUP
				);
				expect(mockFetchYearTotalsTabData).toHaveBeenCalledTimes(1);
				expect(mockFetchMonthTotalsTabData).not.toHaveBeenCalled();
				expect(mockFetchSessionTotalsTabData).not.toHaveBeenCalled();
				expect(data).toMatchObject({
					initialTabId: 'year-totals',
					initialTabData: { tabId: 'year-totals', data: [] }
				});
			});

			it('resolves ?tabId= to one of the 3 not-yet-migrated tabs and skips prefetchActiveTabData', async () => {
				const data = await fetchSpeciesPageContentForPeriod(
					{ speciesName: 'Robin', tabId: 'biometrics' },
					VIEWED_GROUP
				);
				expect(mockFetchYearTotalsTabData).not.toHaveBeenCalled();
				expect(mockFetchMonthTotalsTabData).not.toHaveBeenCalled();
				expect(mockFetchSessionTotalsTabData).not.toHaveBeenCalled();
				expect(data).toMatchObject({
					initialTabId: 'biometrics',
					initialTabData: undefined
				});
			});
			it('resolves ?tabId=highlights to the Highlights tab but still skips prefetchActiveTabData, since it is declared clientSideOnly', async () => {
				const data = await fetchSpeciesPageContentForPeriod(
					{ speciesName: 'Robin', tabId: 'highlights' },
					VIEWED_GROUP
				);
				expect(mockFetchYearTotalsTabData).not.toHaveBeenCalled();
				expect(data).toMatchObject({
					initialTabId: 'highlights',
					initialTabData: undefined
				});
			});

			it('falls back to the route-depth default tab id when no ?tabId= is given', async () => {
				const data = await fetchSpeciesPageContentForPeriod(
					{ speciesName: 'Robin' },
					VIEWED_GROUP
				);
				expect(mockFetchYearTotalsTabData).toHaveBeenCalledTimes(1);
				expect(data).toMatchObject({ initialTabId: 'year-totals' });
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

function omitBiometricsFields(row: CoreStatsResult): CoreStatsResult {
	const copy: Record<string, unknown> = { ...row };
	for (const key of BIOMETRICS_FIELD_KEYS) delete copy[key];
	return copy as CoreStatsResult;
}

function makeAggregateRow(
	overrides: Partial<CoreStatsResult> = {}
): CoreStatsResult {
	return {
		...(speciesStats as CoreStatsResult),
		...overrides
	};
}

// The real captured biometrics_stats row for the exact call getSpeciesStats
// makes (Robin, Alpha, ungrouped — one headline row), rather than a
// hand-written literal that can silently drift from the RPC's shape (#883).
// This fixture's row has species_name/time_period null, but
// BiometricsStatsResult declares species_name non-null (app/models/db.ts),
// so a direct assertion doesn't compile (#895).
const [capturedBiometricsRow] =
	// eslint-disable-next-line no-restricted-syntax -- see comment above
	robinBiometricsHeadline as unknown as BiometricsStatsResult[];

function makeBiometricsRow(
	overrides: Partial<BiometricsStatsResult> = {}
): BiometricsStatsResult {
	return {
		...capturedBiometricsRow,
		...overrides
	};
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
			const data = name === 'core_stats' ? aggregateRows : biometricsRows;
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
const STATS_VIEWED_GROUP: ViewedGroup = { id: STATS_GROUP_ID, slug: 'alpha' };
const STATS_FROM_DATE = '2023-01-01';
const STATS_TO_DATE = '2023-12-31';

describe('getSpeciesStats', () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it('merges biometrics_stats wing/weight fields onto the core_stats row when both calls succeed', async () => {
		makeStatsClient({
			aggregateRows: [makeAggregateRow()],
			biometricsRows: [makeBiometricsRow({ min_weight: 99 })]
		});

		const result = await getSpeciesStats(
			STATS_SPECIES_NAME,
			STATS_VIEWED_GROUP
		);

		expect(result[0].min_weight).toBe(99);
		expect(result[0].bird_count).toBe(
			(speciesStats as CoreStatsResult).bird_count
		);
	});

	it('calls biometrics_stats with the same species_name_filter/ringing_group_filter it passes to core_stats', async () => {
		const { rpcCalls } = makeStatsClient({
			aggregateRows: [makeAggregateRow()],
			biometricsRows: [makeBiometricsRow()]
		});

		await getSpeciesStats(STATS_SPECIES_NAME, STATS_VIEWED_GROUP);

		const aggregateCall = rpcCalls.find((call) => call.name === 'core_stats');
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

		await getSpeciesStats(STATS_SPECIES_NAME, STATS_VIEWED_GROUP);

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
			STATS_VIEWED_GROUP,
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

	it('passes month_filter to both calls when monthFilter is supplied', async () => {
		const { rpcCalls } = makeStatsClient({
			aggregateRows: [makeAggregateRow()],
			biometricsRows: [makeBiometricsRow()]
		});

		await getSpeciesStats(
			STATS_SPECIES_NAME,
			STATS_VIEWED_GROUP,
			undefined,
			undefined,
			1
		);

		expect(rpcCalls).toHaveLength(2);
		for (const call of rpcCalls) {
			expect(call.args).toMatchObject({ month_filter: 1 });
		}
	});

	it('omits month_filter from both calls when no monthFilter is supplied', async () => {
		const { rpcCalls } = makeStatsClient({
			aggregateRows: [makeAggregateRow()],
			biometricsRows: [makeBiometricsRow()]
		});

		await getSpeciesStats(STATS_SPECIES_NAME, STATS_VIEWED_GROUP);

		expect(rpcCalls).toHaveLength(2);
		for (const call of rpcCalls) {
			expect(call.args).not.toHaveProperty('month_filter');
		}
	});

	it('still returns a valid speciesStats row when core_stats happens to already omit the wing/weight columns', async () => {
		makeStatsClient({
			aggregateRows: [omitBiometricsFields(makeAggregateRow())],
			biometricsRows: [makeBiometricsRow({ min_weight: 12, max_wing: 88 })]
		});

		const result = await getSpeciesStats(
			STATS_SPECIES_NAME,
			STATS_VIEWED_GROUP
		);

		expect(result[0].min_weight).toBe(12);
		expect(result[0].max_wing).toBe(88);
		expect(result[0].bird_count).toBe(
			(speciesStats as CoreStatsResult).bird_count
		);
	});
});
