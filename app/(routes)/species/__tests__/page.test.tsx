import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import Page from '../page';
import alphaSpeciesSnapshot from '@/test-fixtures/snapshots/core_stats/alpha.by-species.json';
import betaSpeciesSnapshot from '@/test-fixtures/snapshots/core_stats/beta.by-species.json';
import gammaSpeciesSnapshot from '@/test-fixtures/snapshots/core_stats/gamma.by-species.json';

const { mockFetchAuthorisedCoreStats, mockFetchSpeciesDataWithAccessLevel } =
	vi.hoisted(() => ({
		mockFetchAuthorisedCoreStats: vi.fn(),
		mockFetchSpeciesDataWithAccessLevel: vi.fn()
	}));

vi.mock('@/app/lib/auth/group-summary-access', () => ({
	fetchAuthorisedCoreStats: mockFetchAuthorisedCoreStats
}));

vi.mock('@/app/actions/spp-data', () => ({
	fetchSpeciesDataWithAccessLevel: mockFetchSpeciesDataWithAccessLevel
}));

// Defaults every test to the 'own' access level (full controls visible)
// unless a test overrides it directly — matching the pre-#1232 behaviour
// these tests were originally written against.
function mockSpeciesData(
	rows: unknown[],
	accessLevel: 'own' | 'shared' | 'public' | 'blocked' = 'own'
) {
	mockFetchSpeciesDataWithAccessLevel.mockResolvedValue({ accessLevel, rows });
}

// `fetchYears` reads the `SimpleStatsCache` year grain through
// `fetchAuthorisedCoreStats`, so a year is represented by one cache cell —
// `sessionCount: 0` standing for a dense-spine gap year the group never rang in.
function mockYearCells(cells: { year: number; sessionCount?: number }[]) {
	mockFetchAuthorisedCoreStats.mockResolvedValue({
		accessLevel: 'own',
		rows: cells.map(({ year, sessionCount = 1 }) => ({
			time_period: `${year}-01-01`,
			session_count: sessionCount
		}))
	});
}

describe('species list page', () => {
	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	describe('with full data (alpha fixture)', () => {
		beforeEach(() => {
			mockSpeciesData(alphaSpeciesSnapshot as unknown[]);
			mockYearCells([{ year: 2022 }, { year: 2023 }]);
		});

		it('renders species rows in table', async () => {
			render(await Page());
			const table = await screen.findByRole('table');
			const rows = table.querySelectorAll('tbody tr');
			expect(rows.length).toBe(alphaSpeciesSnapshot.length);
		});

		it('renders year filter options newest-first', async () => {
			render(await Page());
			const yearSelect = await screen.findByLabelText('Year');
			const options = yearSelect.querySelectorAll('option');
			expect(options[1].value).toBe('2023');
			expect(options[2].value).toBe('2022');
		});
	});

	describe('year list sourced from the stats cache', () => {
		beforeEach(() => {
			mockSpeciesData(alphaSpeciesSnapshot as unknown[]);
		});

		it('reads the year grain, letting the access model pick the client', async () => {
			mockYearCells([{ year: 2023 }]);
			render(await Page());
			await screen.findByRole('table');

			expect(mockFetchAuthorisedCoreStats).toHaveBeenCalledWith(
				{ id: 1, slug: expect.anything() },
				{ group_by_time_period: 'year' }
			);
		});

		it('omits a dense-spine gap year the group never rang in', async () => {
			mockYearCells([
				{ year: 2021 },
				{ year: 2022, sessionCount: 0 },
				{ year: 2023 }
			]);
			render(await Page());
			const yearSelect = await screen.findByLabelText('Year');

			expect(
				[...yearSelect.querySelectorAll('option')].map((option) => option.value)
			).toEqual(['', '2023', '2021']);
		});
	});

	describe('with sparse data (beta fixture)', () => {
		beforeEach(() => {
			mockSpeciesData(betaSpeciesSnapshot as unknown[]);
			mockYearCells([{ year: 2023 }]);
		});

		it('renders fewer species rows', async () => {
			render(await Page());
			const table = await screen.findByRole('table');
			const rows = table.querySelectorAll('tbody tr');
			expect(rows.length).toBe(betaSpeciesSnapshot.length);
			expect(rows.length).toBeLessThan(alphaSpeciesSnapshot.length);
		});
	});

	describe('with no data (gamma fixture)', () => {
		beforeEach(() => {
			mockSpeciesData(gammaSpeciesSnapshot as unknown[]);
			mockYearCells([]);
		});

		it('renders empty table', async () => {
			render(await Page());
			const table = await screen.findByRole('table');
			const rows = table.querySelectorAll('tbody tr');
			expect(rows.length).toBe(0);
		});
	});

	// Per-accessLevel rendering of the CES-only checkbox / date inputs is
	// unit-tested directly against SppStatsTable
	// (components/pages/species/__tests__/SppStatsTable.test.tsx) — this just
	// confirms the real `fetchSpeciesListPageContent` threads the accessLevel
	// `fetchSpeciesDataWithAccessLevel` resolves all the way through to the
	// rendered page rather than discarding it (#1232).
	describe('accessLevel threading to the rendered controls', () => {
		it("hides the CES only checkbox for a 'public' access level", async () => {
			mockSpeciesData(alphaSpeciesSnapshot as unknown[], 'public');
			mockYearCells([{ year: 2023 }]);
			render(await Page());
			await screen.findByRole('table');
			expect(screen.queryByLabelText('CES only')).toBeNull();
		});
	});
});
