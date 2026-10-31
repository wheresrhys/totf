import type { SupabaseClient } from '@supabase/supabase-js';
import { endOfMonth, endOfYear, format, parseISO } from 'date-fns';
import { getAuthenticatedSupabaseClient } from './group-auth';
import { getGroupCookie } from '@/app/actions/group-cookie';
import { supabase, catchSupabaseErrors } from '@/lib/supabase';
import { readStatsCacheRows } from '@/modules/stats';
import {
	resolveGroupPublicAreasForRequest,
	type ViewedGroup
} from '../group-slug';
import type { CoreStatsResult } from '@/app/models/db';
import type { TemporalUnit } from '@/modules/stats/browser';

/**
 * Every `SimpleStatsCache.temporal_unit` value that names a repeating period,
 * i.e. everything the old `group_by_time_period` RPC param accepted. Excludes
 * `'all-time'`, which is the *absence* of time-period grouping rather than a
 * grouping the caller can ask for.
 */
type StatsCacheTemporalGrain = Exclude<TemporalUnit, 'all-time'>;

// Shared param shape for the summary read path. Still named after
// `core_stats`/`public_core_stats`, whose params these are: those two RPCs
// remain the fallback for the one window shape the cache tables cannot express
// (see `resolveStatsCacheQueryPlan`). `ringing_group_filter` is supplied
// separately by the resolver below, since every caller of this module always
// scopes to one `viewedGroup`.
//
// `species_name_filter` and `year_filter` used to be declared here and were
// never set by any of this module's three callers (#1204 grep-verified) —
// only `app/actions/sp-data.ts` ever passed `species_name_filter`, and it has
// its own species-filtered cache read path that never routes through here. They
// are dropped outright rather than left for the cache translation below to
// silently ignore.
export type CoreStatsRpcParams = {
	from_date?: string;
	to_date?: string;
	group_by_species?: boolean;
	group_by_time_period?: StatsCacheTemporalGrain;
	month_filter?: number;
};

export type GroupSummaryAccessLevel = 'own' | 'shared' | 'public' | 'blocked';

export type AuthorisedSummaryResult = {
	accessLevel: GroupSummaryAccessLevel;
	rows: CoreStatsResult[];
};

/**
 * The sentinel year `stats_spine`'s `'month-squashed'` branch stamps on a
 * squashed calendar month's `time_period` (`make_date(2000, m, 1)` — see
 * `stats_spine.sql`), and so the year the cache tables store those cells
 * under. `app/lib/month-totals.ts`'s `formatMonthLabel` already relies on the
 * same convention when it prints one.
 */
const MONTH_SQUASHED_SENTINEL_YEAR = 2000;

/**
 * How one `CoreStatsRpcParams` shape reads out of the cache tables: which
 * `temporal_unit` slice to read, how to narrow it to the requested window, and
 * what post-processing the rows need to come back in the shape the RPC
 * returned them.
 */
export type StatsCacheQueryPlan = {
	temporalUnit: TemporalUnit;
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
 * Translates one `CoreStatsRpcParams` into the cache-table read that answers
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
 *    page's "CES only" range (`YYYY-04-25`..`YYYY-09-05`) and its two
 *    free-text date inputs are the only things that produce one. For *this*
 *    function's own caller — the counts half — those keep reading the live
 *    `core_stats`/`public_core_stats` RPCs. The alternative was to serve them
 *    a wrong `bird_count`, so that dependency stays until either the cache
 *    gains an arbitrary-window grain or those two filters are reshaped to
 *    cache-aligned ones.
 *
 * Exported because the `/species` list page's *other* half —
 * `fetchBiometricsStats` (`app/actions/spp-data.ts`), which fetches the 8
 * wing/weight columns for the same window — has to split exactly the same way
 * and must stay in lockstep with this one (#1223). It has its own,
 * independent reason for needing the same split: `AVG`/`MEDIAN` are not
 * associative, so `avg_weight`/`median_weight`/`avg_wing`/`median_wing` cannot
 * be rebuilt from finer cache cells for an arbitrary window even
 * approximately, in the same way the distinct counts above cannot. Two call
 * sites, one rule — don't re-derive this mapping a second time.
 *
 * What the two halves do *with* a `null` now differs, though, and the
 * `core_stats`/`public_core_stats` dependency above is the counts half's
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
}: CoreStatsRpcParams): StatsCacheQueryPlan | null {
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
 * consumer reads the series in, the `Species(species_name)` embed
 * `mergeSpeciesBiometrics` (app/lib/species-stats.ts) joins on, and the
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
async function runStatsCacheRead(
	client: SupabaseClient,
	viewedGroup: ViewedGroup,
	groupBySpecies: boolean,
	plan: StatsCacheQueryPlan
): Promise<CoreStatsResult[]> {
	// `readStatsCacheRows` select('*')s and leaves narrowing to its caller, so
	// name the row shape this read is known to produce here. It already
	// resolves `species_name` off the embed (`null` for an
	// all-species-combined read, exactly as `core_stats` returned under
	// `group_by_species: false`) and strips the embed itself.
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
	})) as CoreStatsResult[];

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

