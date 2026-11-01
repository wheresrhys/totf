# modules/stats — Claude context

Scoped doc for this module. See the root [`CLAUDE.md`](../../CLAUDE.md) for app overview, tech
stack, and the "Module conventions" section this module follows.

## What this module does

Everything to do with `SimpleStatsCache`/`SimpleStatsCacheBySpecies` — the materialized,
period-local stats cache every summary/species/session page reads from instead of calling the
live `core_stats`-family RPCs directly (see `app/CLAUDE.md`'s "Period-local stats come from the
cache tables"). Three concerns live here:

- **Read** (`lib/stats-cache.ts`, `lib/stats-cache-fetch-pool.ts`) — `readStatsCacheRows` is the
  generic `SELECT *` reader against either cache table; `StatsCacheFetchPool` de-dupes/caches reads
  per request.
- **Event building + dispatch** (`lib/stats-cache-events.ts`, `lib/dispatch-stats-cache-events.ts`)
  — after an import, `buildStatsCacheRefreshEvents` turns the import's affected dates/species into
  up to 5 `StatsCacheRefreshEvent`s (one per temporal unit), and `dispatchStatsCacheRefreshEvents`
  sends them to the queue (`app/lib/queue-dispatch.ts`'s `inline`/Vercel-queue split).
- **Refresh** (`lib/refresh/`) — the queue consumer side: `refreshSimpleStatsCache` reads the four
  `stats_cache_*_metrics` RPCs, merges their per-cell rows, and writes the result back to the cache
  tables. See "The refresh pipeline" below.

## Barrel split: `index.ts` vs `browser.ts`

`browser.ts` re-exports only the client-safe surface (`types`, `readStatsCacheRows`,
`globalStatsCacheFetchPool`, `StatsCacheFetchPool`); `index.ts` re-exports everything `browser.ts`
does plus `dispatchStatsCacheRefreshEvents`/`refreshSimpleStatsCache`/
`runSimpleStatsCacheRefreshPass`, which pull in `@vercel/queue` and the full `lib/refresh/`
pipeline and so are server-only.

**Any file reachable from a Client Component must import from `@/modules/stats/browser`, never
the bare `@/modules/stats` barrel.** `modules/highlights`'s `hg2.ts` and the species page's
`SpDemographicsTab.tsx` (`'use client'`) both once broke the dev build (`Module not found:
@opentelemetry/api`) by importing the full barrel and dragging the queue dependency into the
browser bundle. Server-only call sites (`app/api/import/route.ts`,
`supabase/scripts/import-csv.ts`, the stats-cache-refresh-window queue route) import the full
`@/modules/stats` barrel.

## Directory map

```
modules/stats/
  index.ts / browser.ts    # the two barrels above
  types.ts                 # every type shared across more than one file in this module
  lib/
    stats-cache.ts                 # readStatsCacheRows
    stats-cache-fetch-pool.ts      # StatsCacheFetchPool
    stats-cache-events.ts          # buildStatsCacheRefreshEvents
    dispatch-stats-cache-events.ts # dispatchStatsCacheRefreshEvents
    refresh/                       # the refresh pipeline — see below
      rpc-params.ts        # metric-RPC filter building, day-window batching, narrowing rules
      db-call-logging.ts   # runStatsCacheDbCall — logs every DB touchpoint of a refresh pass
      fetch-metric-rows.ts # fans one metric RPC out across a filter-object list, concurrently
      merge-metric-rows.ts # merges the 4 metric RPCs' rows by cell key; anomaly recording
      write-cache-rows.ts  # chunked upserts to both cache tables; dead-lettering
      run-refresh-pass.ts  # runSimpleStatsCacheRefreshPass / refreshSimpleStatsCache — the
                            # orchestrator, including the one Sessions.visit_date preflight query
                            # day-unit batching needs (fetchGroupSessionDates — no file of its
                            # own, it has exactly one caller)
```

## The refresh pipeline (`lib/refresh/`)

Populates `SimpleStatsCache` (#1144, retrofitted by #1162) — write side for the four read-only
"metric-group" RPCs #1145/#1146/#1148/#1149 (`stats_cache_basic_session_metrics`,
`stats_cache_biometrics_metrics`, `stats_cache_bird_age_metrics`,
`stats_cache_encounter_age_metrics`). `refreshSimpleStatsCache` merges their per-cell rows in TS,
then writes them to the cache's `*BySpecies` table with one native `supabase-js` `.upsert()`
naming that table's single unique constraint as its conflict target (#1169 split the cache into a
species and a non-species table precisely so there is exactly one such constraint to name — see
`"SimpleStatsCache".sql`). It also dead-letters any cell it couldn't write to
`FailedStatsCacheRefreshes` (#1167), tagged with the `cache_table` the refresh was targeting.

The queue consumer calling this per dispatched temporal-unit event is
`app/api/queues/stats-cache-refresh-window/route.ts` (#1155) — `runSimpleStatsCacheRefreshPass`
only refreshes one temporal unit per call, it does not loop over temporal units itself.
`refreshSimpleStatsCache` runs that function twice per call, sequentially (not `Promise.all`,
deliberately — see `run-refresh-pass.ts`'s own doc comment), once for the species-grouped pass
(writes `SimpleStatsCacheBySpecies`) and once for the non-species-grouped pass (writes the
all-species-combined `SimpleStatsCache`).

There used to be a sibling **lifetime-relative** half, `refreshComplexStatsCache` →
`ComplexStatsCache`/`ComplexStatsCacheBySpecies` (#1147/#1150/#1151/#1169), whose production write
call site had already been disabled (commit `c36f4cc9`) before the cache and both tables were
removed entirely. If a lifetime-relative cache is ever needed again, mine that history rather than
re-deriving the narrowing rules from scratch — and note that `rpc-params.ts`/`merge-metric-rows.ts`
no longer carry the `narrowingTemporalUnits` parameter that used to let a second cache share these
functions under a different narrowing rule; that parameter was dead code by the time of the
`lib/refresh/` split (nothing but `SIMPLE_NARROWING_TEMPORAL_UNITS` was ever passed), so reinstate
it rather than assuming it's still there.

**Narrowing**, i.e. only recomputing the periods an import actually touched rather than a group's
whole history: every temporal unit but `all-time` narrows by `periods`, in two different ways (see
`rpc-params.ts`'s `buildSimpleMetricRpcParamsList`) — `day` by a `from_date`/`to_date` window,
batched by real session-date span (`batchPeriodsBySessionDateSpan`) so a sparse touched-period list
(e.g. a group's very first and very last session ever) can't force one window spanning the entire
history; `month`/`year`/`month-squashed` by one exact-filtered RPC call per distinct touched period
(#1176/#1178). Independently, the species-grouped pass also narrows its *write* by `speciesIds` when
given (`filterToTouchedSpecies`) — see `RefreshSpeciesNarrowing`'s own doc comment in `types.ts` for
why that's write-only, never a read narrowing.

## Testing

`lib/refresh/__tests__/rpc-params.test.ts` covers the one pure, cleanly-separable function
(`batchPeriodsBySessionDateSpan`) directly. Everything else about the refresh pipeline is
exercised as a black box through `refreshSimpleStatsCache`/`runSimpleStatsCacheRefreshPass` in
`lib/refresh/__tests__/run-refresh-pass.test.ts` — internal functions (`mergeSimpleMetricRows`,
`buildSimpleMetricRpcParamsList`, the writers, etc.) have no test file of their own and aren't
meant to; that one integration suite is deliberately not split further per-file, since doing so
would force artificial mocking boundaries around a single pipeline.
