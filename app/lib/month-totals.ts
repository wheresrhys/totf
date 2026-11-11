import { format as formatDate } from 'date-fns';
import type { StatsCacheResult, StatsResult } from '@/modules/stats/browser';

// A single month's row for the year summary page's "Month totals" tab, and
// (reused as-is) for the all-time page's "Combine years" OFF state — same
// shape either way: one row per real `(year, month)` combination. Pure raw
// data only — no label/href here; callers derive those via `formatMonthYearLabel`
// below and, for hrefs, `lib/group-links.ts` (which needs the viewing context
// this model has no business knowing about).
//
// `stats` is the `StatsResult` union rather than one member of it because both
// grains genuinely arrive here: the summary pages' month totals are
// all-species-combined cells, the species page's are by-species ones, and
// `synthesizeZeroStats` below contributes combined-grain zero-fills to either.
// Nothing in this file reads `species_name`, which is the only column the two
// members differ on.
export type MonthTotalsRow = {
	year: number;
	zeroIndexedMonth: number;
	stats: StatsResult;
};

// The month name is built from integer year/zeroIndexedMonth via a *local*
// `Date` — sidestepping the UTC-parse off-by-one that `new Date("2026-01-01")`
// risks at the Jan/Dec boundary on negative-offset runtimes. `row` is
// `undefined` when a caller's `Map.get(...)` row lookup misses — returning ''
// here (rather than making every caller ternary-check first) matches the
// existing "empty label renders as plain text" convention `buildGroupSummaryHref`
// also follows.
export function formatMonthYearLabel(
	row: Pick<MonthTotalsRow, 'year' | 'zeroIndexedMonth'> | undefined
): string {
	if (!row) {
		return '';
	}
	return formatDate(new Date(row.year, row.zeroIndexedMonth, 1), 'LLLL yyyy');
}

// A zero-valued stats cell for a month the cache omitted (no sessions). The
// cache only holds cells with data, so a year with e.g. only Mar–Oct sessions
// comes back missing the other months entirely; these are filled in client-side
// rather than by widening the read.
//
// Typed `StatsCacheResult` — the all-species-combined member — because that is
// what this row honestly is: `species_name` is `null`, and a month with no
// sessions has no species to attribute the zeros to. That is also what removes
// the `as unknown as` double assertion this used to need (and its
// `no-restricted-syntax` disable): the by-species row type this was typed as
// before #1417 declared `species_name: string`, so the honest `null` could only
// be forced past `tsc` with assignability checking switched off entirely.
//
// Every count column is `0` and every wing/weight column is `null`. The nulls
// are deliberate: those 8 are the only nullable columns on the cache tables,
// precisely so "nothing biometric-eligible was measured here" is representable
// (see `modules/stats/CLAUDE.md`'s "The stats-result types"), and a `0` would be
// a fabricated measurement rather than an absent one. No consumer of a
// month-totals row reads them — `PeriodTotalsTable` renders count columns only.
function synthesizeZeroStats(timePeriod: string): StatsCacheResult {
	return {
		species_name: null,
		time_period: timePeriod,
		session_count: 0,
		avg_encounters_per_session: 0,
		max_per_session: 0,
		species_count: 0,
		bird_count: 0,
		encounter_count: 0,
		new_bird_count: 0,
		max_new_per_session: 0,
		max_weight: null,
		avg_weight: null,
		min_weight: null,
		median_weight: null,
		max_wing: null,
		avg_wing: null,
		min_wing: null,
		median_wing: null,
		pullus_bird_count: 0,
		juv_bird_count: 0,
		postjuv_bird_count: 0,
		adult_bird_count: 0,
		unknown_age_bird_count: 0,
		new_young_bird_count: 0,
		// Encounter-based age buckets (read by `derivePeriodTotalsRowByEncounter`)
		// are zero for a month with no sessions too — included so a zero-filled
		// row toggled to encounter mode reads `0`, not `undefined`.
		pullus_enc_count: 0,
		juv_enc_count: 0,
		postjuv_enc_count: 0,
		adult_enc_count: 0,
		unknown_age_enc_count: 0,
		new_postjuv_enc_count: 0,
		new_postjuv_juv_enc_count: 0,
		postjuv_juv_enc_count: 0
	};
}

// Build all 12 calendar months for `year`, in Jan→Dec order regardless of the
// RPC's own row order, zero-filling any month the RPC didn't return. Matching is
// by the `YYYY-MM` prefix of `time_period` (string comparison — avoids `Date`
// timezone pitfalls).
export function buildMonthTotalsRows(
	year: number,
	periodStats: StatsResult[]
): MonthTotalsRow[] {
	return Array.from({ length: 12 }, (_unused, zeroIndexedMonth) => {
		const month = zeroIndexedMonth + 1;
		const monthKey = `${year}-${String(month).padStart(2, '0')}`;
		const matchedStats = periodStats.find(
			(stat) => stat.time_period?.slice(0, 7) === monthKey
		);
		return {
			year,
			zeroIndexedMonth,
			stats: matchedStats ?? synthesizeZeroStats(`${monthKey}-01`)
		};
	});
}

