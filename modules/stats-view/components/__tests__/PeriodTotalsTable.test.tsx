import { useState } from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { PeriodTotalsTable } from '../PeriodTotalsTable';
import { EmptyMonthsToggle } from '../../lib/EmptyMonthsToggle';
import { getCellTextByHeading } from '@/app/__tests__/helpers/table';
import { buildCoreStatsRow } from '@/app/__tests__/helpers/core-stats-fixtures';
import type { StatsCacheResult } from '@/modules/stats/browser';

function switchToBiometrics() {
	fireEvent.click(screen.getByRole('radio', { name: 'Biometrics' }));
}

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

describe('PeriodTotalsTable', () => {
	afterEach(() => {
		cleanup();
	});

	describe('Usual', () => {
		it('renders one row per input stat, in the correct column order, using the caller-supplied header', () => {
			const rows = [
				buildCoreStatsRow({ time_period: '2026-01-01' }),
				buildCoreStatsRow({ time_period: '2025-01-01', species_count: 3 })
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

			expect(document.querySelectorAll('tbody tr').length).toBe(rows.length);
		});

		it('renders the first column via formatPeriodTotalsLabel and the caller-supplied buildHref', () => {
			render(
				<PeriodTotalsTable
					timeInterval="year"
					rows={[buildCoreStatsRow({ time_period: '2026-01-01' })]}
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
					rows={[buildCoreStatsRow({ time_period: '2026-08-01' })]}
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
					rows={[buildCoreStatsRow({ time_period: '2026-01-01' })]}
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
					rows={[buildCoreStatsRow({ time_period: '2026-08-16' })]}
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

		it('renders a zero-session row as "0"', () => {
			render(
				<PeriodTotalsTable
					timeInterval="year"
					rows={[
						buildCoreStatsRow({
							time_period: '2026-01-01',
							session_count: 0
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
			buildCoreStatsRow({ time_period: '2026-01-01', session_count: 4 }),
			buildCoreStatsRow({ time_period: '2025-01-01', session_count: 3 })
		];
		const totalsStats = buildCoreStatsRow({
			time_period: '2026-01-01',
			session_count: 7,
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
					rows={[buildCoreStatsRow({ time_period: '2026-08-01' })]}
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
		it('renders session_count for each timeInterval', () => {
			render(
				<PeriodTotalsTable
					timeInterval="month"
					rows={[
						buildCoreStatsRow({
							time_period: '2026-08-01',
							session_count: 4
						})
					]}
					firstColumnHeader="Month"
					buildHref={(timePeriod) => `/summary/2026/${timePeriod}`}
				/>
			);
			expect(getCellTextByHeading('Sessions', 0)).toBe('4');
		});
	});

	describe('Busiest session column', () => {
		describe('Structure', () => {
			it('renders a "Busiest session" column header, positioned between "Encounters" and "Birds", when showBusiestSession is omitted/true', () => {
				render(
					<PeriodTotalsTable
						timeInterval="year"
						rows={[buildCoreStatsRow()]}
						firstColumnHeader="Year"
						buildHref={(timePeriod) => `/summary/${timePeriod.slice(0, 4)}`}
					/>
				);
				const headers = getColumnHeaders().map((header) => header.textContent);
				const encountersIndex = headers.indexOf('Encounters');
				const birdsIndex = headers.indexOf('Birds');
				expect(headers).toContain('Busiest session');
				expect(headers.indexOf('Busiest session')).toBe(encountersIndex + 1);
				expect(headers.indexOf('Busiest session')).toBe(birdsIndex - 1);
			});

			it('renders the correct max_per_session value in each data row\'s "Busiest session" cell', () => {
				render(
					<PeriodTotalsTable
						timeInterval="year"
						rows={[
							buildCoreStatsRow({
								time_period: '2026-01-01',
								max_per_session: 17
							})
						]}
						firstColumnHeader="Year"
						buildHref={(timePeriod) => `/summary/${timePeriod.slice(0, 4)}`}
					/>
				);
				expect(getCellTextByHeading('Busiest session', 0)).toBe('17');
			});

			it('renders the correct value in the pinned totals row\'s "Busiest session" cell, when a totals row is present', () => {
				render(
					<PeriodTotalsTable
						timeInterval="year"
						rows={[buildCoreStatsRow()]}
						firstColumnHeader="Year"
						buildHref={(timePeriod) => `/summary/${timePeriod.slice(0, 4)}`}
						totalsStats={buildCoreStatsRow({ max_per_session: 23 })}
					/>
				);
				const totalsRow = screen.getByTestId('totals-row');
				expect(getCellTextByHeading('Busiest session', totalsRow)).toBe('23');
			});
		});

		describe('Edge', () => {
			it('omits the "Busiest session" column entirely when showBusiestSession={false}', () => {
				render(
					<PeriodTotalsTable
						timeInterval="year"
						rows={[buildCoreStatsRow()]}
						firstColumnHeader="Year"
						buildHref={(timePeriod) => `/summary/${timePeriod.slice(0, 4)}`}
						showBusiestSession={false}
					/>
				);
				expect(
					getColumnHeaders().map((header) => header.textContent)
				).not.toContain('Busiest session');
				expect(screen.queryByText('Busiest session')).toBeNull();
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
					rows={[buildCoreStatsRow()]}
					firstColumnHeader="Session"
					buildHref={() => ''}
				/>
			);
			expect(screen.queryByRole('radio', { name: 'Bird' })).toBeNull();
			expect(screen.queryByRole('radio', { name: 'Encounter' })).toBeNull();
		});

		groupings.forEach(({ timeInterval, header }) => {
			it(`defaults to bird-based counts and switches to encounter-based counts for the standard-block columns, for the "${timeInterval}" timeInterval`, () => {
				const stat = buildCoreStatsRow({
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
					} as Partial<StatsCacheResult>)
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

	describe('breakdown column block', () => {
		const stat = buildCoreStatsRow({
			time_period: '2026-01-01',
			max_weight: 20.1,
			max_wing: 90
		});

		it('renders the counts breakdown columns by default', () => {
			render(
				<PeriodTotalsTable
					timeInterval="year"
					rows={[stat]}
					firstColumnHeader="Year"
					buildHref={(timePeriod) => `/summary/${timePeriod.slice(0, 4)}`}
					showBiometricsToggle
				/>
			);
			const headers = getColumnHeaders().map((header) => header.textContent);
			expect(headers).toEqual(
				expect.arrayContaining([
					'New',
					'Retrap',
					'Pulli',
					'Juv',
					'Postjuv',
					'Adult',
					'Not aged'
				])
			);
			expect(headers).not.toContain('Max weight (g)');
		});

		it('renders the biometric breakdown columns when CountsBiometricsToggle is switched to biometrics', () => {
			render(
				<PeriodTotalsTable
					timeInterval="year"
					rows={[stat]}
					firstColumnHeader="Year"
					buildHref={(timePeriod) => `/summary/${timePeriod.slice(0, 4)}`}
					showBiometricsToggle
				/>
			);
			switchToBiometrics();

			const headers = getColumnHeaders().map((header) => header.textContent);
			expect(headers).toEqual(
				expect.arrayContaining([
					'Max weight (g)',
					'Avg weight (g)',
					'Median weight (g)',
					'Min weight (g)',
					'Max wing (mm)',
					'Avg wing (mm)',
					'Median wing (mm)',
					'Min wing (mm)'
				])
			);
			expect(headers).not.toContain('New');
			expect(getCellTextByHeading('Max weight (g)', 0)).toBe('20.1');
			expect(getCellTextByHeading('Max wing (mm)', 0)).toBe('90');
		});

		it('always renders every column up to and including "Encounters" in both modes', () => {
			render(
				<PeriodTotalsTable
					timeInterval="year"
					rows={[stat]}
					firstColumnHeader="Year"
					buildHref={(timePeriod) => `/summary/${timePeriod.slice(0, 4)}`}
					showBiometricsToggle
				/>
			);
			const sharedHeaders = ['Year', 'Sessions', 'Species', 'Encounters'];
			expect(getColumnHeaders().map((header) => header.textContent)).toEqual(
				expect.arrayContaining(sharedHeaders)
			);

			switchToBiometrics();

			expect(getColumnHeaders().map((header) => header.textContent)).toEqual(
				expect.arrayContaining(sharedHeaders)
			);
		});

		// #1437: matching `SpeciesTotalsTable`'s equivalent behaviour — "Busiest
		// session" and "Birds" have no biometric equivalent, so biometrics mode
		// hides them entirely rather than leaving them dangling, regardless of
		// `showBusiestSession`'s own value.
		it('hides "Busiest session" and "Birds" once biometrics mode is switched on, and restores them when switched back to counts', () => {
			render(
				<PeriodTotalsTable
					timeInterval="year"
					rows={[stat]}
					firstColumnHeader="Year"
					buildHref={(timePeriod) => `/summary/${timePeriod.slice(0, 4)}`}
					showBiometricsToggle
				/>
			);
			expect(
				getColumnHeaders().map((header) => header.textContent)
			).toEqual(expect.arrayContaining(['Busiest session', 'Birds']));

			switchToBiometrics();

			const biometricsHeaders = getColumnHeaders().map(
				(header) => header.textContent
			);
			expect(biometricsHeaders).not.toContain('Busiest session');
			expect(biometricsHeaders).not.toContain('Birds');

			fireEvent.click(screen.getByRole('radio', { name: 'Counts' }));

			expect(
				getColumnHeaders().map((header) => header.textContent)
			).toEqual(expect.arrayContaining(['Busiest session', 'Birds']));
		});

		it('keeps "Busiest session" hidden in biometrics mode even when showBusiestSession is explicitly false', () => {
			render(
				<PeriodTotalsTable
					timeInterval="year"
					rows={[stat]}
					firstColumnHeader="Year"
					buildHref={(timePeriod) => `/summary/${timePeriod.slice(0, 4)}`}
					showBiometricsToggle
					showBusiestSession={false}
				/>
			);
			switchToBiometrics();
			expect(
				getColumnHeaders().map((header) => header.textContent)
			).not.toContain('Busiest session');
		});
	});

	describe('showBiometricsToggle prop', () => {
		// #1437: the Counts/Biometrics toggle only makes sense on the species
		// page's totals tabs — the summary pages have no biometrics breakdown
		// here — so it's opt-in via this prop, defaulting to false/hidden.
		it('does not render the toggle when showBiometricsToggle is omitted (defaults to false)', () => {
			render(
				<PeriodTotalsTable
					timeInterval="year"
					rows={[buildCoreStatsRow()]}
					firstColumnHeader="Year"
					buildHref={() => '/summary'}
				/>
			);
			expect(screen.queryByRole('radio', { name: 'Counts' })).toBeNull();
			expect(screen.queryByRole('radio', { name: 'Biometrics' })).toBeNull();
		});

		it('keeps the breakdown block fixed on the counts columns when showBiometricsToggle is omitted', () => {
			render(
				<PeriodTotalsTable
					timeInterval="year"
					rows={[buildCoreStatsRow({ time_period: '2026-01-01' })]}
					firstColumnHeader="Year"
					buildHref={() => '/summary'}
				/>
			);
			const headers = getColumnHeaders().map((header) => header.textContent);
			expect(headers).toContain('New');
			expect(headers).not.toContain('Max weight (g)');
		});

		it('renders the toggle on the Year totals tab (timeInterval: "year") when showBiometricsToggle is true', () => {
			render(
				<PeriodTotalsTable
					timeInterval="year"
					rows={[buildCoreStatsRow()]}
					firstColumnHeader="Year"
					buildHref={() => '/summary'}
					showBiometricsToggle
				/>
			);
			expect(screen.getByRole('radio', { name: 'Counts' })).toBeDefined();
			expect(screen.getByRole('radio', { name: 'Biometrics' })).toBeDefined();
		});

		it('renders the toggle on the Month totals tab (timeInterval: "month") when showBiometricsToggle is true', () => {
			render(
				<PeriodTotalsTable
					timeInterval="month"
					rows={[buildCoreStatsRow({ time_period: '2026-08-01' })]}
					firstColumnHeader="Month"
					buildHref={() => '/summary'}
					showBiometricsToggle
				/>
			);
			expect(screen.getByRole('radio', { name: 'Counts' })).toBeDefined();
			expect(screen.getByRole('radio', { name: 'Biometrics' })).toBeDefined();
		});

		it('renders the toggle on the Session totals tab (timeInterval: "day") when showBiometricsToggle is true, unlike AggregateByToggle which has no toggle there', () => {
			render(
				<PeriodTotalsTable
					timeInterval="day"
					rows={[buildCoreStatsRow()]}
					firstColumnHeader="Session"
					buildHref={() => ''}
					showBiometricsToggle
				/>
			);
			expect(screen.getByRole('radio', { name: 'Counts' })).toBeDefined();
			expect(screen.getByRole('radio', { name: 'Biometrics' })).toBeDefined();
			expect(screen.queryByRole('radio', { name: 'Bird' })).toBeNull();
			expect(screen.queryByRole('radio', { name: 'Encounter' })).toBeNull();
		});
	});

	describe('interaction with AggregateByToggle', () => {
		// Design decision (#1437, revising #1432): `AggregateByToggle` stays
		// visible but disabled while biometrics mode is active, matching
		// `SpeciesTotalsTable`'s pattern, rather than disappearing — its
		// bird/encounter distinction has no effect on the biometric columns
		// (they carry the same value either way), but hiding it entirely made
		// the toggle row jump around.
		it('disables AggregateByToggle once biometrics mode is switched on, and re-enables it when switched back to counts', () => {
			render(
				<PeriodTotalsTable
					timeInterval="year"
					rows={[buildCoreStatsRow()]}
					firstColumnHeader="Year"
					buildHref={() => '/summary'}
					showBiometricsToggle
				/>
			);
			expect(
				(screen.getByRole('radio', { name: 'Bird' }) as HTMLInputElement)
					.disabled
			).toBe(false);
			expect(
				(screen.getByRole('radio', { name: 'Encounter' }) as HTMLInputElement)
					.disabled
			).toBe(false);

			switchToBiometrics();

			// Still rendered, with its last-selected value, just non-interactive.
			expect(
				(screen.getByRole('radio', { name: 'Bird' }) as HTMLInputElement)
					.disabled
			).toBe(true);
			expect(
				(screen.getByRole('radio', { name: 'Encounter' }) as HTMLInputElement)
					.disabled
			).toBe(true);
			// The Counts/Biometrics toggle itself stays rendered and usable.
			expect(screen.getByRole('radio', { name: 'Counts' })).toBeDefined();

			fireEvent.click(screen.getByRole('radio', { name: 'Counts' }));

			expect(
				(screen.getByRole('radio', { name: 'Bird' }) as HTMLInputElement)
					.disabled
			).toBe(false);
			expect(
				(screen.getByRole('radio', { name: 'Encounter' }) as HTMLInputElement)
					.disabled
			).toBe(false);
		});
	});

	describe('multi-toggle layout (Month totals tab)', () => {
		function MonthTotalsTableWithEmptyMonthsToggle() {
			const [hideEmptyMonths, setHideEmptyMonths] = useState(true);
			return (
				<PeriodTotalsTable
					timeInterval="month"
					rows={[buildCoreStatsRow({ time_period: '2026-08-01' })]}
					firstColumnHeader="Month"
					buildHref={() => '/summary'}
					showBiometricsToggle
					extraControls={
						<EmptyMonthsToggle
							value={hideEmptyMonths}
							onChange={setHideEmptyMonths}
						/>
					}
				/>
			);
		}

		it('renders AggregateByToggle, CountsBiometricsToggle and EmptyMonthsToggle together without one replacing another', () => {
			render(<MonthTotalsTableWithEmptyMonthsToggle />);

			expect(screen.getByRole('radio', { name: 'Bird' })).toBeDefined();
			expect(screen.getByRole('radio', { name: 'Encounter' })).toBeDefined();
			expect(screen.getByRole('radio', { name: 'Counts' })).toBeDefined();
			expect(screen.getByRole('radio', { name: 'Biometrics' })).toBeDefined();
			expect(screen.getByRole('radio', { name: 'Show' })).toBeDefined();
			expect(screen.getByRole('radio', { name: 'Hide' })).toBeDefined();
		});
	});
});
