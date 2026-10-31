import type { StatsCacheRefreshEvent, StatsCacheRefreshRpcParams } from "../types";
/**
 * Builds one `StatsCacheRefreshEvent` per temporal unit `affectedDates`
 * touches — five of them whenever there is anything at all to refresh, and
 * `[]` for an empty input, since then there is nothing. Every emitted event is
 * stamped with `importJobId` and `ringing_group_filter`. Dedup/order follows
 * `ImportJobTracker.recordAffectedDates`'s `[...new Set(...)].sort()`
 * convention throughout, so output is deterministic regardless of input
 * order.
 */
export function buildStatsCacheRefreshEvents(
  importJobId: number,
  ringingGroupId: number,
  affectedDates: string[],
  affectedSpeciesIds: number[]
): StatsCacheRefreshEvent[] {
  if (affectedDates.length === 0) {
    return [];
  }

  const sortedDates = [...new Set(affectedDates)].sort();
  const sortedSpeciesIds = [...new Set(affectedSpeciesIds)].sort(
    (a, b) => a - b
  );

  function stamp(
    rpcParams: Omit<StatsCacheRefreshRpcParams, 'ringing_group_filter'>
  ): StatsCacheRefreshEvent {
    return {
      importJobId,
      rpcParams: { ringing_group_filter: ringingGroupId, ...rpcParams },
      affectedSpeciesIds: sortedSpeciesIds
    };
  }

  /**
   * `yyyy-MM-dd` strings sort lexicographically in date order, so mapping each
   * date onto its period's first day and deduping leaves the list sorted
   * chronologically without a date-aware comparator. The month-squashed
   * mapping replaces the year with the `2000` sentinel rather than truncating,
   * so its entries sort by calendar month — the only order that means anything
   * for a cell that spans every year.
   */
  function periodsTouched(
    firstDayOfPeriod: (date: string) => string
  ): string[] {
    return [...new Set(sortedDates.map(firstDayOfPeriod))].sort();
  }

  return [
    // All-time: no group_by_time_period key at all, and no periods — this
    // temporal unit always full-replaces the group's whole history.
    stamp({}),

    // Day-range: spans the min/max of the affected dates. This range can
    // contain gap days with no actual activity (e.g. dates on the 1st and
    // the 28th produce a range spanning the whole month), so this is the
    // only event stamped with `affectedDates` — the exact deduped/sorted
    // list of days a day-temporal-unit consumer actually needs to refresh.
    {
      ...stamp({
        group_by_time_period: 'day',
        from_date: sortedDates[0],
        to_date: sortedDates[sortedDates.length - 1]
      }),
      affectedDates: sortedDates
    },

    // Month: every distinct month touched, as first-of-month ISO dates.
    stamp({
      group_by_time_period: 'month',
      periods: periodsTouched((date) => `${date.slice(0, 7)}-01`)
    }),

    // Month-squashed: every distinct *calendar* month touched, as
    // `2000-<mm>-01` sentinel-year dates — the convention
    // `stats_raw_encounters.session_month_squashed` and `stats_spine`'s
    // squashed cells are both labelled with. The year is dropped on purpose:
    // a squashed cell spans every year's copy of its month, and
    // `month_filter` alone (with `year_filter` left NULL) is exactly that
    // grouping, so two affected dates in the same calendar month of
    // different years collapse onto one period here.
    //
    // `refreshSimpleStatsCache` narrows by these (#1178). Narrowing was
    // blocked until #1178 purely mechanically: `stats_spine`'s month-squashed
    // branch used to ignore `month_filter` and emit all 12 calendar cells
    // whatever was asked for, so 11 spurious zero cells came back per call
    // and collided across the per-period fan-out.
    stamp({
      group_by_time_period: 'month-squashed',
      periods: periodsTouched((date) => `2000-${date.slice(5, 7)}-01`)
    }),

    // Year: every distinct year touched, as first-of-year ISO dates.
    stamp({
      group_by_time_period: 'year',
      periods: periodsTouched((date) => `${date.slice(0, 4)}-01-01`)
    })
  ];
}
