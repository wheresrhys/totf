import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { BiometricsStatsResult, CoreStatsResult } from '@/app/models/db';
import { getCellTextByHeading } from '@/app/__tests__/helpers/table';
import { compareSpeciesBiometricsTab } from '@/app/components/pages/compare-species/CompareSpeciesBiometricsTab';
import { compareSpeciesCoreTab } from '@/app/components/pages/compare-species/CompareSpeciesCoreTab';
import Page, { type CompareSpeciesSearchParams } from '../page';
import alphaCoreBySpecies from '@/test-fixtures/snapshots/core_stats/alpha.by-species.json';
import alphaBiometricsBySpecies from '@/test-fixtures/snapshots/biometrics_stats/alpha.by-species.json';

const { mockFetchSpeciesComparisonStats } = vi.hoisted(() => ({
	mockFetchSpeciesComparisonStats: vi.fn()
}));

vi.mock('@/app/actions/compare-species', () => ({
	fetchSpeciesComparisonStats: mockFetchSpeciesComparisonStats
}));

// The by-species captures are ungrouped by time, so their `time_period` is
// literally null — CoreStatsResult strips that column non-null (app/models/db.ts),
// so a direct assertion doesn't compile (#895). BiometricsStatsResult leaves
// every column but species_name nullable, so it needs no such escape hatch.
// eslint-disable-next-line no-restricted-syntax -- see comment above
const coreStatsRows = alphaCoreBySpecies as unknown as CoreStatsResult[];
const biometricsRows = alphaBiometricsBySpecies as BiometricsStatsResult[];

// Alpha's captured by-species snapshots cover all seven species in both
// datasets, so the "dataset has no row for a selected species" case has to be
// built by withholding one — see the Biometrics describe below.
const ALPHA_SPECIES = coreStatsRows.map((row) => row.species_name);

function mockStats({
	biometricsStats = biometricsRows
}: { biometricsStats?: BiometricsStatsResult[] } = {}) {
	mockFetchSpeciesComparisonStats.mockResolvedValue({
		coreStats: coreStatsRows,
		biometricsStats
	});
}

async function renderComparePage(searchParams?: CompareSpeciesSearchParams) {
	render(
		await Page({
			searchParams: Promise.resolve(searchParams ?? {})
		})
	);
	// Settles the `BootstrapPage` mock's async params/data load before any
	// assertion runs.
	await screen.findByTestId('species-comparison-table');
}

function pill(speciesName: string) {
	return screen.getByRole('button', { name: speciesName });
}

// The active dataset's table. `TabSet` lazy-*mounts* rather than unmounts, so
// once a second tab has been visited both tables are in the DOM — but the
// inactive one sits inside `ConditionalTabPanel`'s `aria-hidden` wrapper, so a
// role query (unlike `getByTestId`) only ever sees the visible one.
function visibleTable() {
	return screen.getByRole('table');
}

function dataRowCount() {
	return visibleTable().querySelectorAll('tbody tr').length;
}

