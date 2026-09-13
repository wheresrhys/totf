import { format as formatDate } from 'date-fns';
import { postgresIntervalToSeconds } from '@/app/lib/postgres-interval';
import type { CoreStatsResult } from '../models/db';

// A single month's row for the year summary page's "Month totals" tab, and
// (reused as-is) for the all-time page's "Combine years" OFF state — same
// shape either way: one row per real `(year, month)` combination. Pure raw
// data only — no label/href here; callers derive those via `formatMonthYearLabel`
// below and, for hrefs, `lib/group-links.ts` (which needs the viewing context
// this model has no business knowing about).
export type MonthTotalsRow = {
	year: number;
	zeroIndexedMonth: number;
	stats: CoreStatsResult;
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

// `core_stats` returns `'00:00:00'` for an interval with no recorded
// effort; mirror that convention for synthesized (zero-session) months so the
// shared table's interval formatting renders them identically to a real empty
// period.
const ZERO_INTERVAL = '00:00:00';

// A zero-valued `core_stats` row for a month the RPC omitted (no sessions).
// The RPC's `period_spine` only spans min→max actual session dates, so a year
// with e.g. only Mar–Oct sessions comes back missing the other months entirely;
// these are filled in client-side rather than by touching the RPC.
function synthesizeZeroStats(timePeriod: string): CoreStatsResult {
	return {
		species_name: null,
		time_period: timePeriod,
		session_count: 0,
		total_effort: ZERO_INTERVAL,
		effort_per_session: ZERO_INTERVAL,
		effort_per_encounter: ZERO_INTERVAL,
		avg_encounters_per_session: 0,
		max_per_session: 0,
		species_count: 0,
		bird_count: 0,
		encounter_count: 0,
		new_bird_count: 0,
		max_new_per_session: 0,
		max_weight: 0,
		avg_weight: 0,
		min_weight: 0,
		median_weight: 0,
		max_wing: 0,
		avg_wing: 0,
		min_wing: 0,
		median_wing: 0,
		pullus_bird_count: 0,
		juv_bird_count: 0,
		postjuv_bird_count: 0,
		adult_bird_count: 0,
		unknown_age_bird_count: 0,
		// Encounter-based age buckets (read by `derivePeriodTotalsRowByEncounter`)
		// are zero for a month with no sessions too — included so a zero-filled
		// row toggled to encounter mode reads `0`, not `undefined`.
		pullus_enc_count: 0,
		juv_enc_count: 0,
		postjuv_enc_count: 0,
		adult_enc_count: 0,
		unknown_age_enc_count: 0
		// `species_name` is nullable in the RPC's real output but typed `string`
		// in the generated types; cast through `unknown` to keep the honest null.
	} as unknown as CoreStatsResult;
}

// Build all 12 calendar months for `year`, in Jan→Dec order regardless of the
// RPC's own row order, zero-filling any month the RPC didn't return. Matching is
// by the `YYYY-MM` prefix of `time_period` (string comparison — avoids `Date`
// timezone pitfalls).
export function buildMonthTotalsRows(
	year: number,
	periodStats: CoreStatsResult[]
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
	stats: CoreStatsResult;
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

// Fields that combine additively across years for a given calendar month. Only
// the columns the "Month totals" tab actually renders (encounters-only, so the
// age buckets are the `*_enc_count` variants) plus `species_count`, which is
// summed as a documented approximation — it can double-count a species caught in
// the same calendar month across multiple years (an exact cross-year distinct
// count would need a further species+month-grouped RPC call, out of scope).
const SUMMABLE_STAT_FIELDS = [
	'session_count',
	'encounter_count',
	'species_count',
	'bird_count',
	'new_bird_count',
	'pullus_enc_count',
	'juv_enc_count',
	'postjuv_enc_count',
	'adult_enc_count',
	'unknown_age_enc_count'
] as const satisfies readonly (keyof CoreStatsResult)[];

// Re-format a second count back into a Postgres-interval string that
// `postgresIntervalToSeconds` round-trips. Hours are unbounded (e.g. `36:00:00`)
// — exactly the shape `core_stats` returns for a multi-day `total_effort` —
// so summing then re-parsing is lossless.
function secondsToPostgresInterval(totalSeconds: number): string {
	const whole = Math.round(totalSeconds);
	const hours = Math.floor(whole / 3600);
	const minutes = Math.floor((whole % 3600) / 60);
	const seconds = whole % 60;
	const pad = (value: number) => String(value).padStart(2, '0');
	return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

// Fold `(year, month)` rows into exactly 12 calendar-month buckets, in Jan→Dec
// order regardless of input order, summing each summable field across every year
// that shares the calendar month. `total_effort` is summed in seconds then
// re-serialised to an interval string. A month absent from every year zero-fills
// to the same shape `buildMonthTotalsRows` uses. Matching is by the `MM` slice of
// `time_period` (string comparison — avoids `Date` timezone pitfalls).
export function buildCombinedMonthTotalsRows(
	periodStats: CoreStatsResult[]
): CombinedMonthTotalsRow[] {
	return Array.from({ length: 12 }, (_unused, index) => {
		const month = index + 1;
		const monthKey = String(month).padStart(2, '0');
		const yearsForMonth = periodStats.filter(
			(stat) => stat.time_period?.slice(5, 7) === monthKey
		);
		// A stable, year-agnostic sentinel `time_period` — never displayed (the
		// label is supplied separately and there's no link), only used as a
		// row/lookup key and to keep the Jan→Dec order if the table is sorted.
		const stats = synthesizeZeroStats(`2000-${monthKey}-01`);
		let effortSeconds = 0;
		for (const yearStat of yearsForMonth) {
			for (const field of SUMMABLE_STAT_FIELDS) {
				(stats[field] as number) += (yearStat[field] as number) ?? 0;
			}
			effortSeconds += postgresIntervalToSeconds(yearStat.total_effort);
		}
		stats.total_effort = secondsToPostgresInterval(effortSeconds);
		return {
			zeroIndexedMonth: index,
			stats
		};
	});
}

// Post-processing filter shared by every month-totals table's "Empty months:
// hide/show" toggle. When `hideEmptyMonths` is true it drops the synthetic
// zero-session rows `buildMonthTotalsRows`/`buildCombinedMonthTotalsRows`
// zero-fill in (a month with genuine sessions never has `session_count === 0`,
// so this only removes synthesized months); when false it returns the rows
// untouched, preserving today's always-render-all-months baseline. Generic over
// both `MonthTotalsRow` and `CombinedMonthTotalsRow` since both carry a
// `stats.session_count`. Pure — never mutates the input array. Callers apply it
// after building rows; the builders themselves stay unaware of the toggle.
export function filterEmptyMonthTotalsRows<
	T extends { stats: Pick<CoreStatsResult, 'session_count'> }
>(rows: T[], hideEmptyMonths: boolean): T[] {
	if (!hideEmptyMonths) return rows;
	return rows.filter((row) => row.stats.session_count !== 0);
}

// The "Combine years" toggle's OFF state for the all-time "Month totals" tab:
// one row per real `(year, month)` combination in the group's history, with no
// combining/summing — the raw `core_stats` month array (the same array
// `buildCombinedMonthTotalsRows` folds into 12 buckets), reshaped into pure
// `MonthTotalsRow`s and sorted chronologically regardless of input order.
export function buildPerYearMonthTotalsRows(
	periodStats: CoreStatsResult[]
): MonthTotalsRow[] {
	return periodStats
		.map((stat) => ({
			year: Number(stat.time_period.slice(0, 4)),
			zeroIndexedMonth: Number(stat.time_period.slice(5, 7)) - 1,
			stats: stat
		}))
		.sort((a, b) => a.stats.time_period.localeCompare(b.stats.time_period));
}
