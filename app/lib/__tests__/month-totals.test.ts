import { describe, it, expect } from 'vitest';
import {
	buildMonthTotalsRows,
	buildCombinedMonthTotalsRows,
	buildPerYearMonthTotalsRows,
	filterEmptyMonthTotalsRows,
	formatMonthYearLabel,
	formatMonthLabel
} from '../month-totals';
import {
	formatPostgresIntervalForDisplay,
	postgresIntervalToSeconds
} from '@/app/lib/postgres-interval';
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
		it('returns exactly 12 rows in Jan→Dec order with the correct year and zeroIndexedMonth', () => {
			const rows = buildMonthTotalsRows(2026, []);
			expect(rows).toHaveLength(12);
			expect(rows.every((row) => row.year === 2026)).toBe(true);
			expect(rows.map((row) => row.zeroIndexedMonth)).toEqual([
				0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11
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
				.map((row) => row.zeroIndexedMonth);
			expect(zeroFilled).toEqual([0, 1, 10, 11]);
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

		it("renders a zero-filled month's total_effort as '0' via formatPostgresIntervalForDisplay", () => {
			const rows = buildMonthTotalsRows(2026, []);
			expect(rows[0].stats.total_effort).toBe('00:00:00');
			expect(formatPostgresIntervalForDisplay(rows[0].stats.total_effort)).toBe(
				'0'
			);
		});
	});
});

describe('buildCombinedMonthTotalsRows', () => {
	describe('Usual', () => {
		it('returns exactly 12 rows in Jan→Dec order, with no year field', () => {
			const rows = buildCombinedMonthTotalsRows([]);
			expect(rows).toHaveLength(12);
			expect(rows.map((row) => row.zeroIndexedMonth)).toEqual([
				0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11
			]);
		});
	});

	describe('Structure', () => {
		it('sums session_count/encounter_count across every year sharing the same calendar month', () => {
			const rows = buildCombinedMonthTotalsRows([
				monthStat(2020, 1, { session_count: 4, encounter_count: 30 }),
				monthStat(2021, 1, { session_count: 6, encounter_count: 45 }),
				monthStat(2022, 1, { session_count: 1, encounter_count: 5 })
			]);
			const january = rows[0];
			expect(january.stats.session_count).toBe(11);
			expect(january.stats.encounter_count).toBe(80);
		});

		it('sums total_effort correctly across years rather than taking the last year value', () => {
			const rows = buildCombinedMonthTotalsRows([
				monthStat(2020, 1, { total_effort: '10:00:00' }),
				monthStat(2021, 1, { total_effort: '05:30:00' })
			]);
			// 10h + 5h30m = 15h30m = 55800s — a sum, not the last year's 5h30m.
			expect(postgresIntervalToSeconds(rows[0].stats.total_effort)).toBe(55800);
		});

		it('sums species_count across years as a documented approximation (does not attempt cross-year de-duplication)', () => {
			const rows = buildCombinedMonthTotalsRows([
				monthStat(2020, 1, { species_count: 12 }),
				monthStat(2021, 1, { species_count: 9 })
			]);
			// Deliberate over-count: the same species in Jan 2020 and Jan 2021
			// contributes twice — an exact distinct count is out of scope.
			expect(rows[0].stats.species_count).toBe(21);
		});
	});

	describe('Edge', () => {
		it('zero-fills a calendar month with no sessions in any year', () => {
			const rows = buildCombinedMonthTotalsRows([
				monthStat(2020, 1, { session_count: 4, encounter_count: 30 })
			]);
			const february = rows[1];
			expect(february.stats.session_count).toBe(0);
			expect(february.stats.encounter_count).toBe(0);
			expect(february.stats.total_effort).toBe('00:00:00');
		});

		it('degenerates to the same per-month totals as a single year of history', () => {
			const singleYear = [
				monthStat(2026, 3, { session_count: 5, encounter_count: 40 }),
				monthStat(2026, 7, { session_count: 2, encounter_count: 11 })
			];
			const rows = buildCombinedMonthTotalsRows(singleYear);
			expect(rows[2].stats.session_count).toBe(5);
			expect(rows[2].stats.encounter_count).toBe(40);
			expect(rows[6].stats.session_count).toBe(2);
			expect(rows[6].stats.encounter_count).toBe(11);
		});

		it('produces Jan→Dec order regardless of input row order', () => {
			const rows = buildCombinedMonthTotalsRows([
				monthStat(2021, 12, { session_count: 1 }),
				monthStat(2020, 3, { session_count: 2 }),
				monthStat(2022, 1, { session_count: 3 })
			]);
			expect(rows.map((row) => row.zeroIndexedMonth)).toEqual([
				0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11
			]);
			expect(rows[0].stats.session_count).toBe(3);
			expect(rows[2].stats.session_count).toBe(2);
			expect(rows[11].stats.session_count).toBe(1);
		});

		it('returns all-zero rows for 12 months when periodStats is empty', () => {
			const rows = buildCombinedMonthTotalsRows([]);
			expect(rows).toHaveLength(12);
			rows.forEach((row) => {
				expect(row.stats.session_count).toBe(0);
				expect(row.stats.encounter_count).toBe(0);
				expect(row.stats.bird_count).toBe(0);
				expect(row.stats.total_effort).toBe('00:00:00');
			});
		});
	});
});

