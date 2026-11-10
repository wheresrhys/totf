import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { getCellTextByHeading } from '@/app/__tests__/helpers/table';
import { compareSpeciesBiometricsTab } from '@/app/components/pages/compare-species/CompareSpeciesBiometricsTab';
import { compareSpeciesCoreTab } from '@/app/components/pages/compare-species/CompareSpeciesCoreTab';
import {
	BiometricStatNames,
	type BiometricStatName
} from '@/modules/stats/browser';
import Page, { type CompareSpeciesSearchParams } from '../page';
import { ALPHA_CORE_STATS_BY_SPECIES } from '@/app/__tests__/helpers/core-stats-fixtures';

const { mockFetchSpeciesComparisonStats } = vi.hoisted(() => ({
	mockFetchSpeciesComparisonStats: vi.fn()
}));

vi.mock('@/app/actions/compare-species', () => ({
	fetchSpeciesComparisonStats: mockFetchSpeciesComparisonStats
}));

// Alpha's captured all-time by-species cache rows — one row per species,
// each already carrying both metric families' columns, which is exactly what
// `fetchSpeciesComparisonStats` now returns (#1412). Both tabs read these same
// rows.
const speciesStatsRows = ALPHA_CORE_STATS_BY_SPECIES;

const ALPHA_SPECIES = speciesStatsRows.map((row) => row.species_name);

const robinRow = speciesStatsRows.find((row) => row.species_name === 'Robin')!;

/**
 * The real "no biometric-eligible encounters" shape: a cache row present for
 * the species, with all 8 wing/weight columns null. Withholding the row
 * entirely isn't an option any more — that would drop the species from both
 * tabs *and* from the pill list.
 */
const NO_BIOMETRIC_MEASUREMENTS = Object.fromEntries(
	BiometricStatNames.map((name) => [name, null] as const)
) as Record<BiometricStatName, null>;

function mockStats(rows: unknown[] = speciesStatsRows) {
	mockFetchSpeciesComparisonStats.mockResolvedValue(rows);
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

/** The active table's column headings, left to right. */
function visibleColumnHeadings() {
	return [...visibleTable().querySelectorAll('thead tr:first-child th')].map(
		(heading) => heading.textContent?.trim()
	);
}

function showBiometricsTab() {
	fireEvent.click(screen.getByRole('button', { name: 'Biometrics' }));
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
			mockStats([]);

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
			expect(
				screen.queryByRole('columnheader', { name: 'Avg weight (g)' })
			).toBe(null);
			expect(getCellTextByHeading('Encounters', 'Robin')).toBe(
				String(robinRow.encounter_count)
			);
		});

		it('shows the biometrics columns when the Biometrics tab is selected', async () => {
			await renderComparePage({ name: ['Robin'] });

			showBiometricsTab();

			expect(
				screen.getByRole('columnheader', { name: 'Avg weight (g)' })
			).toBeTruthy();
			expect(screen.queryByRole('columnheader', { name: 'Encounters' })).toBe(
				null
			);
		});

		it('renders the core dataset column headings in their existing order', async () => {
			await renderComparePage({ name: ['Robin'] });

			expect(visibleColumnHeadings()).toEqual([
				'Species',
				'Sessions',
				'Birds',
				'Encounters',
				'New',
				'Busiest session',
				'Most new in a session',
				'Pulli',
				'Juv',
				'Postjuv',
				'Adult',
				'Not aged',
				'Pulli encounters',
				'Juv encounters',
				'Postjuv encounters',
				'Adult encounters',
				'Not aged encounters'
			]);
		});

		it('renders the biometrics dataset column headings in their existing order', async () => {
			await renderComparePage({ name: ['Robin'] });

			showBiometricsTab();

			expect(visibleColumnHeadings()).toEqual([
				'Species',
				'Min weight (g)',
				'Avg weight (g)',
				'Median weight (g)',
				'Max weight (g)',
				'Min wing (mm)',
				'Avg wing (mm)',
				'Median wing (mm)',
				'Max wing (mm)'
			]);
		});

		it('reads both tabs cells off the same row', async () => {
			await renderComparePage({ name: ['Robin'] });

			expect(getCellTextByHeading('Encounters', 'Robin')).toBe(
				String(robinRow.encounter_count)
			);

			showBiometricsTab();

			expect(getCellTextByHeading('Avg weight (g)', 'Robin')).toBe(
				String(Number(robinRow.avg_weight!.toFixed(1)))
			);
		});

		it('keeps the selected species when switching dataset', async () => {
			await renderComparePage({ name: ['Robin', 'Wren'] });

			showBiometricsTab();

			expect(dataRowCount()).toBe(2);
		});

		it('renders an em dash where a species has no biometric measurements', async () => {
			mockStats(
				speciesStatsRows.map((row) =>
					row.species_name === 'Robin'
						? { ...row, ...NO_BIOMETRIC_MEASUREMENTS }
						: row
				)
			);
			await renderComparePage({ name: ['Robin', 'Wren'] });

			showBiometricsTab();

			expect(dataRowCount()).toBe(2);
			expect(getCellTextByHeading('Avg weight (g)', 'Robin')).toBe('—');
			expect(getCellTextByHeading('Avg weight (g)', 'Wren')).toBe(
				String(
					Number(
						speciesStatsRows
							.find((row) => row.species_name === 'Wren')!
							.avg_weight!.toFixed(1)
					)
				)
			);
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
				String(robinRow.encounter_count)
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
