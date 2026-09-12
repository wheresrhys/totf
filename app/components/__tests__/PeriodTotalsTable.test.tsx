import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { PeriodTotalsTable } from '../PeriodTotalsTable';
import type { AggregateStatsResult } from '@/app/models/db';
import {
	getCellByHeading,
	getCellTextByHeading
} from '@/app/__tests__/helpers/table';

// The real header <th>s live in the `<thead>` row without a `data-testid` —
// `above-header-row` (the "Aggregate by" toggle row) and `totals-row` are
// the other two possible `<thead>` rows, both explicitly testid'd, so this
// excludes them rather than relying on the header row's fixed position.
function getColumnHeaders(): HTMLTableCellElement[] {
	const headerRow = Array.from(document.querySelectorAll('thead tr')).find(
		(row) => !row.hasAttribute('data-testid')
	);
	return Array.from(
		headerRow?.querySelectorAll('th') ?? []
	) as HTMLTableCellElement[];
}

function buildStat(
	overrides: Partial<AggregateStatsResult> = {}
): AggregateStatsResult {
	return {
		species_name: null,
		time_period: '2026-01-01',
		session_count: 4,
		total_effort: '18:00:00',
		effort_per_session: '02:00:00',
		effort_per_encounter: '02:34:17',
		avg_encounters_per_session: 1.75,
		max_per_session: 3,
		species_count: 12,
		bird_count: 40,
		encounter_count: 55,
		new_bird_count: 30,
		max_new_per_session: 3,
		max_weight: 13.1,
		avg_weight: 11.2,
		min_weight: 9.8,
		median_weight: 10.8,
		max_wing: 68,
		avg_wing: 66.6,
		min_wing: 65,
		median_wing: 67,
		pullus_bird_count: 2,
		juv_bird_count: 5,
		postjuv_bird_count: 3,
		adult_bird_count: 15,
		unknown_age_bird_count: 5,
		...overrides
	} as unknown as AggregateStatsResult;
}

