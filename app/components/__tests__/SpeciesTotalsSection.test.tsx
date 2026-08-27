import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { SpeciesTotalsSection } from '../SpeciesTotalsSection';
import speciesDataSnapshot from '@/test-fixtures/snapshots/fetchSpeciesData.alpha.json';
import type { AggregateStatsResult } from '@/app/models/db';

const speciesStats = speciesDataSnapshot as unknown as AggregateStatsResult[];

function buildYearlyStat(
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
		pullus_count: 2,
		juv_count: 5,
		postjuv_count: 3,
		adult_count: 15,
		unknown_age_count: 5,
		new_young_count: 7,
		...overrides
	} as AggregateStatsResult;
}

describe('SpeciesTotalsSection', () => {
	afterEach(() => {
		cleanup();
	});

	describe('without yearlyTotals (year/month summary pages)', () => {
		it('renders a single "Species totals" tab, active by default, with the table content visible beneath it', () => {
			render(<SpeciesTotalsSection speciesStats={speciesStats} />);
			const tab = screen.getByRole('button', { name: 'Species totals' });
			expect(tab.getAttribute('aria-current')).toBe('true');
			expect(document.querySelectorAll('tbody tr').length).toBe(
				speciesStats.length
			);
		});

		it("renders the table's empty state when speciesStats is empty, without crashing", () => {
			render(<SpeciesTotalsSection speciesStats={[]} />);
			expect(
				screen.getByRole('button', { name: 'Species totals' })
			).toBeTruthy();
			expect(document.querySelectorAll('tbody tr').length).toBe(0);
		});

		it('does not render a "Year totals" tab', () => {
			render(<SpeciesTotalsSection speciesStats={speciesStats} />);
			expect(screen.queryByRole('button', { name: 'Year totals' })).toBeNull();
		});
	});

	describe('with yearlyTotals (all-time summary page)', () => {
		it('renders "Year totals" as the first tab, active by default, with its content visible beneath it', () => {
			const yearlyTotals = [buildYearlyStat()];
			render(
				<SpeciesTotalsSection
					speciesStats={speciesStats}
					yearlyTotals={yearlyTotals}
				/>
			);
			const tabs = screen.getAllByRole('button');
			expect(tabs.map((tab) => tab.textContent)).toEqual([
				'Year totals',
				'Species totals'
			]);
			expect(tabs[0].getAttribute('aria-current')).toBe('true');
			expect(screen.getByTestId('period-totals-table')).toBeTruthy();
		});

		it('renders the first column as a plain year number linking to /summary/{year}', () => {
			const yearlyTotals = [buildYearlyStat({ time_period: '2026-01-01' })];
			render(
				<SpeciesTotalsSection
					speciesStats={speciesStats}
					yearlyTotals={yearlyTotals}
				/>
			);
			const link = screen.getByRole('link', { name: '2026' });
			expect(link.getAttribute('href')).toBe('/summary/2026');
		});

		it('keeps "Species totals" present and switches to it on click', () => {
			const yearlyTotals = [buildYearlyStat()];
			render(
				<SpeciesTotalsSection
					speciesStats={speciesStats}
					yearlyTotals={yearlyTotals}
				/>
			);
			fireEvent.click(screen.getByRole('button', { name: 'Species totals' }));
			expect(
				screen
					.getByRole('button', { name: 'Species totals' })
					.getAttribute('aria-current')
			).toBe('true');
			expect(document.querySelectorAll('tbody tr').length).toBe(
				speciesStats.length
			);
		});

		it("renders the shared table's empty state when yearlyTotals is empty, without crashing", () => {
			render(
				<SpeciesTotalsSection speciesStats={speciesStats} yearlyTotals={[]} />
			);
			expect(screen.getByRole('button', { name: 'Year totals' })).toBeTruthy();
			expect(screen.queryByTestId('period-totals-table')).toBeNull();
		});
	});
});