describe('buildPerYearMonthTotalsRows', () => {
	describe('Usual', () => {
		it('returns one row per (year, month) combination present in the input, unsummed', () => {
			const rows = buildPerYearMonthTotalsRows([
				monthStat(2020, 1, { session_count: 4, encounter_count: 30 }),
				monthStat(2021, 1, { session_count: 6, encounter_count: 45 }),
				monthStat(2020, 8, { session_count: 2, encounter_count: 11 })
			]);
			expect(rows).toHaveLength(3);
			expect(rows.map((row) => row.stats.session_count)).toEqual([4, 2, 6]);
			expect(rows.map((row) => row.stats.encounter_count)).toEqual([
				30, 11, 45
			]);
		});

		it('returns the year and zero-indexed month for each row', () => {
			const rows = buildPerYearMonthTotalsRows([monthStat(2020, 1)]);
			expect(rows[0].year).toBe(2020);
			expect(rows[0].zeroIndexedMonth).toBe(0);
		});
	});

	describe('Structure', () => {
		it('keeps rows for the same calendar month in different years separate (e.g. January 2020 and January 2021 both present, uncombined)', () => {
			const rows = buildPerYearMonthTotalsRows([
				monthStat(2020, 1, { session_count: 4 }),
				monthStat(2021, 1, { session_count: 6 })
			]);
			expect(rows).toHaveLength(2);
			expect(rows.map((row) => [row.year, row.zeroIndexedMonth])).toEqual([
				[2020, 0],
				[2021, 0]
			]);
			expect(rows.map((row) => row.stats.session_count)).toEqual([4, 6]);
		});

		it('orders rows chronologically regardless of input order', () => {
			const rows = buildPerYearMonthTotalsRows([
				monthStat(2021, 12),
				monthStat(2020, 3),
				monthStat(2022, 1),
				monthStat(2020, 1)
			]);
			expect(rows.map((row) => row.stats.time_period)).toEqual([
				'2020-01-01',
				'2020-03-01',
				'2021-12-01',
				'2022-01-01'
			]);
		});
	});

	describe('Edge', () => {
		it('returns an empty array when given no rows', () => {
			expect(buildPerYearMonthTotalsRows([])).toEqual([]);
		});

		it('handles a single (year, month) row correctly', () => {
			const rows = buildPerYearMonthTotalsRows([
				monthStat(2026, 6, { session_count: 3, encounter_count: 20 })
			]);
			expect(rows).toHaveLength(1);
			expect(rows[0].year).toBe(2026);
			expect(rows[0].zeroIndexedMonth).toBe(5);
			expect(rows[0].stats.session_count).toBe(3);
			expect(rows[0].stats.encounter_count).toBe(20);
		});
	});
});

