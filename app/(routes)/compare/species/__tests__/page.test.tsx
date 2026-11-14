import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { getCellTextByHeading } from '@/app/__tests__/helpers/table';
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

// Alpha's captured all-time by-species cache rows — one row per species.
const speciesStatsRows = ALPHA_CORE_STATS_BY_SPECIES;

const ALPHA_SPECIES = speciesStatsRows.map((row) => row.species_name);

const robinRow = speciesStatsRows.find((row) => row.species_name === 'Robin')!;
const wrenRow = speciesStatsRows.find((row) => row.species_name === 'Wren')!;

/**
 * The real "no biometric-eligible encounters" shape: a cache row present for
 * the species, with all 8 wing/weight columns null.
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

function visibleTable() {
	return screen.getByRole('table');
}

function dataRowCount() {
	return visibleTable().querySelectorAll('tbody tr').length;
}

/** The table's column headings, left to right. */
function columnHeadings() {
	return [...visibleTable().querySelectorAll('thead tr:first-child th')].map(
		(heading) => heading.textContent?.trim()
	);
}

function selectBiometricsColumns() {
	fireEvent.click(screen.getByRole('radio', { name: 'Biometrics' }));
}

function selectEncounterAggregation() {
	fireEvent.click(screen.getByRole('radio', { name: 'Encounter' }));
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

	describe('the Counts/Biometrics toggle', () => {
		it('shows the counts columns by default', async () => {
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

		it('renders the counts column headings in their existing order', async () => {
			await renderComparePage({ name: ['Robin'] });

			expect(columnHeadings()).toEqual([
				'Species',
				'Sessions',
				'Encounters',
				'Busiest session',
				'Birds',
				'New',
				'Retrap',
				'Pulli',
				'Juv',
				'Postjuv',
				'Adult',
				'Not aged'
			]);
		});

		it('shows the biometrics columns when the Biometrics option is selected', async () => {
			await renderComparePage({ name: ['Robin'] });

			selectBiometricsColumns();

			expect(
				screen.getByRole('columnheader', { name: 'Avg weight (g)' })
			).toBeTruthy();
			expect(screen.queryByRole('columnheader', { name: 'New' })).toBe(null);
		});

		it('renders the biometrics column headings in their existing order', async () => {
			await renderComparePage({ name: ['Robin'] });

			selectBiometricsColumns();

			expect(columnHeadings()).toEqual([
				'Species',
				'Sessions',
				'Encounters',
				'Max weight (g)',
				'Avg weight (g)',
				'Median weight (g)',
				'Min weight (g)',
				'Max wing (mm)',
				'Avg wing (mm)',
				'Median wing (mm)',
				'Min wing (mm)'
			]);
		});

		it('reads both views off the same row', async () => {
			await renderComparePage({ name: ['Robin'] });

			expect(getCellTextByHeading('Encounters', 'Robin')).toBe(
				String(robinRow.encounter_count)
			);

			selectBiometricsColumns();

			expect(getCellTextByHeading('Avg weight (g)', 'Robin')).toBe(
				String(Number(robinRow.avg_weight!.toFixed(1)))
			);
		});

		it('keeps the selected species when switching views', async () => {
			await renderComparePage({ name: ['Robin', 'Wren'] });

			selectBiometricsColumns();

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

			selectBiometricsColumns();

			expect(dataRowCount()).toBe(2);
			expect(getCellTextByHeading('Avg weight (g)', 'Robin')).toBe('—');
			expect(getCellTextByHeading('Avg weight (g)', 'Wren')).toBe(
				String(Number(wrenRow.avg_weight!.toFixed(1)))
			);
		});
	});

	describe('the Aggregate By toggle', () => {
		it('defaults to bird-based counts and re-renders the counts columns from encounter-based data when "Encounter" is selected', async () => {
			await renderComparePage({ name: ['Robin'] });

			expect(getCellTextByHeading('Adult', 'Robin')).toBe(
				String(robinRow.adult_bird_count)
			);

			selectEncounterAggregation();

			expect(getCellTextByHeading('Adult', 'Robin')).toBe(
				String(robinRow.adult_enc_count)
			);
		});

		it('disables the Aggregate By toggle while the Biometrics option is active', async () => {
			await renderComparePage({ name: ['Robin'] });

			selectBiometricsColumns();

			expect(screen.getByRole('radio', { name: 'Bird' })).toHaveProperty(
				'disabled',
				true
			);
			expect(screen.getByRole('radio', { name: 'Encounter' })).toHaveProperty(
				'disabled',
				true
			);
		});
	});
});
