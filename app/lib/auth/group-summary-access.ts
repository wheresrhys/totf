import type { SupabaseClient } from '@supabase/supabase-js';
import { endOfMonth, endOfYear, format, parseISO } from 'date-fns';
import { getAuthenticatedSupabaseClient } from './group-auth';
import { getGroupCookie } from '@/app/actions/group-cookie';
import { supabase, catchSupabaseErrors } from '@/lib/supabase';
import {
	readStatsCacheRows,
	type StatsCacheResult,
	type StatsResultFor
} from '@/modules/stats';
import { readSpeciesNamesById } from '@/app/lib/species-names';
import type { StatsTemporalUnit } from '@/app/models/temporal-unit';
import {
	resolveGroupPublicAreasForRequest,
	type ViewedGroup
} from '../group-slug';
import type { StatsCacheBySpeciesResult } from '@/modules/stats';

/**
 * Every `SimpleStatsCache.temporal_unit` value that names a repeating period,
 * i.e. everything the old `group_by_time_period` RPC param accepted. Excludes
 * `'all-time'`, which is the *absence* of time-period grouping rather than a
 * grouping the caller can ask for.
 */
type StatsCacheTemporalGrain = Exclude<StatsTemporalUnit, 'all-time'>;

// Shared param shape for the summary read path: the window a caller wants,
// translated below either into a cache-table read or (for the one window
// shape the cache can't express) a live `stats_cache_basic_session_metrics`
// recompute — see `resolveStatsCacheQueryPlan`. `ringing_group_filter` is
// supplied separately by the resolver below, since every caller of this
// module always scopes to one `viewedGroup`.
//
// `species_name_filter` and `year_filter` used to be declared here and were
// never set by any of this module's three callers (#1204 grep-verified) —
// only `app/actions/sp-data.ts` ever passed `species_name_filter`, and it has
// its own species-filtered cache read path that never routes through here. They
// are dropped outright rather than left for the cache translation below to
// silently ignore.
export type StatsWindowParams = {
	from_date?: string;
	to_date?: string;
	group_by_species?: boolean;
	group_by_time_period?: StatsCacheTemporalGrain;
	month_filter?: number;
};

export type GroupSummaryAccessLevel = 'own' | 'shared' | 'public' | 'blocked';

/**
 * One row of an authorised summary read, at whichever grain the read asked for
 * (#1424): `AuthorisedStatsRow<true>` is the by-species member,
 * `AuthorisedStatsRow<false>` the all-species-combined one, and the default
 * `boolean` resolves — `StatsResultFor` being distributive over its naked type
 * parameter — to the union of the two, for a consumer that handles either.
 * This is what replaced a non-generic alias of the *by-species* member alone,
 * which left the ungrouped read path typed as if it always had a species name
 * when `species_name` is genuinely `null` there.
 *
 * `species_id` rides along on a by-species row (#1415) because
 * `app/actions/spp-data.ts`'s arbitrary-window path merges this row with a
 * second `stats_cache_*_metrics` result and keys that merge on the integer FK
 * rather than the display-oriented `species_name` — a merge that was only ever
 * possible on the name because this function used to discard the id once the
 * name was resolved.
 *
 * Optional rather than required because only a by-species read has one: the
 * all-species-combined cache table carries no `species_id` column at all, and
 * an ungrouped live recompute returns a literal `null` for it. Nothing but the
 * `/species` list page's merge reads it; every other consumer of these rows
 * reads `species_name`.
 */
export type AuthorisedStatsRow<BySpecies extends boolean = boolean> =
	StatsResultFor<BySpecies> & {
		species_id?: number | null;
	};

export type AuthorisedSummaryResult<BySpecies extends boolean = boolean> = {
	accessLevel: GroupSummaryAccessLevel;
	rows: AuthorisedStatsRow<BySpecies>[];
};

/**
 * The `AuthorisedStatsRow` grain a statically-known `StatsWindowParams` shape
 * implies — `true` only when the params literal sets `group_by_species: true`,
 * so an omitted key, an explicit `false` and a non-literal `boolean` all
 * resolve to the all-species-combined member. The `boolean` case is the one
 * imprecision, and it is deliberate: no call site passes a computed
 * `group_by_species` today, and resolving it to the *union* instead would
 * oblige every statically-known caller to narrow a row it already knows the
 * grain of.
 */
