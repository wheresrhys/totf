# modules/stats — Claude context

Scoped doc for this module. See the root [`CLAUDE.md`](../../CLAUDE.md) for app overview, tech
stack, and the "Module conventions" section this module follows.

## What this module does

Everything to do with `SimpleStatsCache`/`SimpleStatsCacheBySpecies` — the materialized,
period-local stats cache every summary/species/session page reads from instead of calling the
live `stats_cache_*_metrics`-family RPCs directly (see `app/CLAUDE.md`'s "Period-local stats come from the
cache tables"). Three concerns live here:

- **Read** (`lib/stats-cache.ts`, `lib/stats-cache-fetch-pool.ts`) — `readStatsCacheRows` is the
  generic `SELECT *` reader against either cache table; `StatsCacheFetchPool` de-dupes/caches reads
  per request.
- **Event building + dispatch** (`lib/stats-cache-events.ts`, `lib/dispatch-stats-cache-events.ts`)
  — after an import, `buildStatsCacheRefreshEvents` turns the import's affected dates/species into
  up to 5 `StatsCacheRefreshEvent`s (one per temporal unit), and `dispatchStatsCacheRefreshEvents`
  sends them to the queue (`app/lib/queue-dispatch.ts`'s `inline`/Vercel-queue split).
  `dispatchManualStatsCacheRegenerateEvent` is the import-less counterpart — see
  "Manual regenerate events" below.
- **Refresh** (`lib/refresh/`) — the queue consumer side: `refreshSimpleStatsCache` reads the four
  `stats_cache_*_metrics` RPCs, merges their per-cell rows, and writes the result back to the cache
  tables. See "The refresh pipeline" below. Its read-only sibling,
  `findSimpleStatsCacheDiscrepancies`, reuses the same building blocks to *compare* rather than
  write — see "Finding cache discrepancies" below.

`StatsTemporalUnit` — the 5-value temporal-unit vocabulary (`day`/`month`/`year`/
`month-squashed`/`all-time`) — is **not** this module's type and is neither defined nor
re-exported here. It lives in [`app/models/temporal-unit.ts`](../../app/models/temporal-unit.ts),
which derives it from the Postgres `temporal_unit` enum and also holds the narrower app-facing
vocabulary it's named apart from: `TemporalUnit` (3 values — `day`/`month`/`year`) and
`ExactFilterTemporalUnit` (`month`/`year`/`month-squashed`, used by `lib/refresh/rpc-params.ts`).
**Every file that needs one of those imports it directly from `@/app/models/temporal-unit`** —
files inside this module included, and `types.ts` is not a staging post for it. That is the one
exception to the "types shared across more than one file live in `types.ts`" rule in the root
`CLAUDE.md`'s "Module conventions": the rule governs types this module *owns*, and re-exporting a
type it doesn't own just hides the canonical source behind an extra hop. Derive any new
temporal-unit-shaped type from those rather than hand-typing the union again — `types.ts`'s
`StatsCacheRefreshRpcParams.group_by_time_period` and `MetricRpcParams.group_by_time_period` are
both `Exclude<StatsTemporalUnit, 'all-time'>` for exactly that reason.

## Barrel split: `index.ts` vs `browser.ts`

`browser.ts` re-exports only the client-safe surface (`types`, `readStatsCacheRows`,
`globalStatsCacheFetchPool`, `StatsCacheFetchPool`); `index.ts` re-exports everything `browser.ts`
does plus `dispatchStatsCacheRefreshEvents`/`dispatchManualStatsCacheRegenerateEvent`/
`refreshSimpleStatsCache`/`findSimpleStatsCacheDiscrepancies`, which pull in
`@vercel/queue` and the full `lib/refresh/` pipeline and so are server-only.
`runSimpleStatsCacheRefreshPass` (the single-pass half `refreshSimpleStatsCache` calls twice) has
no external caller and isn't re-exported from either barrel — module-internal only.

**Any file reachable from a Client Component must import from `@/modules/stats/browser`, never
the bare `@/modules/stats` barrel.** `modules/highlights`'s stats-fetching pipeline file (now
`lib/pipeline/fetch-scoped-stats.ts`) and the species page's
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
                           # — note `StatsTemporalUnit` is neither defined nor re-exported
                           # here; import it from app/models/temporal-unit (see above)
  lib/
    stats-cache.ts                 # readStatsCacheRows
    stats-cache-fetch-pool.ts      # StatsCacheFetchPool
    stats-cache-events.ts          # buildStatsCacheRefreshEvents
    dispatch-stats-cache-events.ts # dispatchStatsCacheRefreshEvents +
                                   # dispatchManualStatsCacheRegenerateEvent
    refresh/                       # the refresh pipeline — see below
      rpc-params.ts        # metric-RPC filter building, day-window batching, narrowing rules
      db-call-logging.ts   # runStatsCacheDbCall — logs every DB touchpoint of a refresh pass
      fetch-metric-rows.ts # fans one metric RPC out across a filter-object list, concurrently
      merge-metric-rows.ts # merges the 4 metric RPCs' rows by cell key; anomaly recording
      write-cache-rows.ts  # chunked upserts to both cache tables; dead-lettering
      run-refresh-pass.ts  # runSimpleStatsCacheRefreshPass / refreshSimpleStatsCache — the
                            # orchestrator, including the one Sessions.visit_date preflight query
                            # day-unit batching needs (fetchGroupSessionDates — no file of its
                            # own, exported for the discrepancy finder's identical preflight)
      find-cache-discrepancies.ts  # findSimpleStatsCacheDiscrepancies — the read-only
                                   # comparator sibling of run-refresh-pass.ts; see below
```

## Manual regenerate events (#1379)

Not every refresh event comes from an import. `dispatchManualStatsCacheRegenerateEvent`
(`lib/dispatch-stats-cache-events.ts`) takes a `ManualStatsCacheRegenerateParams` —
`{groupId, temporalUnit, periods?, speciesIds?}`, a scope the caller has already decided — and
dispatches **exactly one** `StatsCacheRefreshEvent` through the same topic/dispatcher the import
path uses. That's for a human- or UI-triggered regenerate of a particular corner of the cache
(#1374's consistency checker), where there is no `ImportJobs` row and no "dates this import
touched" to derive anything from. Four things it's worth knowing before touching it:

- **It deliberately doesn't call `buildStatsCacheRefreshEvents`.** That function derives its whole
  scope from an import's affected dates and always emits up to five events, one per temporal unit.
  A manual caller wants one temporal unit with a scope it names itself, so the event is built
  directly.
- **`periods` is stamped onto `rpcParams.periods` *and* the top-level `affectedDates`.** The
  consumer's `deriveStatsCacheRefreshParams` reads the former for `month`/`year`/`month-squashed`
  and the latter for `day`; stamping both means its per-temporal-unit branching needs no
  manual-event special case at all. Omit `periods` entirely for a full-width regenerate of that
  temporal unit (which, for a narrowing unit, refreshes *nothing* — see "Narrowing" below, same
  trap the import path has).
- **`StatsCacheRefreshEvent.importJobId` and `.affectedSpeciesIds` are both optional** because of
  this path. A manual event omits `importJobId`, and the consumer
  (`app/api/queues/stats-cache-refresh-window/route.ts`) returns after the refresh rather than
  calling `markStatsCacheRefreshed` — there is no row to write to. It omits
  `affectedSpeciesIds` when the caller wants every species, which flows straight through to
  `RefreshSpeciesNarrowing.speciesIds`' existing "`undefined` = no narrowing" convention rather
  than a new one. Every import-derived event still carries both.
- **A dispatch failure is caught and logged, not thrown**, matching
  `dispatchStatsCacheRefreshEvents`' precedent — so a caller gets no signal that the regenerate
  didn't happen. If a future app-facing endpoint needs to report that to a user, the rethrow
  belongs here rather than being worked around at the call site.

## The refresh pipeline (`lib/refresh/`)

Populates `SimpleStatsCache` (#1144, retrofitted by #1162) — write side for the four read-only
"metric-group" RPCs #1145/#1146/#1148/#1149 (`stats_cache_basic_session_metrics`,
`stats_cache_biometrics_metrics`, `stats_cache_bird_age_metrics`,
`stats_cache_encounter_age_metrics`). `refreshSimpleStatsCache` merges their per-cell rows in TS,
writes them via native `supabase-js` `.upsert()`s (see "Writing" below), and dead-letters any cell
it couldn't write to `FailedStatsCacheRefreshes` (#1167), tagged with the `cache_table` the refresh
was targeting.

The queue consumer calling this per dispatched temporal-unit event is
`app/api/queues/stats-cache-refresh-window/route.ts` (#1155) — `runSimpleStatsCacheRefreshPass`
only refreshes one temporal unit per call, it does not loop over temporal units itself.
`refreshSimpleStatsCache` runs that function twice per call — once per `groupBySpecies` value,
writing `SimpleStatsCacheBySpecies` then the all-species-combined `SimpleStatsCache` — **sequentially,
not via `Promise.all`**: these RPCs were under active timeout investigation under load, so doubling
concurrent calls for the same group/temporal-unit wasn't the right default.

There used to be a sibling **lifetime-relative** half, `refreshComplexStatsCache` →
`ComplexStatsCache`/`ComplexStatsCacheBySpecies` (#1147/#1150/#1151/#1169), whose production write
call site had already been disabled (commit `c36f4cc9`) before the cache and both tables were
removed entirely. If a lifetime-relative cache is ever needed again, mine that history rather than
re-deriving the narrowing rules from scratch — and note that `rpc-params.ts`/`merge-metric-rows.ts`
no longer carry the `narrowingTemporalUnits` parameter that used to let a second cache share these
functions under a different narrowing rule; that parameter was dead code by the time of the
`lib/refresh/` split (nothing but `SIMPLE_NARROWING_TEMPORAL_UNITS` was ever passed), so reinstate
it rather than assuming it's still there.

**Narrowing** (`rpc-params.ts`), i.e. only recomputing the periods an import actually touched
rather than a group's whole history: every temporal unit but `all-time` narrows by `periods`, in
two ways — `day` by a `from_date`/`to_date` window, batched by real session-date span
(`batchPeriodsBySessionDateSpan`) so a sparse touched-period list (e.g. a group's very first and
very last session ever) can't force one window spanning the entire history; `month`/`year`/
`month-squashed` by one exact-filtered RPC call per distinct touched period. `month-squashed`
narrowing (#1178) required a `stats_spine` fix first (#1177) — before it, an unguarded
`month_filter` branch always emitted all 12 calendar cells, so 11 spurious zero cells collided
across the fan-out. Independently, the species-grouped pass also narrows its *write* by
`speciesIds` when given (`filterToTouchedSpecies`), for every temporal unit including `all-time` —
write-only, since the all-species write has no `species_id` to filter on.

**A day-grain by-species pass no longer writes zero cells (#1385).** `stats_spine` used to cross
every species in range against every session day in range, so the `groupBySpecies` half of a `day`
refresh wrote one zero-count `SimpleStatsCacheBySpecies` row per (species, day) pair the species
was never actually caught on. Its day-grain spine is now sparse on both axes, so the pass writes
only the cells a species was encountered in — fewer rows per window, same values for every row it
still writes. Nothing in this module changed for it; `filterToTouchedPeriods`/`filterToTouchedSpecies`
simply operate on a smaller input, and `mergeSimpleMetricRows`' "a key present in some but not all
4 RPCs is a genuine anomaly" rule still holds because all four metric RPCs share one `stats_spine`
call per filter object and therefore narrow identically. See `supabase/CLAUDE.md`'s "The species
axis is sparse for exactly one parameterisation" for the SQL.

**The caveat that comes with it: this pipeline is upsert-only, so it can never prune a cell that
has already been written.** Neither cache table has a DELETE grant or policy (#1202), by design,
and `write-cache-rows.ts` only ever upserts. A pre-#1385 group's stale zero rows were removed by
that ticket's one-off backfill DML, not by a refresh. That's safe rather than merely tolerated: the
import path only ever accumulates encounters, and `trg_prevent_bird_species_id_change` blocks
species reassignment, so a cell cannot transition non-zero → zero in production. Don't add a DELETE
path here to "fix" a hypothetical that can't arise.

The day-session preflight (`fetchGroupSessionDates` in `run-refresh-pass.ts`) is fetched fresh per
pass rather than once and threaded through both `groupBySpecies` calls — twice the queries, traded
for simpler signatures, since it's one cheap indexed scan.

**Fetching** (`fetch-metric-rows.ts`): each of the 4 metric RPCs is attempted even if an earlier one
failed, so a timeout investigation can see whether every RPC is slow or just one — any failure still
blocks the merge/write phase. Within one RPC, `fetchMetricRows` fires every filter-object call via
`Promise.allSettled` rather than `Promise.all`, so one window failing doesn't stop a sibling window
(different `day` batch) from also being attempted and logged; the first failure's error is rethrown
once every call has settled.

Each call is paginated via `fetchAllPaginatedRows` (`lib/supabase.ts`) — the same mechanism
`readStatsCacheRows` uses for the cache-table side — looping `.range()` until a short page comes
back, rather than one unbounded call. Without this, any filter window whose live result exceeds
PostgREST's 1000-row cap (e.g. a `day`-unit, `bySpecies`-grouped window spanning many dates ×
many species) would silently truncate, and every row past the cap would look like a cached-only
presence mismatch to `findSimpleStatsCacheDiscrepancies`. **Pagination via `.range()` only takes
effect on a GET request** — PostgREST ignores the `Range` header on the client's default POST
call entirely (verified empirically: an unranged and a `Range: 0-0` POST call to the same RPC both
returned every row, HTTP 200, unchanged `Content-Range`; the same call via GET correctly truncated,
HTTP 206) — so every call also passes `{ get: true }`, switching postgrest-js onto GET. That's safe
here because all four `stats_cache_*_metrics` RPCs are `LANGUAGE sql STABLE` with purely scalar
`MetricRpcParams` fields (no arrays/objects), exactly what postgrest-js's GET path serializes to
query params.

**Merging & anomalies** (`merge-metric-rows.ts`): rows are merged by `(species_id, time_period)` key
across the 4 RPCs, which all share one `stats_spine` call — so a key present in some but not all 4
is a genuine anomaly (not an expected gap, per #1164's review), dead-lettered and skipped, never
zero/NULL-filled (every cache metric column but the 8 biometric ones is NOT NULL by design).

**Writing** (`write-cache-rows.ts`): the metric RPCs emit a real NULL `time_period` for the
all-time grain (merging has to keep that NULL to match cells by key); the write step converts it
to the `0001-01-01` sentinel date the NOT-NULL cache columns need. Each cache table has its own
conflict target (`SimpleStatsCacheBySpecies` includes `species_id`, `SimpleStatsCache` doesn't —
it has no such column), and writes are chunked and issued sequentially, matching
`modules/demon-import`'s `DemonRecordsBatchWriter` chaining precedent. Dead-lettering happens after the
cache write (a logging failure must never cost the refresh) and is never narrowed to the touched
periods — a missing cell is a real anomaly regardless of which period it's in.

## Finding cache discrepancies (#1389)

`findSimpleStatsCacheDiscrepancies` (`lib/refresh/find-cache-discrepancies.ts`) is the refresh
pipeline's **read-only sibling**: same scope in, same four metric RPCs, same merge — but instead
of writing the merged cells it reads the materialized cache back via `readStatsCacheRows` and
diffs the two sides, returning only the cells that actually disagree (a
`StatsCacheDiscrepancy[]`). It writes nothing: no cache rows, no `FailedStatsCacheRefreshes`
dead-letters. Its body is deliberately `runSimpleStatsCacheRefreshPass`'s body shape with the
write swapped for a second read, so the two stay easy to diff against each other by eye. Four
things worth knowing:

- **The sentinel-date reversal is the one piece of real logic here.** The metric RPCs emit a real
  `NULL` `time_period` for the `all-time` grain, and `write-cache-rows.ts` converts it to the
  `0001-01-01` `ALL_TIME_SENTINEL_DATE` the NOT-NULL cache columns need. Reading the cache back
  therefore has to convert it *back* to `null` before keying, or every `all-time` cell would
  spuriously fail to match its live counterpart (`null` vs `'0001-01-01'`) and the function would
  report the entire grain as discrepant. The all-species table's absent `species_id` column is
  normalized the same way, to the explicit `null` its non-species-grouped RPC calls return.
- **It does not invent a "give me every period that exists" mode.** Like
  `RefreshSimpleStatsCacheParams`, `FindStatsCacheDiscrepanciesParams`' `periods` is
  required/non-empty for every narrowing temporal unit and ignored entirely for `all-time`; an
  empty `periods` for a narrowing unit short-circuits to `[]` with no RPC calls at all. Working
  out the full set of periods a whole-history report should walk is the orchestrating caller's
  concern (e.g. reading distinct `time_period`s already cached, or driving it off the same
  `periods` an import would have touched) — keeping it out of here avoids guessing at a UI
  concern.
- **Both sides are narrowed with the same two helpers** (`filterToTouchedPeriods`,
  `filterToTouchedSpecies`) so live and cached rows match on identical semantics, and matching
  itself reuses `merge-metric-rows.ts`' own `indexByCell` (and so its private `cellKey`) rather
  than re-deriving the `${species_id}::${time_period}` format. Species narrowing applies only to the
  species-grouped comparison, exactly as the write path does it — the all-species-combined table
  has no `species_id` to narrow on (see `RefreshSpeciesNarrowing`), so applying it there would
  silently filter *both* sides to empty and report no discrepancies at all.
- **`mismatchedFields` is derived from the live row's own keys**, minus the two `MergedCellKey`
  columns — never a hand-maintained field list, so it can't drift from
  `mergeSimpleMetricRows`' column set. It's empty for a presence mismatch (one side `null`),
  which is still reported as a discrepancy rather than dropped; a cell present and identical on
  both sides is never in the result.
- **A presence mismatch against an effectively-empty row is suppressed, not reported.**
  `isEffectivelyEmptyRow` treats a row as empty when every field but
  `CACHE_ROW_BOOKKEEPING_FIELD_NAMES` (`id`/`group_id`/`temporal_unit`/`created_at`/`updated_at`/
  `species_name` — the columns a raw cached row carries that a merged live row never does) is
  `0`/`null`. A materialized cache legitimately omits a touched-but-otherwise-empty period/species
  cell, so a presence mismatch against one isn't a real discrepancy; without excluding all six of
  those bookkeeping columns, a cached row that's genuinely all-zero would still fail the
  every-field-falsy check (a non-null `created_at`/`updated_at` timestamp or `species_name` string
  trips it) and get reported anyway.

## Testing

`lib/refresh/__tests__/rpc-params.test.ts` covers the one pure, cleanly-separable function
(`batchPeriodsBySessionDateSpan`) directly. Everything else about the refresh pipeline is
exercised as a black box through `refreshSimpleStatsCache` in
`lib/refresh/__tests__/run-refresh-pass.test.ts` — internal functions
(`runSimpleStatsCacheRefreshPass`, `mergeSimpleMetricRows`, `buildSimpleMetricRpcParamsList`, the
writers, etc.) have no test file of their own and aren't meant to; that one integration suite is
deliberately not split further per-file, since doing so would force artificial mocking boundaries
around a single pipeline.