describe('compare species page', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockStats();
	});

	afterEach(() => {
		cleanup();
	});

	describe('the species picker', () => {
		it('renders a pill for every species the group has data for', async () => {
			await renderComparePage();

			const selector = screen.getByTestId('species-pill-selector');
			expect(
				[...selector.querySelectorAll('button')].map((button) =>
					button.textContent?.trim()
				)
			).toEqual([...ALPHA_SPECIES].sort((a, b) => a.localeCompare(b)));
		});

		it('leaves every pill unselected when the URL carries no name params', async () => {
			await renderComparePage();

			expect(screen.queryByRole('button', { pressed: true })).not.toBeTruthy();
		});

		it('marks the pills named in the URL as selected', async () => {
			await renderComparePage({ name: ['Robin', 'Wren'] });

			expect(pill('Robin').getAttribute('aria-pressed')).toBe('true');
			expect(pill('Wren').getAttribute('aria-pressed')).toBe('true');
			expect(pill('Blue Tit').getAttribute('aria-pressed')).toBe('false');
		});

		it('renders a message instead of pills when the group has no species at all', async () => {
			mockFetchSpeciesComparisonStats.mockResolvedValue({
				coreStats: [],
				biometricsStats: []
			});

			render(await Page({ searchParams: Promise.resolve({}) }));

			expect(await screen.findByTestId('no-species-message')).toBeTruthy();
			expect(screen.queryByTestId('species-pill-selector')).not.toBeTruthy();
		});
	});

	describe('the comparison table', () => {
		it('renders an empty table when nothing is selected', async () => {
			await renderComparePage();

			expect(dataRowCount()).toBe(0);
			expect(
				screen.getByRole('columnheader', { name: 'Species' })
			).toBeTruthy();
		});

		it('adds a row when a pill is tapped', async () => {
			await renderComparePage();

			fireEvent.click(pill('Robin'));

			expect(dataRowCount()).toBe(1);
			expect(getCellTextByHeading('Species', 0)).toBe('Robin');
		});

		it('adds a further row when a second pill is tapped', async () => {
			await renderComparePage();

			fireEvent.click(pill('Robin'));
			fireEvent.click(pill('Wren'));

			expect(dataRowCount()).toBe(2);
		});

		it('removes the row when a selected pill is tapped again', async () => {
			await renderComparePage({ name: ['Robin', 'Wren'] });

			fireEvent.click(pill('Robin'));

			expect(dataRowCount()).toBe(1);
			expect(getCellTextByHeading('Species', 0)).toBe('Wren');
		});

		it('preselects a row for each species named in the URL', async () => {
			await renderComparePage({ name: ['Wren', 'Robin'] });

			expect(dataRowCount()).toBe(2);
		});

		it('ignores a name param for a species the group has no data for', async () => {
			await renderComparePage({
				name: ['Robin', 'Andean Condor']
			});

			expect(dataRowCount()).toBe(1);
			expect(getCellTextByHeading('Species', 0)).toBe('Robin');
		});
	});

	describe('keeping the URL in step with the selection', () => {
		let replaceState: ReturnType<typeof vi.spyOn>;

		beforeEach(() => {
			replaceState = vi.spyOn(window.history, 'replaceState');
		});

		afterEach(() => {
			replaceState.mockRestore();
		});

		it('appends a name param when a species is added', async () => {
			await renderComparePage({ name: ['Robin'] });

			fireEvent.click(pill('Wren'));

			expect(replaceState).toHaveBeenCalledWith(
				null,
				'',
				'/?name=Robin&name=Wren'
			);
		});

		it('drops the query string entirely when the last species is removed', async () => {
			await renderComparePage({ name: ['Robin'] });

			fireEvent.click(pill('Robin'));

			expect(replaceState).toHaveBeenCalledWith(null, '', '/');
		});
	});

	describe('switching dataset', () => {
		it('shows the core stats columns by default', async () => {
			await renderComparePage({ name: ['Robin'] });

			expect(
				screen.getByRole('columnheader', { name: 'Encounters' })
			).toBeTruthy();
			expect(getCellTextByHeading('Encounters', 'Robin')).toBe(
				String(
					coreStatsRows.find((row) => row.species_name === 'Robin')
						?.encounter_count
				)
			);
		});

		it('shows the biometrics columns when the Biometrics tab is selected', async () => {
			await renderComparePage({ name: ['Robin'] });

			fireEvent.click(screen.getByRole('button', { name: 'Biometrics' }));

			expect(
				screen.getByRole('columnheader', { name: 'Avg weight (g)' })
			).toBeTruthy();
			expect(screen.queryByRole('columnheader', { name: 'Encounters' })).toBe(
				null
			);
		});

		it('keeps the selected species when switching dataset', async () => {
			await renderComparePage({ name: ['Robin', 'Wren'] });

			fireEvent.click(screen.getByRole('button', { name: 'Biometrics' }));

			expect(dataRowCount()).toBe(2);
		});

		it('renders blank cells for a selected species the dataset has no row for', async () => {
			mockStats({
				biometricsStats: biometricsRows.filter(
					(row) => row.species_name !== 'Robin'
				)
			});
			await renderComparePage({ name: ['Robin', 'Wren'] });

			fireEvent.click(screen.getByRole('button', { name: 'Biometrics' }));

			expect(dataRowCount()).toBe(2);
			expect(getCellTextByHeading('Avg weight (g)', 'Robin')).toBe('—');
		});
	});

	describe('?tabId= query param', () => {
		it('renders the core dataset tab active and loaded when no tabId is given', async () => {
			await renderComparePage({ name: ['Robin'] });

			expect(
				screen
					.getByRole('button', { name: 'Core stats' })
					.getAttribute('aria-current')
			).toBe('true');
			expect(
				screen.getByRole('columnheader', { name: 'Encounters' })
			).toBeTruthy();
		});

		it('focuses the Biometrics tab and renders its columns without a click', async () => {
			await renderComparePage({ name: ['Robin'], tabId: 'biometrics' });

			expect(
				screen
					.getByRole('button', { name: 'Biometrics' })
					.getAttribute('aria-current')
			).toBe('true');
			expect(
				screen.getByRole('columnheader', { name: 'Avg weight (g)' })
			).toBeTruthy();
			expect(screen.queryByRole('columnheader', { name: 'Encounters' })).toBe(
				null
			);
		});

		it('falls back to the core dataset for a tabId naming no real tab', async () => {
			await renderComparePage({ name: ['Robin'], tabId: 'not-a-real-tab' });

			expect(
				screen
					.getByRole('button', { name: 'Core stats' })
					.getAttribute('aria-current')
			).toBe('true');
			expect(dataRowCount()).toBe(1);
			expect(getCellTextByHeading('Encounters', 'Robin')).toBe(
				String(
					coreStatsRows.find((row) => row.species_name === 'Robin')
						?.encounter_count
				)
			);
		});
	});

	describe('compareSpeciesTabs', () => {
		it('declares both dataset tabs with no dataFetcher of their own', () => {
			expect(
				[compareSpeciesCoreTab, compareSpeciesBiometricsTab].map(
					({ id, dataFetcher }) => [id, dataFetcher]
				)
			).toEqual([
				['core', undefined],
				['biometrics', undefined]
			]);
		});
	});
});