type GroupedBySpecies<Params extends StatsWindowParams> = Params extends {
	group_by_species: true;
}
	? true
	: false;

/**
 * The sentinel year `stats_spine`'s `'month-squashed'` branch stamps on a
 * squashed calendar month's `time_period` (`make_date(2000, m, 1)` — see
 * `stats_spine.sql`), and so the year the cache tables store those cells
 * under. `app/lib/month-totals.ts`'s `formatMonthLabel` already relies on the
 * same convention when it prints one.
 */
const MONTH_SQUASHED_SENTINEL_YEAR = 2000;

/**
 * How one `StatsWindowParams` shape reads out of the cache tables: which
 * `temporal_unit` slice to read, how to narrow it to the requested window, and
 * what post-processing the rows need to come back in the shape the RPC
 * returned them.
 */
export type StatsCacheQueryPlan = {
	temporalUnit: StatsTemporalUnit;
	/** Exactly one cell — an aggregate window that *is* a single cache cell. */
	timePeriod?: string;
	fromTimePeriod?: string;
	toTimePeriod?: string;
	/**
	 * 1-indexed calendar month to keep. `time_period` is a `date` with no
	 * separate year and month field, so "any year, this calendar month" is not
	 * a filter PostgREST can express — it is applied in JS over whatever the
	 * `temporal_unit`/range filters already returned.
	 */
	calendarMonth?: number;
	/**
	 * Rewrite each surviving row's `time_period` to its year start. Set only
	 * for the year-grained-but-month-filtered read below, whose rows are read
	 * at the month grain and must still be labelled as the years they stand
	 * for.
	 */
	relabelTimePeriodToYearStart?: boolean;
};

/**
 * `time_period` is a `date` column, so PostgREST serialises it as
 * `YYYY-MM-DD` — read the calendar month straight off the middle component
 * rather than via `new Date(...)`, which would drag the server's timezone into
 * a pure calendar comparison.
 */
function calendarMonthOf(timePeriod: string): number {
	return Number(timePeriod.slice(5, 7));
}

function isWholeCalendarYear(fromDate: string, toDate: string): boolean {
	return (
		fromDate.endsWith('-01-01') &&
		toDate === format(endOfYear(parseISO(fromDate)), 'yyyy-MM-dd')
	);
}

function isWholeCalendarMonth(fromDate: string, toDate: string): boolean {
	return (
		fromDate.endsWith('-01') &&
		toDate === format(endOfMonth(parseISO(fromDate)), 'yyyy-MM-dd')
	);
}

/**
 * Translates one `StatsWindowParams` into the cache-table read that answers
 * it, or `null` when no cache read can.
 *
 * Two fundamentally different request shapes arrive here:
 *
 * 1. **Grouped by time period** (`group_by_time_period` set) — one row per
 *    cell of that grain inside the window. Every such request maps straight
 *    onto a `temporal_unit` slice plus a `time_period` range, because the
 *    rows the caller wants *are* cache cells. The one exception is
 *    `'year'` + `month_filter`, where the RPC returned one row per year
 *    computed from that calendar month's sessions only: scoped to a single
 *    calendar month of a single year, that cell is exactly the cache's own
 *    `(year, month_filter)` `'month'` cell, so the month grain is read and
 *    each surviving row relabelled back to its year start — the same
 *    equivalence `app/actions/sp-data.ts`'s `fetchSpeciesPeriodTotals` uses.
 *
 * 2. **Ungrouped** (no `group_by_time_period`) — a single aggregate row (per
 *    species) over the whole window. This can only be served from the cache
 *    when the window is itself exactly one cache cell, since the aggregate's
 *    distinct-count columns (`bird_count`, the five `*_bird_count` age
 *    buckets) cannot be recomputed by summing finer cells: a bird caught on
 *    two days is one bird but two day-cells. The windows that do line up are
 *    every one the summary pages ask for — all time, a whole calendar year, a
 *    whole calendar month, and a squashed calendar month — and they cover the
 *    `/species` list page's default and year-select views too.
 *
 *    Returning `null` therefore means "arbitrary window": the `/species` list
 *    page's two free-text date inputs are the only thing that produces one.
 *    For *this* function's own caller — the counts half — that keeps reading
 *    a live `stats_cache_basic_session_metrics` recompute (#1244 — it used to
 *    be `core_stats`/`public_core_stats`, which nothing here calls any more).
 *    The alternative was to serve a wrong `bird_count`, so that dependency
 *    stays until either the cache gains an arbitrary-window grain or those
 *    two inputs are reshaped to cache-aligned ones.
 *
 * Exported because the `/species` list page's *other* half —
 * `fetchSpeciesRowsWithBiometrics` (`app/actions/spp-data.ts`), which sources
 * the 8 wing/weight columns for the same window — has to split exactly the same way
 * and must stay in lockstep with this one (#1223). It has its own,
 * independent reason for needing the same split: `AVG`/`MEDIAN` are not
 * associative, so `avg_weight`/`median_weight`/`avg_wing`/`median_wing` cannot
 * be rebuilt from finer cache cells for an arbitrary window even
 * approximately, in the same way the distinct counts above cannot. Two call
 * sites, one rule — don't re-derive this mapping a second time.
 *
 * What the two halves do *with* a `null` now differs, though, and the
 * `stats_cache_basic_session_metrics` dependency above is the counts half's
 * alone (#1244). The biometrics half recomputes an arbitrary window live from
 * `stats_cache_biometrics_metrics` — a cache-feeding RPC that nonetheless
 * takes the same window signature and recomputes from `Encounters` on every
 * call, verified (#1224) to be an exact column-for-column drop-in for
 * `biometrics_stats`, which is now called from nowhere. Don't read the
 * paragraph above as pinning both halves to the retired live RPC pair.
 */
