import '@/app/__tests__/helpers/mock-species-tab-components';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import Page, {
	getSpeciesStats,
	fetchSpeciesPageContentForPeriod
} from '../page';
import birdsSnapshot from '@/test-fixtures/snapshots/tables/Birds/robin-alpha.page-of-birds.json';
import {
	makeSpeciesClient,
	robinSpeciesStats as speciesStats
} from '@/app/__tests__/helpers/robin-species-page-fixtures';
import type { FullFatPageData } from '../PageContent';
import type { CoreStatsWithBiometrics } from '@/app/models/db';
import type { ViewedGroup } from '@/app/lib/group-slug';

const VIEWED_GROUP: ViewedGroup = { id: 1, slug: 'alpha' };

const {
	mockGetAuthenticatedSupabaseClient,
	mockFetchPageOfBirds,
	mockFetchSpeciesStatsCacheRows,
	mockFetchYearTotalsTabData,
	mockFetchMonthTotalsTabData,
	mockFetchSessionTotalsTabData,
	mockFetchCombinedMonthTotalsTabData,
	mockFetchSquashedMonthYearTotalsTabData
} = vi.hoisted(() => ({
	mockGetAuthenticatedSupabaseClient: vi.fn(),
	mockFetchPageOfBirds: vi.fn(),
	mockFetchSpeciesStatsCacheRows: vi.fn(),
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
	fetchSpeciesStatsCacheRows: mockFetchSpeciesStatsCacheRows,
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
			mockFetchSpeciesStatsCacheRows.mockResolvedValue([
				speciesStats as CoreStatsWithBiometrics
			]);
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

const STATS_SPECIES_NAME = 'Robin';
const STATS_GROUP_ID = 7;
const STATS_VIEWED_GROUP: ViewedGroup = { id: STATS_GROUP_ID, slug: 'alpha' };

describe('getSpeciesStats', () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it('reads the all-time cache row when no period is given', async () => {
		mockFetchSpeciesStatsCacheRows.mockResolvedValue([
			speciesStats as CoreStatsWithBiometrics
		]);

		const result = await getSpeciesStats(
			STATS_SPECIES_NAME,
			STATS_VIEWED_GROUP
		);

		expect(mockFetchSpeciesStatsCacheRows).toHaveBeenCalledWith({
			speciesName: STATS_SPECIES_NAME,
			viewedGroup: STATS_VIEWED_GROUP,
			temporalUnit: 'all-time',
			includeBiometrics: true
		});
		expect(result[0].bird_count).toBe(
			(speciesStats as CoreStatsWithBiometrics).bird_count
		);
	});

	it('reads the matching year-grain row for a whole-calendar-year range', async () => {
		mockFetchSpeciesStatsCacheRows.mockResolvedValue([
			speciesStats as CoreStatsWithBiometrics
		]);

		await getSpeciesStats(
			STATS_SPECIES_NAME,
			STATS_VIEWED_GROUP,
			'2023-01-01',
			'2023-12-31'
		);

		expect(mockFetchSpeciesStatsCacheRows).toHaveBeenCalledWith({
			speciesName: STATS_SPECIES_NAME,
			viewedGroup: STATS_VIEWED_GROUP,
			temporalUnit: 'year',
			fromDate: '2023-01-01',
			toDate: '2023-01-01',
			includeBiometrics: true
		});
	});

	it('reads the matching month-grain row for a whole-calendar-month range', async () => {
		mockFetchSpeciesStatsCacheRows.mockResolvedValue([
			speciesStats as CoreStatsWithBiometrics
		]);

		await getSpeciesStats(
			STATS_SPECIES_NAME,
			STATS_VIEWED_GROUP,
			'2023-08-01',
			'2023-08-31'
		);

		expect(mockFetchSpeciesStatsCacheRows).toHaveBeenCalledWith({
			speciesName: STATS_SPECIES_NAME,
			viewedGroup: STATS_VIEWED_GROUP,
			temporalUnit: 'month',
			fromDate: '2023-08-01',
			toDate: '2023-08-01',
			includeBiometrics: true
		});
	});

	it('reads the matching month-squashed row for a bare monthFilter', async () => {
		mockFetchSpeciesStatsCacheRows.mockResolvedValue([
			speciesStats as CoreStatsWithBiometrics
		]);

		await getSpeciesStats(
			STATS_SPECIES_NAME,
			STATS_VIEWED_GROUP,
			undefined,
			undefined,
			1
		);

		expect(mockFetchSpeciesStatsCacheRows).toHaveBeenCalledWith({
			speciesName: STATS_SPECIES_NAME,
			viewedGroup: STATS_VIEWED_GROUP,
			temporalUnit: 'month-squashed',
			fromDate: '2000-01-01',
			toDate: '2000-01-01',
			includeBiometrics: true
		});
	});

	it('returns an empty array when the cache has no matching row', async () => {
		mockFetchSpeciesStatsCacheRows.mockResolvedValue([]);

		const result = await getSpeciesStats(
			STATS_SPECIES_NAME,
			STATS_VIEWED_GROUP
		);

		expect(result).toEqual([]);
	});
});