describe('filterEmptyMonthTotalsRows', () => {
	describe('Usual', () => {
		it('returns all rows unchanged when hideEmptyMonths is false', () => {
			const rows = buildMonthTotalsRows(2026, [
				monthStat(2026, 3, { session_count: 5 })
			]);
			expect(filterEmptyMonthTotalsRows(rows, false)).toEqual(rows);
		});
	});

	describe('Structure', () => {
		it('filters out rows with session_count === 0 when hideEmptyMonths is true', () => {
			const rows = buildMonthTotalsRows(2026, [
				monthStat(2026, 3, { session_count: 5 }),
				monthStat(2026, 7, { session_count: 2 })
			]);
			const filtered = filterEmptyMonthTotalsRows(rows, true);
			expect(filtered.every((row) => row.stats.session_count !== 0)).toBe(true);
		});

		it('keeps rows with session_count > 0 when hideEmptyMonths is true', () => {
			const rows = buildMonthTotalsRows(2026, [
				monthStat(2026, 3, { session_count: 5 }),
				monthStat(2026, 7, { session_count: 2 })
			]);
			const filtered = filterEmptyMonthTotalsRows(rows, true);
			expect(filtered.map((row) => row.zeroIndexedMonth)).toEqual([2, 6]);
		});
	});

	describe('Edge', () => {
		it('returns an empty array when every row is empty and hideEmptyMonths is true', () => {
			const rows = buildMonthTotalsRows(2026, []);
			expect(filterEmptyMonthTotalsRows(rows, true)).toEqual([]);
		});

		it('returns all 12 rows unchanged when no month is empty (toggle has no visible effect)', () => {
			const allMonths = Array.from({ length: 12 }, (_unused, index) =>
				monthStat(2026, index + 1, { session_count: index + 1 })
			);
			const rows = buildMonthTotalsRows(2026, allMonths);
			expect(filterEmptyMonthTotalsRows(rows, true)).toHaveLength(12);
		});

		it('returns exactly one row when every month but one is empty', () => {
			const rows = buildMonthTotalsRows(2026, [
				monthStat(2026, 8, { session_count: 4 })
			]);
			const filtered = filterEmptyMonthTotalsRows(rows, true);
			expect(filtered).toHaveLength(1);
			expect(filtered[0].zeroIndexedMonth).toBe(7);
		});

		it('does not mutate the input array', () => {
			const rows = buildMonthTotalsRows(2026, [
				monthStat(2026, 3, { session_count: 5 })
			]);
			const originalLength = rows.length;
			filterEmptyMonthTotalsRows(rows, true);
			expect(rows).toHaveLength(originalLength);
		});

		it('filters combined-month rows by session_count too (generic over both row shapes)', () => {
			const combinedRows = buildCombinedMonthTotalsRows([
				monthStat(2020, 1, { session_count: 4 }),
				monthStat(2021, 8, { session_count: 2 })
			]);
			const filtered = filterEmptyMonthTotalsRows(combinedRows, true);
			expect(filtered.map((row) => row.zeroIndexedMonth)).toEqual([0, 7]);
		});
	});
});

describe('formatMonthYearLabel', () => {
	describe('Usual', () => {
		it('formats a given year and zeroIndexedMonth as "LLLL yyyy"', () => {
			expect(formatMonthYearLabel({ year: 2026, zeroIndexedMonth: 5 })).toBe(
				'June 2026'
			);
		});
	});

	describe('Edge', () => {
		it('formats the December/January boundary with no UTC off-by-one', () => {
			expect(formatMonthYearLabel({ year: 2026, zeroIndexedMonth: 0 })).toBe(
				'January 2026'
			);
			expect(formatMonthYearLabel({ year: 2026, zeroIndexedMonth: 11 })).toBe(
				'December 2026'
			);
		});

		it('returns an empty string when row is undefined', () => {
			expect(formatMonthYearLabel(undefined)).toBe('');
		});
	});
});

describe('formatMonthLabel', () => {
	describe('Usual', () => {
		it('formats zeroIndexedMonth as the month name only, with no year', () => {
			expect(formatMonthLabel({ zeroIndexedMonth: 0 })).toBe('January');
			expect(formatMonthLabel({ zeroIndexedMonth: 11 })).toBe('December');
		});
	});

	describe('Edge', () => {
		it('returns an empty string when row is undefined', () => {
			expect(formatMonthLabel(undefined)).toBe('');
		});
	});
});