export function resolveStatsCacheQueryPlan({
	from_date: fromDate,
	to_date: toDate,
	month_filter: monthFilter,
	group_by_time_period: groupByTimePeriod
}: StatsWindowParams): StatsCacheQueryPlan | null {
	if (groupByTimePeriod) {
		if (groupByTimePeriod === 'year' && monthFilter) {
			return {
				temporalUnit: 'month',
				fromTimePeriod: fromDate,
				toTimePeriod: toDate,
				calendarMonth: monthFilter,
				relabelTimePeriodToYearStart: true
			};
		}
		return {
			temporalUnit: groupByTimePeriod,
			fromTimePeriod: fromDate,
			toTimePeriod: toDate,
			calendarMonth: monthFilter
		};
	}

	if (!fromDate && !toDate) {
		if (!monthFilter) {
			// One cell per group (or per species) — no `time_period` filter
			// needed, which is also why the `'0001-01-01'` all-time sentinel
			// never has to be named here.
			return { temporalUnit: 'all-time' };
		}
		return {
			temporalUnit: 'month-squashed',
			timePeriod: `${MONTH_SQUASHED_SENTINEL_YEAR}-${String(monthFilter).padStart(2, '0')}-01`
		};
	}

	// A calendar-month filter *within* a date range is a sparse window, not a
	// cache cell. No caller combines the two today; the RPC fallback covers it
	// if one ever does.
	if (!fromDate || !toDate || monthFilter) {
		return null;
	}
	if (isWholeCalendarYear(fromDate, toDate)) {
		return { temporalUnit: 'year', timePeriod: fromDate };
	}
	if (isWholeCalendarMonth(fromDate, toDate)) {
		return { temporalUnit: 'month', timePeriod: fromDate };
	}
	return null;
}

/**
 * Reads the already-materialized `SimpleStatsCache`/`SimpleStatsCacheBySpecies`
 * slice `plan` names, as `client` — which is the whole access model: the
 * identical query returns the viewer's own group's rows, a
 * `GroupDataSharing`-granted group's rows, a publicly-opted-in group's rows to
 * an anonymous `anon` caller, or nothing at all, purely according to the
 * tables' own SELECT policy (#1202). There is no per-access-level query shape
 * and no SECURITY DEFINER wrapper any more; the policy decides.
 *
 * The read itself — table choice (`group_by_species` picks the *table*, never a
 * column filter: the two grains live in two tables, see
 * `"SimpleStatsCache".sql`'s header for why), the `group_id`/`temporal_unit`/
 * `time_period` filters, the `(time_period, species_name)` ordering every
 * consumer reads the series in, the `Species(species_name)` embed every
 * by-species consumer reads the name off, and the
 * pagination a day-grain slice of a long-running group's history needs — is
 * `readStatsCacheRows`' job (app/actions/stats-cache.ts, #1233). This function
 * only translates a `StatsCacheQueryPlan` into its params and applies the two
 * row transforms PostgREST can't express:
 *
 * - `calendarMonth`: "any year, this calendar month" is not a filter on a
 *   `date` column, so it is applied here over whatever the grain/range filters
 *   already returned.
 * - `relabelTimePeriodToYearStart`: the year-grained-but-month-filtered read is
 *   served from the month grain and its rows must still be labelled as the
 *   years they stand for.
 */
