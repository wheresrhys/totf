import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { PeriodTotalsTable } from '../PeriodTotalsTable';
import type { AggregateStatsResult } from '@/app/models/db';

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
		new_young_bird_count: 7,
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
					grouping="year"
					rows={rows}
					firstColumnHeader="Year"
					buildHref={(timePeriod) => `/summary/${timePeriod.slice(0, 4)}`}
				/>
			);

			const headers = getColumnHeaders();
			expect(headers.map((header) => header.textContent)).toEqual([
				'Year',
				'Sessions',
				'Effort',
				'Species',
				'Encounters',
				'Individuals',
				'New',
				'Retrap',
				'Pulli',
				'Juv',
				'Postjuv',
				'Adult',
				'Not aged',
				'New young'
			]);

			expect(document.querySelectorAll('tbody tr').length).toBe(rows.length);
		});

		it('renders the first column via formatPeriodTotalsLabel and the caller-supplied buildHref', () => {
			render(
				<PeriodTotalsTable
					grouping="year"
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
		it('renders a "month" grouping label via formatPeriodTotalsLabel', () => {
			render(
				<PeriodTotalsTable
					grouping="month"
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
					grouping="month"
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

		it('renders a "day" grouping label via formatPeriodTotalsLabel', () => {
			render(
				<PeriodTotalsTable
					grouping="day"
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
					grouping="year"
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
					grouping="year"
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
			const row = document.querySelector('tbody tr');
			expect(row?.textContent).toContain('0');
			const cells = row?.querySelectorAll('td');
			expect(cells?.[1].textContent).toBe('0');
			expect(cells?.[2].textContent).toBe('0');
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
			unknown_age_bird_count: 10,
			new_young_bird_count: 14
		});

		it('renders a "Total" row for the "year" grouping when totalsStats is supplied', () => {
			render(
				<PeriodTotalsTable
					grouping="year"
					rows={rows}
					firstColumnHeader="Year"
					buildHref={(timePeriod) => `/summary/${timePeriod.slice(0, 4)}`}
					totalsStats={totalsStats}
				/>
			);
			const totalsRow = screen.getByTestId('totals-row');
			const cells = totalsRow.querySelectorAll('td');
			expect(cells[0].textContent?.trim()).toBe('Total');
			expect(cells[1].textContent?.trim()).toBe('7');
			// buildTotalsRowCells reads the raw totalsRowModel value straight
			// through — it doesn't apply a column's `formatter` (that's only
			// wired up for data rows via `getFormattedValue`) — so the Effort
			// total renders as raw seconds (36h = 129600s), not "36h".
			expect(cells[2].textContent?.trim()).toBe('129600');
		});

		it('renders a "Total" row for the "month" grouping when totalsStats is supplied', () => {
			render(
				<PeriodTotalsTable
					grouping="month"
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
					grouping="year"
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
					grouping="year"
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

	describe('Sessions and Effort columns', () => {
		it('renders session_count and formatted total_effort for each grouping', () => {
			render(
				<PeriodTotalsTable
					grouping="month"
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
			const cells = document.querySelectorAll('tbody tr td');
			expect(cells[1].textContent).toBe('4');
			expect(cells[2].textContent).toBe('18h');
		});

		it('sorts the Effort column numerically, not by the formatted string', () => {
			const rows = [
				buildStat({ time_period: '2025-01-01', total_effort: '02:30:00' }),
				buildStat({ time_period: '2026-01-01', total_effort: '09:00:00' })
			];
			render(
				<PeriodTotalsTable
					grouping="year"
					rows={rows}
					firstColumnHeader="Year"
					buildHref={(timePeriod) => `/summary/${timePeriod.slice(0, 4)}`}
				/>
			);
			fireEvent.click(screen.getByText('Effort'));
			const tableRows = document.querySelectorAll('tbody tr');
			// Descending on first click: the 9h row ranks above the 2h 30m row,
			// which would sort the wrong way under string comparison ("2h 30m" >
			// "9h" lexicographically).
			expect(tableRows[0].textContent).toContain('2026');
			expect(tableRows[1].textContent).toContain('2025');
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
			it('hides the AggregateByToggle when a fixed aggregation is supplied', () => {
				render(
					<PeriodTotalsTable
						grouping="month"
						rows={[encStat()]}
						firstColumnHeader="Month"
						buildHref={() => ''}
						buildLabel={() => 'January'}
						fixedAggregateBy="encounter"
					/>
				);
				expect(screen.queryByTestId('above-header-row')).toBeNull();
				expect(
					screen.queryByRole('radio', { name: 'Encounter' })
				).toBeNull();
				expect(screen.queryByRole('radio', { name: 'Bird' })).toBeNull();
			});

			it("renders encounter-derived age-bucket values when fixed aggregation is 'encounter'", () => {
				render(
					<PeriodTotalsTable
						grouping="month"
						rows={[encStat()]}
						firstColumnHeader="Month"
						buildHref={() => ''}
						buildLabel={() => 'January'}
						fixedAggregateBy="encounter"
					/>
				);
				const cells = document
					.querySelector('tbody tr')
					?.querySelectorAll('td') as NodeListOf<HTMLTableCellElement>;
				// 6 new, 7 retraps (enc 55 - new 30 = 25), 8 pullus_enc, 9 juv_enc,
				// 10 postjuv_enc, 11 adult_enc, 12 unknown_age_enc.
				expect(cells[7].textContent).toBe('25');
				expect(cells[8].textContent).toBe('9');
				expect(cells[9].textContent).toBe('8');
				expect(cells[10].textContent).toBe('7');
				expect(cells[11].textContent).toBe('6');
				expect(cells[12].textContent).toBe('4');
			});
		});

		describe('Edge', () => {
			it("renders '-' in every row's Individuals column when the placeholder option is set, regardless of underlying bird_count", () => {
				render(
					<PeriodTotalsTable
						grouping="month"
						rows={[
							encStat({ time_period: '2000-01-01', bird_count: 40 }),
							encStat({ time_period: '2000-02-01', bird_count: 7 })
						]}
						firstColumnHeader="Month"
						buildHref={() => ''}
						buildLabel={(tp) => tp}
						fixedAggregateBy="encounter"
						dashIndividuals
					/>
				);
				const dataRows = document.querySelectorAll('tbody tr');
				dataRows.forEach((row) => {
					const cells = row.querySelectorAll('td');
					expect(cells[5].textContent).toBe('-');
				});
			});

			it("renders the totals row's Individuals cell as '-' too", () => {
				render(
					<PeriodTotalsTable
						grouping="month"
						rows={[encStat()]}
						firstColumnHeader="Month"
						buildHref={() => ''}
						buildLabel={() => 'January'}
						fixedAggregateBy="encounter"
						dashIndividuals
						totalsStats={encStat({ bird_count: 123 })}
					/>
				);
				const totalsCells = screen
					.getByTestId('totals-row')
					.querySelectorAll('td');
				expect(totalsCells[5].textContent).toBe('-');
			});

			it('renders the first column as plain text, not a link, when no href is available for a row', () => {
				render(
					<PeriodTotalsTable
						grouping="month"
						rows={[encStat()]}
						firstColumnHeader="Month"
						buildHref={() => ''}
						buildLabel={() => 'January'}
						fixedAggregateBy="encounter"
						dashIndividuals
					/>
				);
				expect(screen.queryByRole('link', { name: 'January' })).toBeNull();
				const firstCell = document
					.querySelector('tbody tr')
					?.querySelector('td');
				expect(firstCell?.textContent).toBe('January');
				expect(firstCell?.querySelector('a')).toBeNull();
			});
		});
	});

	describe('Aggregate by toggle', () => {
		const groupings: {
			grouping: 'year' | 'month' | 'day';
			header: string;
		}[] = [
			{ grouping: 'year', header: 'Year' },
			{ grouping: 'month', header: 'Month' },
			{ grouping: 'day', header: 'Session' }
		];

		groupings.forEach(({ grouping, header }) => {
			it(`defaults to bird-based counts and switches to encounter-based counts for the standard-block columns, for the "${grouping}" grouping`, () => {
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
						grouping={grouping}
						rows={[stat]}
						firstColumnHeader={header}
						buildHref={() => '/summary'}
					/>
				);

				const getCells = () =>
					document
						.querySelector('tbody tr')
						?.querySelectorAll('td') as NodeListOf<HTMLTableCellElement>;

				// Indices: 0 label, 1 sessions, 2 effort, 3 species, 4 encounters,
				// 5 individuals, 6 new, 7 retraps, 8 pullus, 9 juvs, 10 postjuv,
				// 11 adults, 12 unknownAge.
				let cells = getCells();
				expect(cells[3].textContent).toBe(String(stat.species_count));
				expect(cells[4].textContent).toBe(String(stat.encounter_count));
				expect(cells[5].textContent).toBe(String(stat.bird_count));
				expect(cells[6].textContent).toBe('6'); // new (unaffected by toggle)
				expect(cells[7].textContent).toBe('4'); // retraps: bird_count - new
				expect(cells[8].textContent).toBe('2'); // pullus_bird_count
				expect(cells[9].textContent).toBe('1'); // juv_bird_count
				expect(cells[10].textContent).toBe('1'); // postjuv_bird_count
				expect(cells[11].textContent).toBe('3'); // adult_bird_count
				expect(cells[12].textContent).toBe('0'); // unknown_age_bird_count

				fireEvent.click(screen.getByRole('radio', { name: 'Encounter' }));

				cells = getCells();
				// Unaffected columns stay the same after switching.
				expect(cells[3].textContent).toBe(String(stat.species_count));
				expect(cells[4].textContent).toBe(String(stat.encounter_count));
				expect(cells[5].textContent).toBe(String(stat.bird_count));
				expect(cells[6].textContent).toBe('6'); // new (still unaffected)
				expect(cells[7].textContent).toBe('8'); // retraps: encounter_count - new
				expect(cells[8].textContent).toBe('3'); // pullus_enc_count
				expect(cells[9].textContent).toBe('2'); // juv_enc_count
				expect(cells[10].textContent).toBe('2'); // postjuv_enc_count
				expect(cells[11].textContent).toBe('4'); // adult_enc_count
				expect(cells[12].textContent).toBe('1'); // unknown_age_enc_count
			});
		});
	});
});
