import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import Page from '../page';
import alphaSpeciesSnapshot from '@/test-fixtures/snapshots/core_stats/alpha.by-species.json';
import betaSpeciesSnapshot from '@/test-fixtures/snapshots/core_stats/beta.by-species.json';
import gammaSpeciesSnapshot from '@/test-fixtures/snapshots/core_stats/gamma.by-species.json';

const { mockGetAuthenticatedSupabaseClient, mockFetchSpeciesData } = vi.hoisted(
	() => ({
		mockGetAuthenticatedSupabaseClient: vi.fn(),
		mockFetchSpeciesData: vi.fn()
	})
);

vi.mock('@/app/lib/auth/group-auth', () => ({
	getAuthenticatedSupabaseClient: mockGetAuthenticatedSupabaseClient
}));

vi.mock('@/app/actions/spp-data', () => ({
	fetchSpeciesData: mockFetchSpeciesData
}));

function makeYearsClient(years: number[]) {
	const dates = years.map((y) => ({ visit_date: `${y}-06-01` }));
	const thenable = {
		then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
			Promise.resolve({ data: dates, error: null }).then(resolve)
	};
	const chain = {
		select: vi.fn().mockReturnThis(),
		eq: vi.fn().mockReturnThis(),
		order: vi.fn().mockReturnThis(),
		...thenable
	};
	return { from: vi.fn().mockReturnValue(chain) };
}

describe('species list page', () => {
	afterEach(() => {
		cleanup();
	});

	describe('with full data (alpha fixture)', () => {
		beforeEach(() => {
			mockFetchSpeciesData.mockResolvedValue(alphaSpeciesSnapshot as unknown[]);
			mockGetAuthenticatedSupabaseClient.mockResolvedValue(
				makeYearsClient([2023, 2022])
			);
		});

		it('renders species rows in table', async () => {
			render(await Page());
			const table = await screen.findByRole('table');
			const rows = table.querySelectorAll('tbody tr');
			expect(rows.length).toBe(alphaSpeciesSnapshot.length);
		});

		it('renders year filter options matching fetched years', async () => {
			render(await Page());
			const yearSelect = await screen.findByLabelText('Year');
			const options = yearSelect.querySelectorAll('option');
			expect(options[1].value).toBe('2023');
			expect(options[2].value).toBe('2022');
		});
	});

	describe('species list page filtering', () => {
		beforeEach(() => {
			mockFetchSpeciesData.mockResolvedValue(alphaSpeciesSnapshot as unknown[]);
			mockGetAuthenticatedSupabaseClient.mockResolvedValue(
				makeYearsClient([2023, 2022])
			);
		});

		describe('TemporalFilterControls integration', () => {
			it('selecting a year narrows the displayed species stats to that year', async () => {
				render(await Page({ searchParams: Promise.resolve({ year: '2022' }) }));
				await screen.findByRole('table');
				expect(mockFetchSpeciesData).toHaveBeenCalledWith(
					{ id: 1, slug: 'alpha' },
					'2022-01-01',
					'2022-12-31',
					undefined
				);
			});

			it('selecting a month narrows the displayed species stats to that month', async () => {
				render(await Page({ searchParams: Promise.resolve({ month: '5' }) }));
				await screen.findByRole('table');
				expect(mockFetchSpeciesData).toHaveBeenCalledWith(
					{ id: 1, slug: 'alpha' },
					undefined,
					undefined,
					5
				);
			});

			it('selecting an explicit date range narrows the displayed species stats to that range', async () => {
				render(
					await Page({
						searchParams: Promise.resolve({
							fromDate: '2022-03-01',
							toDate: '2022-03-31'
						})
					})
				);
				await screen.findByRole('table');
				expect(mockFetchSpeciesData).toHaveBeenCalledWith(
					{ id: 1, slug: 'alpha' },
					'2022-03-01',
					'2022-03-31',
					undefined
				);
			});
		});
	});

	describe('with sparse data (beta fixture)', () => {
		beforeEach(() => {
			mockFetchSpeciesData.mockResolvedValue(betaSpeciesSnapshot as unknown[]);
			mockGetAuthenticatedSupabaseClient.mockResolvedValue(
				makeYearsClient([2023])
			);
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
			mockFetchSpeciesData.mockResolvedValue(gammaSpeciesSnapshot as unknown[]);
			mockGetAuthenticatedSupabaseClient.mockResolvedValue(makeYearsClient([]));
		});

		it('renders empty table', async () => {
			render(await Page());
			const table = await screen.findByRole('table');
			const rows = table.querySelectorAll('tbody tr');
			expect(rows.length).toBe(0);
		});
	});
});