async function runStatsCacheRead<BySpecies extends boolean>(
	client: SupabaseClient,
	viewedGroup: ViewedGroup,
	groupBySpecies: BySpecies,
	plan: StatsCacheQueryPlan
): Promise<AuthorisedStatsRow<BySpecies>[]> {
	// `readStatsCacheRows` select('*')s and returns `Record<string, unknown>[]`,
	// leaving narrowing to its caller, so name the row shape this read is known
	// to produce here. The assertion tracks `groupBySpecies` rather than naming
	// one grain (#1424): it already resolves `species_name` off the embed
	// (`null` for an all-species-combined read, exactly as `core_stats` returned
	// under `group_by_species: false`) and strips the embed itself, so which
	// `StatsResult` member the rows are is decided entirely by the argument this
	// function forwards as `bySpecies`. `species_id` is among the columns
	// `select('*')` brings back on a by-species read, which is why
	// `AuthorisedStatsRow` can declare it without this branch doing anything to
	// put it there.
	const rows = (await readStatsCacheRows({
		client,
		viewedGroup,
		bySpecies: groupBySpecies,
		temporalUnit: plan.temporalUnit,
		// A plan carries either an exact cell or a range, never both — which is
		// also the one-of-the-two contract `readStatsCacheRows` applies.
		timePeriod: plan.timePeriod,
		fromDate: plan.fromTimePeriod,
		toDate: plan.toTimePeriod
	})) as AuthorisedStatsRow<BySpecies>[];

	return rows
		.filter(
			(row) =>
				plan.calendarMonth === undefined ||
				calendarMonthOf(row.time_period) === plan.calendarMonth
		)
		.map((row) =>
			plan.relabelTimePeriodToYearStart
				? { ...row, time_period: `${row.time_period.slice(0, 4)}-01-01` }
				: row
		);
}

/**
 * A `stats_cache_basic_session_metrics_result` row: the basic-count and
 * session columns `core_stats` shares with it, keyed on `species_id`
 * rather than `species_name` — it was written to feed a cache-table write,
 * which keys on the id too.
 */
type BasicSessionMetricsRpcRow = Pick<
	StatsCacheBySpeciesResult,
	| 'time_period'
	| 'species_count'
	| 'bird_count'
	| 'encounter_count'
	| 'new_bird_count'
	| 'session_count'
	| 'avg_encounters_per_session'
	| 'max_per_session'
	| 'max_new_per_session'
> & { species_id: number | null };