async function runCoreStats(
	rpcName: 'core_stats' | 'public_core_stats',
	client: SupabaseClient,
	viewedGroup: ViewedGroup,
	rpcParams: CoreStatsRpcParams
): Promise<CoreStatsResult[]> {
	const rows = (await client
		.rpc(rpcName, { ringing_group_filter: viewedGroup.id, ...rpcParams })
		.then(catchSupabaseErrors)) as CoreStatsResult[] | null;
	return rows ?? [];
}

/**
 * Whether a read that was *permitted* to return rows actually found any —
 * the "is there anything real here" signal the `'shared'` branch needs to tell
 * an RLS-blocked read apart from an authorised one.
 *
 * A cache-table read makes this a plain emptiness check: RLS filters a blocked
 * caller's rows out entirely, so the result set is genuinely empty. The RPC
 * fallback can't use that, because `core_stats` always emits at least one row
 * for an ungrouped query (its spine is a 1x1 cross join, independent of
 * RLS-visible data) — a blocked cross-group call comes back as a single row of
 * COALESCEd zeros rather than an empty array, so there the zeros have to be
 * recognised too.
 *
 * Both rules resolve a genuinely-empty-but-authorised `'shared'` read to
 * `'blocked'`, which is the pre-existing behaviour: nothing in either read
 * path distinguishes "shared with me, and has no data" from "not shared with
 * me". (The `'own'` and `'public'` branches are unaffected either way — they
 * grant on cookie identity and `public_areas` respectively, never on whether
 * any rows came back.)
 */
function hasVisibleData(
	rows: CoreStatsResult[],
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
 */
export async function fetchAuthorisedCoreStats(
	viewedGroup: ViewedGroup,
	rpcParams: CoreStatsRpcParams = {}
): Promise<AuthorisedSummaryResult> {
	const cacheQueryPlan = resolveStatsCacheQueryPlan(rpcParams);
	const readStats = (client: SupabaseClient, publicRead: boolean) =>
		cacheQueryPlan
			? runStatsCacheRead(
					client,
					viewedGroup,
					Boolean(rpcParams.group_by_species),
					cacheQueryPlan
				)
			: runCoreStats(
					publicRead ? 'public_core_stats' : 'core_stats',
					client,
					viewedGroup,
					rpcParams
				);

	const viewerGroupId = await getGroupCookie();

	if (viewerGroupId === viewedGroup.id) {
		const client = await getAuthenticatedSupabaseClient();
		return { accessLevel: 'own', rows: await readStats(client, false) };
	}

	const publicAreas = await resolveGroupPublicAreasForRequest(viewedGroup.id);
	if (publicAreas.includes('summary')) {
		return { accessLevel: 'public', rows: await readStats(supabase, true) };
	}

	if (!viewerGroupId) {
		return { accessLevel: 'blocked', rows: [] };
	}

	const client = await getAuthenticatedSupabaseClient();
	const sharedRows = await readStats(client, false);

	if (hasVisibleData(sharedRows, Boolean(cacheQueryPlan))) {
		return { accessLevel: 'shared', rows: sharedRows };
	}

	return { accessLevel: 'blocked', rows: [] };
}
