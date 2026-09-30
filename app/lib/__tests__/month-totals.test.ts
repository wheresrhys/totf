import { describe, it, expect } from 'vitest';
import {
	buildMonthTotalsRows,
	buildCombinedMonthTotalsRows,
	buildPerYearMonthTotalsRows,
	filterEmptyMonthTotalsRows,
	formatMonthYearLabel,
	formatMonthLabel
} from '../month-totals';
import { formatPostgresIntervalForDisplay } from '@/app/lib/postgres-interval';
import type { CoreStatsResult } from '@/app/models/db';
import { buildCoreStatsRow } from '@/app/__tests__/helpers/core-stats-fixtures';

// A monthly stat row as `core_stats` returns it: `time_period` is the first
// of the month.
function monthStat(
	year: number,
	month: number,
	overrides: Partial<CoreStatsResult> = {}
): CoreStatsResult {
	const timePeriod = `${year}-${String(month).padStart(2, '0')}-01`;
	return buildCoreStatsRow({ time_period: timePeriod, ...overrides });
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
	// Rows are already the true cross-year aggregate per calendar month —
	// `core_stats`' `'month-squashed'` `group_by_time_period` mode (#996) — one
	// row per month, keyed by the `MM` slice of the sentinel `time_period`
	// (`2000-<mm>-01`), not by full `YYYY-MM`.
	function monthSquashedStat(
		month: number,
		overrides: Partial<CoreStatsResult> = {}
	): CoreStatsResult {
		return buildCoreStatsRow({
			time_period: `2000-${String(month).padStart(2, '0')}-01`,
			...overrides
		});
	}

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
		it('uses the real RPC stats for a matched calendar month rather than zeroes', () => {
			const rows = buildCombinedMonthTotalsRows([
				monthSquashedStat(8, { encounter_count: 123, session_count: 9 })
			]);
			const august = rows[7];
			expect(august.stats.encounter_count).toBe(123);
			expect(august.stats.session_count).toBe(9);
		});

		it('orders output Jan→Dec even when the RPC rows arrive reversed/shuffled', () => {
			const reversed = [
				monthSquashedStat(12),
				monthSquashedStat(7),
				monthSquashedStat(3),
				monthSquashedStat(1)
			];
			const rows = buildCombinedMonthTotalsRows(reversed);
			expect(rows.map((row) => row.stats.time_period)).toEqual([
				'2000-01-01',
				'2000-02-01',
				'2000-03-01',
				'2000-04-01',
				'2000-05-01',
				'2000-06-01',
				'2000-07-01',
				'2000-08-01',
				'2000-09-01',
				'2000-10-01',
				'2000-11-01',
				'2000-12-01'
			]);
		});
	});

	describe('Edge', () => {
		it('zero-fills a calendar month missing from the input', () => {
			const rows = buildCombinedMonthTotalsRows([
				monthSquashedStat(1, { session_count: 4, encounter_count: 30 })
			]);
			const february = rows[1];
			expect(february.stats.session_count).toBe(0);
			expect(february.stats.encounter_count).toBe(0);
			expect(february.stats.total_effort).toBe('00:00:00');
		});

		it('zero-fills all 12 months when given an empty array', () => {
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