/**
 * Every cache-row column `stats_cache_basic_session_metrics` does not produce,
 * with the placeholder this path fills it with. The RPC carries only the
 * basic-count and session columns (see its own file header), so 22 of a cache
 * row's 32 columns have to come from somewhere — they are filled rather than
 * omitted, because a stats-result row requires every column to be present and
 * `Partial<>`-ing them would push `undefined` handling into every deriver,
 * table and chart that reads them unconditionally.
 *
 * Three groups, with two different placeholder values (#1372):
 *
 * - **The 10 age buckets** (5 bird, 5 encounter) → `0`. Recovering a real value
 *   means two more RPC calls, `stats_cache_bird_age_metrics` and
 *   `stats_cache_encounter_age_metrics`, merged by `species_id` the way
 *   `modules/stats/lib/refresh/merge-metric-rows.ts` does for the cache write.
 * - **The 4 young/postjuv transition counts** (`new_young_bird_count`,
 *   `new_postjuv_enc_count`, `new_postjuv_juv_enc_count`,
 *   `postjuv_juv_enc_count`) → `0`, recoverable from the same two age-metric
 *   RPCs as the buckets above, since that is where the cache refresh sources
 *   them.
 * - **The 8 wing/weight columns** → `null`, not `0`. These are the only
 *   nullable columns on either cache table, precisely so "nothing
 *   biometric-eligible was measured for this cell" is representable, and a `0`
 *   would read as a bird that weighed nothing. Recovering a real value means a
 *   `stats_cache_biometrics_metrics` call for the same window — exactly what
 *   `app/actions/spp-data.ts`'s arbitrary-window fallback already does for the
 *   biometrics half of the `/species` list page, merged onto these rows by
 *   `species_id` (#1415). It is deliberately not done *here*: this function
 *   serves every `fetchAuthorisedCoreStats` caller, most of which never render
 *   a wing/weight column, and issuing the extra RPC for all of them would make
 *   every arbitrary-window read pay for one page's columns.
 *
 * **Nothing on this call path reads any of the 22 today.** The `/species` list
 * page's rendered column set (`speciesStatConfigs`,
 * `modules/stats-view/lib/species-stats.ts`) is only
 * `species_name`/`bird_count`/`encounter_count`/`session_count`/
 * `max_per_session` plus the separately-sourced biometric columns, and
 * `hasVisibleData` below reads only `encounter_count` — a column the RPC
 * genuinely produces, so its zero-check is unaffected by any of this. Don't
 * start reading a real value out of one of these columns on this path without
 * making the corresponding call above first.
 *
 * The `satisfies` target is derived rather than a hand-listed column union, so
 * this const cannot silently fall behind the cache tables: a column added to
 * `SimpleStatsCache` that the RPC doesn't produce fails to compile here until a
 * placeholder is chosen for it.
 */
const UNAVAILABLE_COLUMN_PLACEHOLDERS = {
	pullus_bird_count: 0,
	juv_bird_count: 0,
	postjuv_bird_count: 0,
	adult_bird_count: 0,
	unknown_age_bird_count: 0,
	pullus_enc_count: 0,
	juv_enc_count: 0,
	postjuv_enc_count: 0,
	adult_enc_count: 0,
	unknown_age_enc_count: 0,
	new_young_bird_count: 0,
	new_postjuv_enc_count: 0,
	new_postjuv_juv_enc_count: 0,
	postjuv_juv_enc_count: 0,
	max_weight: null,
	avg_weight: null,
	min_weight: null,
	median_weight: null,
	max_wing: null,
	avg_wing: null,
	min_wing: null,
	median_wing: null
} satisfies Omit<
	StatsCacheResult,
	keyof BasicSessionMetricsRpcRow | 'species_name'
>;

/**
 * The arbitrary-window fallback for the counts half of the `/species` list
 * page: a live recompute by `stats_cache_basic_session_metrics` instead of
 * the retired `core_stats`/`public_core_stats` RPC pair (#1244), following
 * the exact precedent `app/actions/spp-data.ts`'s
 * `mergeLiveBiometricsIntoCountsRows` already set for the biometrics half. That
 * RPC exists to feed the `SimpleStatsCacheBySpecies`/`SimpleStatsCache`
 * write, but nothing about it is cache-specific — it takes the same 8-arg
 * window signature `core_stats` did and recomputes from `Encounters` on every
 * call, verified equivalent for this exact arbitrary-window shape by
 * `stats-cache-basic-session-metrics.test.ts`'s own cross-RPC assertions —
 * so it answers an uncacheable window just as correctly.
 *
 * `species_name` isn't a column either RPC in this family returns when
 * keyed on `species_id` — it comes back through the same
 * `readSpeciesNamesById` join `spp-data.ts`'s own live path used to use,
 * `null` when `group_by_species` wasn't set, matching `core_stats`' own
 * behaviour. The `species_id` it was resolved from is kept on the row rather
 * than discarded — see `AuthorisedStatsRow`.
 *
 * Which is why this path returns the *either-grain* `AuthorisedStatsRow` union
 * and builds each row inside a branch on the resolved name (#1424), rather
 * than asserting the by-species member over rows whose `species_name` it just
 * set to `null`. An ungrouped recompute resolves every name to `null`, and
 * even a grouped one can: `readSpeciesNamesById` is a lookup that may miss. So
 * the grain genuinely isn't a function of the argument here the way it is for
 * `runStatsCacheRead` above — each branch instead builds a concrete
 * `StatsResult` member the compiler checks column-for-column, with no cast at
 * all.
 *
 * Every other column a cache row carries is filled from
 * `UNAVAILABLE_COLUMN_PLACEHOLDERS` above, so a row off this path has the same
 * key set as one off `runStatsCacheRead` — see that const for which columns
 * those are, what each placeholder is, and what a caller must do before reading
 * a real value out of one.
 */
