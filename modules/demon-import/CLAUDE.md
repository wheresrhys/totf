# modules/demon-import — Claude context

Scoped doc for this module. See the root [`CLAUDE.md`](../../CLAUDE.md) for app overview, tech
stack, and the "Module conventions" section this module follows.

## What this module does

The whole DemOn CSV-import pipeline — everything that turns one uploaded CSV row into staging and
domain-table rows — shared verbatim by both import entry points: the web route
(`app/api/import/route.ts`) and the CLI importer (`supabase/scripts/import-csv.ts`). Neither entry
point duplicates any of it; they differ only in how they read the CSV, how they rate-limit, and
how they report progress.

A row travels three stages, in this order:

1. **Staging** (`lib/demon-records-batch-writer.ts`) — `DemonRecordsBatchWriter` writes every row
   into `DemonRecords` in batched multi-row upserts (#960), so a non-lossy record of what was
   submitted exists *before* the row is interpreted. A row's promise resolves when its whole batch
   lands, not when it was buffered.
2. **Domain-table writes** (`lib/encounter-batch-writer.ts`) — `EncounterRowBatchWriter`
   interprets a chunk of rows into Species, Birds, Locations, Sessions and Encounters with one
   multi-row upsert per entity type in FK dependency order (#1139), then reconciles duplicate
   Encounters once at the end of the run (#1219): rows that collide on
   `encounters_bird_id_location_id_visit_date_unique` — most often the same bird logged twice in
   one day, a slip of the pen or a bird seen at the start and end of a round — are folded into a
   single row by ordering the colliding records by `capture_time` ascending and taking the first
   non-null value per column, so the chronologically first record keeps everything it actually
   recorded and any blank field is filled in from the later duplicate. Keying the precedence on
   `capture_time` rather than on arrival order is what makes the rule commutative and associative:
   a set of duplicates folded pairwise gives the same result whatever order they're folded in,
   independent of which chunk happened to land first. This is also why `capture_time` has to be
   written in one canonical form (`normaliseCaptureTime` in `lib/row-validation.ts`) — Postgres
   hands a `time without time zone` back as `'08:30:00'`, and `'08:30' < '08:30:00'` as strings, so
   comparing a CSV row's time against one read back out of the database needs both sides
   normalised the same way.
3. **Job tracking** (`lib/import-job-tracker.ts`) — `ImportJobTracker` opens the run's
   `ImportJobs` row and drives every later transition on it (#961): affected dates mid-run,
   then one terminal transition, plus one column per temporal unit for the stats-cache refresh
   outcome (#1154). `ImportJobRowCounts` (`types.ts`) names its four fields after the
   `ImportJobs` columns the web route's `ImportCompleteMessage` already uses one-for-one; the CLI
   importer's `ImportRowCounts` carries the same four numbers under different names and maps onto
   this shape at the call site. A skipped (ringless/casualty) row is deliberately not persisted —
   `completeImportJob` only writes `rows_processed`/`rows_successful`/`rows_failed` — so `skipped`
   is in-memory for the current run only. `StatsCacheRefreshOutcome` narrows `ImportJobStatus` to
   just `'succeeded'`/`'failed'`, since a refresh setter should never be asked to write the table's
   `'in_progress'` default or the unreachable `'timed_out'`.

`lib/process-encounter-row.ts`'s `processEncounterRow` is the join between stages 1 and 2 — it
awaits a row's staging batch before handing the row to the domain-table writer, which is the point
of #959: whatever happens to a row's domain-table write, a record of what was submitted for it
already exists.

Two lookup helpers sit alongside the pipeline:

- **Ring sequences** (`lib/ring-sequences.ts`) — `createRingSequenceLookup` finds the
  `RingSequences` row a ring number falls inside (prefix + the `first_index`/`last_index` numeric
  window) and `createRingSequenceLinker` records the link in the per-group `RingSequences_Birds`
  join table (#703). The import never *creates* a sequence (removed in #695 — it slowed imports
  catastrophically); only a `'N'` record looks one up, and an unmatched ring is simply left
  unassigned.
- **Locations** (`lib/locations.ts`) — `getDistinctLocationNames` +
  `findUnrecognisedLocationNames` are run by both entry points over a whole CSV *before* anything
  is written, aborting the import if any `loc_id` has no `Locations` row for the group. An
  unrecognised site code is far more often a group re-coding an existing site (#1048: `972` →
  `CES972`, which would silently fork a second Locations row and re-import every encounter under
  it) than a genuine new site, and the caller can't tell which.

`StatsTemporalUnit` is **not** this module's type: it lives in
[`app/models/temporal-unit.ts`](../../app/models/temporal-unit.ts) and
`lib/import-job-tracker.ts` imports it directly from there rather than through this module's
`types.ts` — the same rule `modules/stats` follows (see the root `CLAUDE.md`'s "Module
conventions"). Dispatching the stats-cache refresh an import implies is likewise *not* here;
that's `modules/stats`' `dispatchStatsCacheRefreshEvents`, called by each entry point after
`completeImportJob`. This module only provides somewhere to record the outcome.

## No `browser.ts` split

One barrel, `index.ts`. Every caller is a server component, API route or Node script — nothing in
this pipeline is reachable from a Client Component, so there's no client-safe subset to separate
out the way `modules/stats` has to. The barrel re-exports only what's actually read outside the
module: `DemonRow`, `StatsCacheRefreshOutcome`, `CasualtyEncounterError`,
`findUnrecognisedLocationNames`, `getDistinctLocationNames`, `createRingSequenceLinker`,
`createRingSequenceLookup`, `ImportJobTracker`, `DemonRecordsBatchWriter`, `EncounterRowBatchWriter`
and `processEncounterRow`. Everything else the module's files export (`DemonColumnNames`,
`ImportJobRowCounts`, `convertDateFormat`, `isRinglessRingNo`, `normaliseCaptureTime`,
`transformEmptyStringsToNull`, the two `DEFAULT_*_SIZE`/`DEFAULT_*_CHUNK_SIZE` constants,
`mergeDuplicateEncounters`) is reached only by other files inside the module (or their own tests)
importing it directly by path, never through the barrel — so it stays off `index.ts`. The sessions,
resightings, pulli and session-detail pages,
and `supabase/scripts/generate-snapshots.ts` used to also read this module's
`RESIGHTING_RECORD_TYPES` constant; they now read `Encounters.is_resighting` (a generated column,
see `supabase/CLAUDE.md`) instead, so that constant is gone.

## Directory map

```
modules/demon-import/
  index.ts     # the barrel — re-export only, no logic
  types.ts     # DemonColumnNames, DemonRow,
               # ImportJobRowCounts, StatsCacheRefreshOutcome
  lib/
    row-validation.ts            # CasualtyEncounterError, isRinglessRingNo,
                                 # transformEmptyStringsToNull, convertDateFormat,
                                 # normaliseCaptureTime — the per-field normalisation
                                 # every other file in the module applies
    locations.ts                 # getDistinctLocationNames, findUnrecognisedLocationNames
    ring-sequences.ts            # createRingSequenceLookup, createRingSequenceLinker
    import-job-tracker.ts        # ImportJobTracker
    demon-records-batch-writer.ts # DemonRecordsBatchWriter + buildDemonRecord (stage 1)
    encounter-batch-writer.ts    # EncounterRowBatchWriter, mergeDuplicateEncounters,
                                 # buildEncounterInsert, naturalKeyOf (stage 2)
    process-encounter-row.ts     # processEncounterRow — the stage 1 → stage 2 join
```

`lib/encounter-batch-writer.ts` is by far the largest file here and deliberately stays one file:
it is a single chunked write pipeline whose dedup, id-resolution and reconciliation steps are only
meaningful against each other's state, the same reasoning `modules/stats`'
`lib/refresh/run-refresh-pass.ts` applies to itself. `buildEncounterInsert`/`naturalKeyOf`/
`buildDemonRecord` are module-private — exported from neither the barrel nor their own files.
Chunking forces three correctness requirements, not just an optimisation: entity-type dedup per
chunk (Postgres rejects a multi-row `ON CONFLICT DO UPDATE` that targets the same key twice), id
resolution by natural key rather than array position (a multi-row upsert's returned row order
isn't guaranteed to match the request), and chunk-level failure (a failed bulk upsert fails every
row buffered in that chunk, the same granularity `DemonRecordsBatchWriter` uses for its own
batches, #959).

## Design choices

A few decisions here aren't obvious from the code alone:

- **`ImportJobTracker` is a class, not a `create*` factory** like `createRingSequenceLookup`/
  `createRingSequenceLinker` above. Those each expose one operation; `ImportJobTracker` exposes
  six variations on the same two-line `.update(...).eq('id', …)` against the same `ImportJobs`
  table, which a class groups around the shared Supabase client and shared `updateImportJob`
  plumbing without six copies of either. Every operation is deliberately independent — recording
  one temporal unit's stats-cache refresh outcome never touches `status`, `affected_dates` or the
  other four temporal units' columns, and vice versa — because the whole point of the table is
  that "the rows all imported but the monthly stats never refreshed" has to stay visible rather
  than collapsing into "import succeeded".

- **`DemonRecordsBatchWriter` batches interleaved with row processing, not as a phase of its
  own.** A row's own promise resolves as soon as *its* batch lands, not once the whole run is
  staged, so the import keeps the per-row concurrency it relies on — rows in an earlier batch may
  well be writing to the domain tables while a later batch is still in flight. This is also why
  `writeDemonRecord` must never sit behind the run's rate limiter: a batch only fills if every row
  can reach it promptly, and throttling that means a batch larger than the concurrency cap can
  never fill. `EncounterRowBatchWriter` is the same shape one level up — its rate limiter wraps
  each *chunk flush*, never `writeEncounterRow` itself, for the identical reason.

- **`reconcileDuplicateEncounters` runs in plain TypeScript, once, after every chunk has landed —
  not as a Postgres `ON CONFLICT DO UPDATE`.** During the run, chunk flushes race each other
  (`concurrency: 30` on the web route), so the stored row for a duplicated key is simply whichever
  chunk landed last; the reconciliation pass runs only after `flushRemaining` has awaited every
  chunk, so there's no concurrent writer left to lose an update to and no need for the merge to be
  atomic with the insert. Duplicates are detected from the Encounters rows themselves — what the
  run wrote, plus whatever `readStoredEncounters` found already stored for the same key — rather
  than by re-reading `DemonRecords`: staging is keyed on
  `(ringing_group_id, ring_no, encounter_date, encounter_time)`, which omits the location that
  `encounters_bird_id_location_id_visit_date_unique` includes, so a staging-based query would have
  to re-resolve `bird_id`/`location_id`/`session_id` out of `raw_row` just to tell a real collision
  from a bird legitimately caught at two sites in one day — the Encounters rows are already keyed
  on exactly the constraint being reconciled. A failure here is logged and swallowed rather than
  thrown: every row of the import has already been written, and the worst case is that a
  duplicated key keeps the last-write-wins row it would have had anyway — failing the whole import
  job over it would misreport a run that did import everything.

## Testing

Unit tests are colocated per source file (`lib/__tests__/*.test.ts`), with the Supabase client
mocked entirely — none of them touch a real schema. Shared scaffolding lives in
`lib/__tests__/helpers/`:

- `demon-rows.ts` — `makeDemonRow`/`makeDemonRows`, a full valid CSV row plus a numbered run of
  them.
- `promise-settlement.ts` — `trackSettlement` (has this promise settled, without awaiting it) and
  `settlePendingMicrotasks`. Both writers' "resolves only once its batch has landed" contract is
  only observable through these.
- `staging-writer.ts` — a `DemonRecords` mock client whose upsert settles only when a test says
  so, plus `makeStagingWriter`.
- `encounter-row-writer.ts` — a domain-tables mock client that answers each bulk upsert with the
  natural-key columns it selected plus a table-scoped id, exactly as PostgREST would, plus
  `makeEncounterRowWriter` and `neverRunningChunkLimiter`.

The DB integration suite stays **outside** this module, in
[`supabase/__tests__/demon-import.test.ts`](../../supabase/__tests__/demon-import.test.ts) (#464):
it runs the real `EncounterRowBatchWriter` against the real Postgres schema, because this module
leans entirely on the DB's unique constraints to decide insert-vs-update, so a drift between a
conflict target here and the actual constraint can only fail there. It imports the barrel like any
other outside caller. `supabase/__tests__/db-constraints.test.ts` asserts the same constraints
directly without importing this module at all.

This module is one of the two `@mutates` E2E trigger paths behind the `e2e-exclusive` ticket label
— `e2e/mutating-spec-triggers.json` lists `"modules/demon-import/"`, so a change anywhere under
it selects `e2e/authenticated/import.spec.ts`. See `supabase/CLAUDE.md`'s "E2E `@mutates` /
exclusive-resource mechanics".