// A single calendar-month row for the all-time page's "Month totals" tab, where
// each row sums that month across every year in the group's history (all the
// Januaries, all the Februaries, ...). There's no single year to drill into
// and no year field — pure raw data, same as `MonthTotalsRow`.
export type CombinedMonthTotalsRow = {
	zeroIndexedMonth: number;
	stats: StatsResult;
};

// Month name only (no year) — these rows span every year at once. `row` is
// `undefined` on a lookup miss, same convention as `formatMonthYearLabel`.
export function formatMonthLabel(
	row: Pick<CombinedMonthTotalsRow, 'zeroIndexedMonth'> | undefined
): string {
	if (!row) {
		return '';
	}
	return formatDate(new Date(2000, row.zeroIndexedMonth, 1), 'LLLL');
}

// One row per calendar month at the `'month-squashed'` grain (#996) — every
// column, including distinct-count columns like `species_count`/`bird_count`,
// is already a true cross-year aggregate computed in SQL. Unlike
// `buildMonthTotalsRows`/`buildPerYearMonthTotalsRows`, there's nothing to
// zero-fill or re-sort here: the rows arrive ascending by `time_period`, and
// each row's `zeroIndexedMonth` is derived from its sentinel `time_period`,
// which is all this does.
//
// There may be fewer than 12 of them. `stats_spine`'s month-squashed branch
// was an unconditional `generate_series(1, 12)`, so `core_stats` always
// returned exactly 12 rows (zeros included) — but both callers now read the
// `SimpleStatsCache` tables instead (#1207 for the species page, #1204 for the
// summary page), and the refresh only writes cells that have data. Every
// caller's "Empty months: hide" toggle defaults to on, so the months that go
// missing are the ones it would have dropped anyway.
export function buildCombinedMonthTotalsRows(
	monthSquashedStats: StatsResult[]
): CombinedMonthTotalsRow[] {
	return monthSquashedStats.map((stats) => ({
		zeroIndexedMonth: Number(stats.time_period.slice(5, 7)) - 1,
		stats
	}));
}

// Post-processing filter shared by every month-totals table's "Empty months:
// hide/show" toggle. When `hideEmptyMonths` is true it drops every zero-session
// row — the synthetic ones `buildMonthTotalsRows` zero-fills in, and the
// genuine zero-count rows `core_stats`' `'month-squashed'` mode returns for a
// calendar month with no sessions in any year (a month with genuine sessions
// never has `session_count === 0` either way); when false it returns the rows
// untouched, preserving today's always-render-all-months baseline. Generic over
// both `MonthTotalsRow` and `CombinedMonthTotalsRow` since both carry a
// `stats.session_count`. Pure — never mutates the input array. Callers apply it
// after building rows; the builders themselves stay unaware of the toggle.
export function filterEmptyMonthTotalsRows<
	T extends { stats: Pick<StatsResult, 'session_count'> }
>(rows: T[], hideEmptyMonths: boolean): T[] {
	if (!hideEmptyMonths) return rows;
	return rows.filter((row) => row.stats.session_count !== 0);
}

// The Session-totals tab's zero-count row filter, applied directly over the
// raw day-grain cache rows the read returns — unlike `filterEmptyMonthTotalsRows`
// above, there's no `{ stats }`-wrapped row shape here to force callers into
// (#1381). Always drops every zero-count row — the ones
// `SimpleStatsCacheBySpecies`'s day-grain spine zero-fills in for a session day
// the filtered species wasn't encountered; unlike the month-totals toggle above,
// there's no show-empty-rows mode to offer here (per review feedback on #1382,
// an empty session row is never worth showing). Generic on the row type, like
// `filterEmptyMonthTotalsRows`, so a caller gets its own row type back rather
// than the widened union. Pure — never mutates the input array.
export function filterEmptySessionRows<
	T extends Pick<StatsResult, 'session_count'>
>(rows: T[]): T[] {
	return rows.filter((row) => row.session_count !== 0);
}

// The "Combine years" toggle's OFF state for the all-time "Month totals" tab:
// one row per real `(year, month)` combination in the group's history, with no
// combining/summing — the raw month-grain cache rows (the same array
// `buildCombinedMonthTotalsRows` folds into 12 buckets), reshaped into pure
// `MonthTotalsRow`s and sorted chronologically regardless of input order.
export function buildPerYearMonthTotalsRows(
	periodStats: StatsResult[]
): MonthTotalsRow[] {
	return periodStats
		.map((stat) => ({
			year: Number(stat.time_period.slice(0, 4)),
			zeroIndexedMonth: Number(stat.time_period.slice(5, 7)) - 1,
			stats: stat
		}))
		.sort((a, b) => a.stats.time_period.localeCompare(b.stats.time_period));
}