async function runLiveMetricsRecompute(
	client: SupabaseClient,
	viewedGroup: ViewedGroup,
	rpcParams: StatsWindowParams
): Promise<AuthorisedStatsRow[]> {
	const rows = (await client
		.rpc('stats_cache_basic_session_metrics', {
			ringing_group_filter: viewedGroup.id,
			...rpcParams
		})
		.then(catchSupabaseErrors)) as BasicSessionMetricsRpcRow[] | null;
	if (!rows?.length) {
		return [];
	}

	const speciesNamesById = rpcParams.group_by_species
		? await readSpeciesNamesById(
				client,
				rows.flatMap(({ species_id }) =>
					species_id === null ? [] : [species_id]
				)
			)
		: new Map<number, string>();

	return rows.map(({ species_id, ...basicMetrics }) => {
		const speciesName =
			species_id === null ? null : (speciesNamesById.get(species_id) ?? null);
		const columns = {
			...basicMetrics,
			...UNAVAILABLE_COLUMN_PLACEHOLDERS,
			species_id
		};
		return speciesName === null
			? { ...columns, species_name: null }
			: { ...columns, species_name: speciesName };
	});
}

/**
 * Whether a read that was *permitted* to return rows actually found any —
 * the "is there anything real here" signal the `'shared'` branch needs to tell
 * an RLS-blocked read apart from an authorised one.
 *
 * A cache-table read makes this a plain emptiness check: RLS filters a blocked
 * caller's rows out entirely, so the result set is genuinely empty. The live
 * recompute fallback can't use that, because `stats_cache_basic_session_metrics`
 * shares `core_stats`' spine and so inherits the same quirk: it always emits
 * at least one row for an ungrouped query (the spine is a 1x1 cross join,
 * independent of RLS-visible data) — a blocked cross-group call comes back as
 * a single row of COALESCEd zeros rather than an empty array, so there the
 * zeros have to be recognised too.
 *
 * Both rules resolve a genuinely-empty-but-authorised `'shared'` read to
 * `'blocked'`, which is the pre-existing behaviour: nothing in either read
 * path distinguishes "shared with me, and has no data" from "not shared with
 * me". (The `'own'` and `'public'` branches are unaffected either way — they
 * grant on cookie identity and `public_areas` respectively, never on whether
 * any rows came back.)
 */
function hasVisibleData(
	rows: AuthorisedStatsRow[],
	servedFromCache: boolean
): boolean {
	if (servedFromCache) {
		return rows.length > 0;
	}
	return rows.length > 0 && rows.some((row) => row.encounter_count > 0);
}

