import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { PeriodTotalsTable } from '../PeriodTotalsTable';
import type { AggregateStatsResult } from '@/app/models/db';

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
		pullus_count: 2,
		juv_count: 5,
		postjuv_count: 3,
		adult_count: 15,
		unknown_age_count: 5,
		new_young_count: 7,
		...overrides
	} as AggregateStatsResult;
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

			const headers = screen.getAllByRole('columnheader');
			expect(headers.map((header) => header.textContent)).toEqual([
				'Year',
				'Species',
				'Encounters',
				'Individuals',
				'New',
				'Retraps',
				'Pullus',
				'Juvs',
				'Postjuv',
				'Adults',
				'Unknown age',
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

		it('does not render a Sessions or Effort column', () => {
			render(
				<PeriodTotalsTable
					grouping="year"
					rows={[buildStat()]}
					firstColumnHeader="Year"
					buildHref={() => '/summary/2026'}
				/>
			);
			const headers = screen
				.getAllByRole('columnheader')
				.map((header) => header.textContent);
			expect(headers).not.toContain('Sessions');
			expect(headers).not.toContain('Effort');
		});
	});
});
