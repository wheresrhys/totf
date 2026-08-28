import { describe, it, expect } from 'vitest';
import { buildMonthTotalsRows } from '../month-totals';
import { formatPostgresIntervalForDisplay } from '@/lib/postgres-interval';
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
		pullus_bird_count: 2,
		juv_bird_count: 5,
		postjuv_bird_count: 3,
		adult_bird_count: 15,
		unknown_age_bird_count: 5,
		new_young_bird_count: 7,
		...overrides
	} as unknown as AggregateStatsResult;
}

// A monthly stat row as `aggregate_stats` returns it: `time_period` is the first
// of the month.
function monthStat(
	year: number,
	month: number,
	overrides: Partial<AggregateStatsResult> = {}
): AggregateStatsResult {
	const timePeriod = `${year}-${String(month).padStart(2, '0')}-01`;
	return buildStat({ time_period: timePeriod, ...overrides });
}

describe('buildMonthTotalsRows', () => {
	describe('Usual', () => {
		it('returns exactly 12 rows in Jan→Dec order with correct labels and hrefs', () => {
			const rows = buildMonthTotalsRows(2026, []);
			expect(rows).toHaveLength(12);
			expect(rows.map((row) => row.label)).toEqual([
				'January 2026',
				'February 2026',
				'March 2026',
				'April 2026',
				'May 2026',
				'June 2026',
				'July 2026',
				'August 2026',
				'September 2026',
				'October 2026',
				'November 2026',
				'December 2026'
			]);
			expect(rows.map((row) => row.href)).toEqual([
				'/summary/2026/1',
				'/summary/2026/2',
				'/summary/2026/3',
				'/summary/2026/4',
				'/summary/2026/5',
				'/summary/2026/6',
				'/summary/2026/7',
				'/summary/2026/8',
				'/summary/2026/9',
				'/summary/2026/10',
				'/summary/2026/11',
				'/summary/2026/12'
			]);
		});
	});

	describe('Structure', () => {
		it('orders output Jan→Dec even when the RPC rows arrive reversed/shuffled', () => {
			const reversed = [
				monthStat(2026, 12),
				monthStat(2026, 7),
				monthStat(2026, 3),
				monthStat(2026, 1)
			];
			const rows = buildMonthTotalsRows(2026, reversed);
			expect(rows.map((row) => row.stats.time_period)).toEqual([
				'2026-01-01',
				'2026-02-01',
				'2026-03-01',
				'2026-04-01',
				'2026-05-01',
				'2026-06-01',
				'2026-07-01',
				'2026-08-01',
				'2026-09-01',
				'2026-10-01',
				'2026-11-01',
				'2026-12-01'
			]);
		});

		it('uses the real RPC stats for matched months rather than zeroes', () => {
			const rows = buildMonthTotalsRows(2026, [
				monthStat(2026, 8, { encounter_count: 123, session_count: 9 })
			]);
			const august = rows[7];
			expect(august.stats.encounter_count).toBe(123);
			expect(august.stats.session_count).toBe(9);
		});
	});

	describe('Edge', () => {
		it('zero-fills nothing when the RPC returns all 12 months', () => {
			const allMonths = Array.from({ length: 12 }, (_unused, index) =>
				monthStat(2026, index + 1, { session_count: index + 1 })
			);
			const rows = buildMonthTotalsRows(2026, allMonths);
			rows.forEach((row, index) => {
				expect(row.stats.session_count).toBe(index + 1);
			});
		});

		it('zero-fills exactly Jan/Feb/Nov/Dec when only Mar–Oct have sessions', () => {
			const marchToOctober = Array.from({ length: 8 }, (_unused, index) =>
				monthStat(2026, index + 3, { session_count: 5 })
			);
			const rows = buildMonthTotalsRows(2026, marchToOctober);
			const zeroFilled = rows
				.filter((row) => row.stats.session_count === 0)
				.map((row) => row.label);
			expect(zeroFilled).toEqual([
				'January 2026',
				'February 2026',
				'November 2026',
				'December 2026'
			]);
		});

		it('zero-fills all 12 months for a year with no sessions', () => {
			const rows = buildMonthTotalsRows(2026, []);
			expect(rows).toHaveLength(12);
			rows.forEach((row) => {
				expect(row.stats.session_count).toBe(0);
				expect(row.stats.encounter_count).toBe(0);
				expect(row.stats.bird_count).toBe(0);
			});
		});

		it('gives zero-filled rows distinct, correct hrefs', () => {
			const rows = buildMonthTotalsRows(2026, []);
			const hrefs = rows.map((row) => row.href);
			expect(new Set(hrefs).size).toBe(12);
			expect(hrefs[0]).toBe('/summary/2026/1');
			expect(hrefs[11]).toBe('/summary/2026/12');
		});

		it('formats and links Jan/Dec boundary months with no timezone off-by-one', () => {
			const rows = buildMonthTotalsRows(2026, []);
			expect(rows[0].label).toBe('January 2026');
			expect(rows[0].href).toBe('/summary/2026/1');
			expect(rows[11].label).toBe('December 2026');
			expect(rows[11].href).toBe('/summary/2026/12');
		});

		it("renders a zero-filled month's total_effort as '0' via formatPostgresIntervalForDisplay", () => {
			const rows = buildMonthTotalsRows(2026, []);
			expect(rows[0].stats.total_effort).toBe('00:00:00');
			expect(formatPostgresIntervalForDisplay(rows[0].stats.total_effort)).toBe(
				'0'
			);
		});
	});
});
