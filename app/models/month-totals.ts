import { format as formatDate } from 'date-fns';
import type { AggregateStatsResult } from './db';

// A single month's row for the year summary page's "Month totals" tab. `label`
// and `href` are precomputed here (not derived downstream from `stats`) so the
// month name is built from integer year/month via a *local* `Date` — sidestepping
// the UTC-parse off-by-one that `new Date("2026-01-01")` risks at the Jan/Dec
// boundary on negative-offset runtimes (see `formatPeriodTotalsLabel`).
export type MonthTotalsRow = {
	label: string;
	href: string;
	stats: AggregateStatsResult;
};

// `aggregate_stats` returns `'00:00:00'` for an interval with no recorded
// effort; mirror that convention for synthesized (zero-session) months so the
// shared table's interval formatting renders them identically to a real empty
// period.
const ZERO_INTERVAL = '00:00:00';

// A zero-valued `aggregate_stats` row for a month the RPC omitted (no sessions).
// The RPC's `period_spine` only spans min→max actual session dates, so a year
// with e.g. only Mar–Oct sessions comes back missing the other months entirely;
// these are filled in client-side rather than by touching the RPC.
function synthesizeZeroStats(timePeriod: string): AggregateStatsResult {
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
		new_young_bird_count: 0
		// `species_name` is nullable in the RPC's real output but typed `string`
		// in the generated types; cast through `unknown` to keep the honest null.
	} as unknown as AggregateStatsResult;
}

// Build all 12 calendar months for `year`, in Jan→Dec order regardless of the
// RPC's own row order, zero-filling any month the RPC didn't return. Matching is
// by the `YYYY-MM` prefix of `time_period` (string comparison — avoids `Date`
// timezone pitfalls).
export function buildMonthTotalsRows(
	year: number,
	periodStats: AggregateStatsResult[]
): MonthTotalsRow[] {
	return Array.from({ length: 12 }, (_unused, index) => {
		const month = index + 1;
		const monthKey = `${year}-${String(month).padStart(2, '0')}`;
		const matchedStats = periodStats.find(
			(stat) => stat.time_period?.slice(0, 7) === monthKey
		);
		return {
			label: formatDate(new Date(year, month - 1, 1), 'LLLL yyyy'),
			href: `/summary/${year}/${month}`,
			stats: matchedStats ?? synthesizeZeroStats(`${monthKey}-01`)
		};
	});
}