/**
 * Resolves the correct read path for a group's aggregate summary stats, and
 * which of it actually reached the caller — see #770 for the full model.
 * `viewedGroup` is the group whose data is being requested; the viewer is
 * derived internally from the session cookie (or its absence), never passed
 * in — this is deliberately not a cookie-presence check:
 *
 * 1. viewer's own group === target -> the viewer's existing authenticated
 *    client, unchanged, even if the result is genuinely empty (a group must
 *    always be able to see its own — possibly empty — summary).
 * 2. otherwise, check first (public-before-authenticated, #773 review) whether
 *    the target has opted its summary into public view (`public_areas`
 *    contains `'summary'`) -> if so, grant immediately, reading the cache
 *    tables through the plain unauthenticated `supabase` client. Those tables'
 *    SELECT policy carries the same `public_areas` gate `public_core_stats`
 *    applied, and `anon` holds a bare `GRANT SELECT` on them (#1202), so no
 *    JWT and no SECURITY DEFINER wrapper is needed for this branch.
 *
 *    This is deliberately checked — and granted — before any
 *    `GroupDataSharing`-authorised attempt, even for a signed-in viewer who
 *    genuinely holds a sharing grant to the target: both branches now run the
 *    *same* query against the same rows, differing only in which OR-branch of
 *    one policy admits them, so a sharing-authorised viewer is never shown a
 *    degraded view by granting on public status first. It also means an
 *    anonymous visitor (no session cookie at all) to a public target never
 *    needs to attempt — and have fail — an authenticated call first; the only
 *    place `rows` might legitimately differ between the two paths
 *    (accessLevel `'shared'` vs `'public'`) is the label, not the data, which
 *    is why no caller currently branches on `accessLevel` for that
 *    distinction.
 * 3. otherwise (target not public), fall through to the viewer's existing
 *    authenticated client if they have a session at all (covers an existing
 *    `GroupDataSharing` grant, RLS-enforced as before) — a no-cookie viewer
 *    is short-circuited to blocked without attempting this, since
 *    `getGroupCookie()` already tells us definitively there's no session to
 *    authenticate.
 * 4. none of the above -> blocked. No rows, no throw.
 *
 * Returns the access decision alongside the rows (not just the rows) so a
 * caller that cares which path served the data can destructure `accessLevel`
 * — every existing action function currently only destructures `rows`.
 *
 * **The row type resolves from the params literal** (#1424): a call site that
 * statically asks for `group_by_species: true` gets
 * `StatsCacheBySpeciesResult` rows, and one that asks for `false` — or omits
 * the key, or passes no params at all — gets the all-species-combined
 * `StatsCacheResult`, whose `species_name` is honestly `null`. See
 * `GroupedBySpecies` for how the grain is read off the literal.
 *
 * The generic lives on an overload signature rather than on the implementation
 * because the implementation legitimately works in the either-grain union:
 * `runStatsCacheRead` resolves its own grain from the same argument, while
 * `runLiveMetricsRecompute` returns whichever member each row's resolved
 * `species_name` makes it (see its doc comment). Declaring the resolution here
 * is what lets *both* read paths stay free of a cast to a `StatsResult` member.
 */
export function fetchAuthorisedCoreStats<
	const Params extends StatsWindowParams = StatsWindowParams
>(
	viewedGroup: ViewedGroup,
	rpcParams?: Params
): Promise<AuthorisedSummaryResult<GroupedBySpecies<Params>>>;
export async function fetchAuthorisedCoreStats(
	viewedGroup: ViewedGroup,
	rpcParams: StatsWindowParams = {}
): Promise<AuthorisedSummaryResult> {
	const cacheQueryPlan = resolveStatsCacheQueryPlan(rpcParams);
	const readStats = (client: SupabaseClient) =>
		cacheQueryPlan
			? runStatsCacheRead(
					client,
					viewedGroup,
					Boolean(rpcParams.group_by_species),
					cacheQueryPlan
				)
			: runLiveMetricsRecompute(client, viewedGroup, rpcParams);

	const viewerGroupId = await getGroupCookie();

	if (viewerGroupId === viewedGroup.id) {
		const client = await getAuthenticatedSupabaseClient();
		return { accessLevel: 'own', rows: await readStats(client) };
	}

	const publicAreas = await resolveGroupPublicAreasForRequest(viewedGroup.id);
	if (publicAreas.includes('summary')) {
		// An arbitrary (non-cache-aligned) window has no cache-table read to
		// serve it, and the UI has already stopped offering a way to request
		// one for a public/blocked viewer (#1232) — rather than falling
		// through to a live metrics recompute, mirror the 'blocked' branch's
		// "no rows, no throw" convention. The 'own'/'shared' arbitrary-window
		// fallback below is unaffected — this gate is deliberate policy (an
		// anonymous/cross-group viewer never reaches the live-recompute path
		// at all), not dead code.
		if (!cacheQueryPlan) {
			return { accessLevel: 'public', rows: [] };
		}
		return { accessLevel: 'public', rows: await readStats(supabase) };
	}

	if (!viewerGroupId) {
		return { accessLevel: 'blocked', rows: [] };
	}

	const client = await getAuthenticatedSupabaseClient();
	const sharedRows = await readStats(client);

	if (hasVisibleData(sharedRows, Boolean(cacheQueryPlan))) {
		return { accessLevel: 'shared', rows: sharedRows };
	}

	return { accessLevel: 'blocked', rows: [] };
}