describe('PeriodTotalsTable', () => {
	afterEach(() => {
		cleanup();
	});

	describe('Usual', () => {
		it('renders one row per input stat, in the correct column order, using the caller-supplied header', () => {
			const rows = [
				buildStat({ time_period: '2026-01-01' }),
				buildStat({ time_period: '2025-01-01', species_count: 3 })
			];
			render(
				<PeriodTotalsTable
					timeInterval="year"
					rows={rows}
					firstColumnHeader="Year"
					buildHref={(timePeriod) => `/summary/${timePeriod.slice(0, 4)}`}
				/>
			);

			const headers = getColumnHeaders();
			expect(headers.map((header) => header.textContent)).toEqual([
				'Year',
				'Sessions',
				'Species',
				'Encounters',
				'Birds',
				'New',
				'Retrap',
				'Pulli',
				'Juv',
				'Postjuv',
				'Adult',
				'Not aged'
			]);

			expect(document.querySelectorAll('tbody tr').length).toBe(rows.length);
		});

		it('renders the first column via formatPeriodTotalsLabel and the caller-supplied buildHref', () => {
			render(
				<PeriodTotalsTable
					timeInterval="year"
					rows={[buildStat({ time_period: '2026-01-01' })]}
					firstColumnHeader="Year"
					buildHref={(timePeriod) => `/summary/${timePeriod.slice(0, 4)}`}
				/>
			);
			const link = screen.getByRole('link', { name: '2026' });
			expect(link.getAttribute('href')).toBe('/summary/2026');
		});
	});

	describe('Structure', () => {
		it('renders a "month" timeInterval label via formatPeriodTotalsLabel', () => {
			render(
				<PeriodTotalsTable
					timeInterval="month"
					rows={[buildStat({ time_period: '2026-08-01' })]}
					firstColumnHeader="Month"
					buildHref={(timePeriod) => `/summary/2026/${timePeriod}`}
				/>
			);
			expect(
				screen.getByRole('link', { name: 'August 2026' }).textContent?.trim()
			).toBe('August 2026');
		});

		it('renders the caller-supplied buildLabel instead of formatPeriodTotalsLabel when provided', () => {
			render(
				<PeriodTotalsTable
					timeInterval="month"
					rows={[buildStat({ time_period: '2026-01-01' })]}
					firstColumnHeader="Month"
					buildHref={(timePeriod) => `/summary/2026/${timePeriod}`}
					buildLabel={() => 'Custom Label'}
				/>
			);
			expect(
				screen.getByRole('link', { name: 'Custom Label' }).textContent?.trim()
			).toBe('Custom Label');
		});

		it('renders a "day" timeInterval label via formatPeriodTotalsLabel', () => {
			render(
				<PeriodTotalsTable
					timeInterval="day"
					rows={[buildStat({ time_period: '2026-08-16' })]}
					firstColumnHeader="Session"
					buildHref={(timePeriod) => `/session/${timePeriod}`}
				/>
			);
			expect(
				screen
					.getByRole('link', { name: '16th August 2026' })
					.textContent?.trim()
			).toBe('16th August 2026');
		});
	});

	describe('Edge', () => {
		it('renders without crashing and shows no data rows when rows is empty', () => {
			render(
				<PeriodTotalsTable
					timeInterval="year"
					rows={[]}
					firstColumnHeader="Year"
					buildHref={() => '/summary'}
				/>
			);
			expect(document.querySelectorAll('tbody tr').length).toBe(0);
			expect(document.querySelectorAll('table').length).toBe(0);
		});

		it('renders zero-session/zero-effort rows as "0" for both columns', () => {
			render(
				<PeriodTotalsTable
					timeInterval="year"
					rows={[
						buildStat({
							time_period: '2026-01-01',
							session_count: 0,
							total_effort: '00:00:00'
						})
					]}
					firstColumnHeader="Year"
					buildHref={() => '/summary/2026'}
				/>
			);
			expect(getCellTextByHeading('Sessions', 0)).toBe('0');
		});
	});

	describe('totals row', () => {
		const rows = [
			buildStat({ time_period: '2026-01-01', session_count: 4 }),
			buildStat({ time_period: '2025-01-01', session_count: 3 })
		];
		const totalsStats = buildStat({
			time_period: '2026-01-01',
			session_count: 7,
			total_effort: '36:00:00',
			species_count: 15,
			bird_count: 80,
			encounter_count: 110,
			new_bird_count: 60,
			pullus_bird_count: 4,
			juv_bird_count: 10,
			postjuv_bird_count: 6,
			adult_bird_count: 30,
			unknown_age_bird_count: 10
		});

		it('renders a "Total" row for the "year" timeInterval when totalsStats is supplied', () => {
			render(
				<PeriodTotalsTable
					timeInterval="year"
					rows={rows}
					firstColumnHeader="Year"
					buildHref={(timePeriod) => `/summary/${timePeriod.slice(0, 4)}`}
					totalsStats={totalsStats}
				/>
			);
			const totalsRow = screen.getByTestId('totals-row');
			expect(getCellTextByHeading('Year', totalsRow)).toBe('Total');
			expect(getCellTextByHeading('Sessions', totalsRow)).toBe('7');
		});

		it('renders a "Total" row for the "month" timeInterval when totalsStats is supplied', () => {
			render(
				<PeriodTotalsTable
					timeInterval="month"
					rows={[buildStat({ time_period: '2026-08-01' })]}
					firstColumnHeader="Month"
					buildHref={(timePeriod) => `/summary/2026/${timePeriod}`}
					totalsStats={totalsStats}
				/>
			);
			expect(screen.getByTestId('totals-row').textContent).toContain('Total');
		});

		it('renders no totals row when totalsStats is omitted', () => {
			render(
				<PeriodTotalsTable
					timeInterval="year"
					rows={rows}
					firstColumnHeader="Year"
					buildHref={(timePeriod) => `/summary/${timePeriod.slice(0, 4)}`}
				/>
			);
			expect(screen.queryByTestId('totals-row')).toBeNull();
		});

		it('renders no totals row when rows is empty, even if totalsStats is supplied', () => {
			render(
				<PeriodTotalsTable
					timeInterval="year"
					rows={[]}
					firstColumnHeader="Year"
					buildHref={() => '/summary'}
					totalsStats={totalsStats}
				/>
			);
			expect(screen.queryByTestId('totals-row')).toBeNull();
			expect(document.querySelectorAll('table').length).toBe(0);
		});
	});

	describe('Sessions column', () => {
		it('renders session_count and formatted total_effort for each timeInterval', () => {
			render(
				<PeriodTotalsTable
					timeInterval="month"
					rows={[
						buildStat({
							time_period: '2026-08-01',
							session_count: 4,
							total_effort: '18:00:00'
						})
					]}
					firstColumnHeader="Month"
					buildHref={(timePeriod) => `/summary/2026/${timePeriod}`}
				/>
			);
			expect(getCellTextByHeading('Sessions', 0)).toBe('4');
		});
	});

	describe('fixed aggregation / encounters-only placeholder', () => {
		function encStat(overrides: Partial<AggregateStatsResult> = {}) {
			return buildStat({
				time_period: '2000-01-01',
				bird_count: 40,
				encounter_count: 55,
				new_bird_count: 30,
				pullus_bird_count: 2,
				juv_bird_count: 5,
				postjuv_bird_count: 3,
				adult_bird_count: 15,
				unknown_age_bird_count: 5,
				...({
					pullus_enc_count: 9,
					juv_enc_count: 8,
					postjuv_enc_count: 7,
					adult_enc_count: 6,
					unknown_age_enc_count: 4
				} as Partial<AggregateStatsResult>),
				...overrides
			});
		}

		describe('Usual', () => {
			it('still shows the AggregateByToggle, disabled and pre-set to Encounter, when a fixed aggregation is supplied', () => {
				render(
					<PeriodTotalsTable
						timeInterval="month"
						rows={[encStat()]}
						firstColumnHeader="Month"
						buildHref={() => ''}
						buildLabel={() => 'January'}
						aggregationFixedTo="encounter"
					/>
				);
				const encounter = screen.getByRole('radio', {
					name: 'Encounter'
				}) as HTMLInputElement;
				const bird = screen.getByRole('radio', {
					name: 'Bird'
				}) as HTMLInputElement;
				expect(encounter.checked).toBe(true);
				expect(encounter.disabled).toBe(true);
				expect(bird.checked).toBe(false);
				expect(bird.disabled).toBe(true);
			});

			it("renders encounter-derived age-bucket values when fixed aggregation is 'encounter'", () => {
				render(
					<PeriodTotalsTable
						timeInterval="month"
						rows={[encStat()]}
						firstColumnHeader="Month"
						buildHref={() => ''}
						buildLabel={() => 'January'}
						aggregationFixedTo="encounter"
					/>
				);
				// retraps (enc 55 - new 30 = 25), then the encounter-derived
				// age-bucket columns.
				expect(getCellTextByHeading('Retrap', 0)).toBe('25');
				expect(getCellTextByHeading('Pulli', 0)).toBe('9');
				expect(getCellTextByHeading('Juv', 0)).toBe('8');
				expect(getCellTextByHeading('Postjuv', 0)).toBe('7');
				expect(getCellTextByHeading('Adult', 0)).toBe('6');
				expect(getCellTextByHeading('Not aged', 0)).toBe('4');
			});
		});

		describe('Edge', () => {
			it("renders '-' in every row's Individuals column when the placeholder option is set, regardless of underlying bird_count", () => {
				render(
					<PeriodTotalsTable
						timeInterval="month"
						rows={[
							encStat({ time_period: '2000-01-01', bird_count: 40 }),
							encStat({ time_period: '2000-02-01', bird_count: 7 })
						]}
						firstColumnHeader="Month"
						buildHref={() => ''}
						buildLabel={(tp) => tp}
						aggregationFixedTo="encounter"
						dashIndividuals
					/>
				);
				const table = screen.getByRole('table');
				table.querySelectorAll('tbody tr').forEach((_, rowIndex) => {
					expect(getCellTextByHeading(table, 'Birds', rowIndex)).toBe('-');
				});
			});

			it("renders the totals row's Individuals cell as '-' too", () => {
				render(
					<PeriodTotalsTable
						timeInterval="month"
						rows={[encStat()]}
						firstColumnHeader="Month"
						buildHref={() => ''}
						buildLabel={() => 'January'}
						aggregationFixedTo="encounter"
						dashIndividuals
						totalsStats={encStat({ bird_count: 123 })}
					/>
				);
				const totalsRow = screen.getByTestId('totals-row');
				expect(getCellTextByHeading('Birds', totalsRow)).toBe('-');
			});

			it('renders the first column as plain text, not a link, when no href is available for a row', () => {
				render(
					<PeriodTotalsTable
						timeInterval="month"
						rows={[encStat()]}
						firstColumnHeader="Month"
						buildHref={() => ''}
						buildLabel={() => 'January'}
						aggregationFixedTo="encounter"
						dashIndividuals
					/>
				);
				expect(screen.queryByRole('link', { name: 'January' })).toBeNull();
				const firstCell = getCellByHeading('Month', 0);
				expect(firstCell.textContent).toBe('January');
				expect(firstCell.querySelector('a')).toBeNull();
			});
		});
	});

	describe('Aggregate by toggle', () => {
		const groupings: {
			timeInterval: 'year' | 'month';
			header: string;
		}[] = [
			{ timeInterval: 'year', header: 'Year' },
			{ timeInterval: 'month', header: 'Month' }
		];

		it('has no toggle for "day" timeInterval', () => {
			render(
				<PeriodTotalsTable
					timeInterval="day"
					rows={[buildStat()]}
					firstColumnHeader="Session"
					buildHref={() => ''}
				/>
			);
			expect(screen.queryByRole('radio', { name: 'Bird' })).toBeNull();
			expect(screen.queryByRole('radio', { name: 'Encounter' })).toBeNull();
		});

		groupings.forEach(({ timeInterval, header }) => {
			it(`defaults to bird-based counts and switches to encounter-based counts for the standard-block columns, for the "${timeInterval}" timeInterval`, () => {
				const stat = buildStat({
					time_period: '2026-01-01',
					bird_count: 10,
					encounter_count: 14,
					new_bird_count: 6,
					pullus_bird_count: 2,
					juv_bird_count: 1,
					postjuv_bird_count: 1,
					adult_bird_count: 3,
					unknown_age_bird_count: 0,
					// `*_enc_count` columns — see #602. `pullus_enc_count` deliberately
					// differs from `pullus_bird_count` so the toggle's effect is visible.
					...({
						pullus_enc_count: 3,
						juv_enc_count: 2,
						postjuv_enc_count: 2,
						adult_enc_count: 4,
						unknown_age_enc_count: 1
					} as Partial<AggregateStatsResult>)
				});

				render(
					<PeriodTotalsTable
						timeInterval={timeInterval}
						rows={[stat]}
						firstColumnHeader={header}
						buildHref={() => '/summary'}
					/>
				);

				const cell = (heading: string) => getCellTextByHeading(heading, 0);

				expect(cell('Species')).toBe(String(stat.species_count));
				expect(cell('Encounters')).toBe(String(stat.encounter_count));
				expect(cell('Birds')).toBe(String(stat.bird_count));
				expect(cell('New')).toBe('6'); // unaffected by toggle
				expect(cell('Retrap')).toBe('4'); // bird_count - new
				expect(cell('Pulli')).toBe('2'); // pullus_bird_count
				expect(cell('Juv')).toBe('1'); // juv_bird_count
				expect(cell('Postjuv')).toBe('1'); // postjuv_bird_count
				expect(cell('Adult')).toBe('3'); // adult_bird_count
				expect(cell('Not aged')).toBe('0'); // unknown_age_bird_count

				fireEvent.click(screen.getByRole('radio', { name: 'Encounter' }));

				// Unaffected columns stay the same after switching.
				expect(cell('Species')).toBe(String(stat.species_count));
				expect(cell('Encounters')).toBe(String(stat.encounter_count));
				expect(cell('Birds')).toBe(String(stat.bird_count));
				expect(cell('New')).toBe('6'); // still unaffected
				expect(cell('Retrap')).toBe('8'); // encounter_count - new
				expect(cell('Pulli')).toBe('3'); // pullus_enc_count
				expect(cell('Juv')).toBe('2'); // juv_enc_count
				expect(cell('Postjuv')).toBe('2'); // postjuv_enc_count
				expect(cell('Adult')).toBe('4'); // adult_enc_count
				expect(cell('Not aged')).toBe('1'); // unknown_age_enc_count
			});
		});
	});
});
