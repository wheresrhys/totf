# Data layer — Claude context

Scoped doc for everything under `supabase/` plus the data-layer scripts in `supabase/scripts/`.
See the root [`CLAUDE.md`](../CLAUDE.md) for app overview, tech stack, and cross-zone shared code
(`lib/supabase.ts`, `lib/demon-import.ts`); see [`app/CLAUDE.md`](../app/CLAUDE.md) and
[`.claude/CLAUDE.md`](../.claude/CLAUDE.md) for the other two zones.

## Database schema

Tables (PascalCase in Postgres, matching generated TypeScript types in `types/supabase.types.ts`):

| Table | Purpose |
|---|---|
| `RingingGroups` | The "users" — ringing organisations |
| `Birds` | Individual birds identified by ring number |
| `Species` | Bird species reference data |
| `Sessions` | A group's visit on a date — one row per `(ringing_group_id, visit_date)` |
| `Encounters` | One bird captured once at one location on one date, with measurements |
| `Locations` | Ringing sites, owned by a group |

Key design notes:
- `Birds.ringing_group_ids` is a Postgres array column (GIN-indexed) — a bird belongs to one or more groups.
- **A `Session` is just a group-day (#1024).** It holds `visit_date` + `ringing_group_id` and
  nothing else, `UNIQUE (visit_date, ringing_group_id)`. It used to be
  `(visit_date, location_id, session_type)`, so one day could carry several Session rows — one per
  site visited, and one per `FULL_GROWN`/`PULLI`/`FIELD_OBSERVATION` bucket within a site. Both of
  those columns are gone:
  - **Where** an encounter happened lives on `Encounters.location_id` (`NOT NULL`, #1015). A
    group-day spanning several sites is now one Session whose encounters point at several
    `Locations`.
  - **What kind** of record it is is re-derived per encounter from `record_type`/`age_code`/`is_juv`
    wherever it's still wanted — see `app/(routes)/sessions/page.tsx` (the FULL_GROWN-equivalent
    filter) and `queries/Encounters/pulli-encounters.ts`. No stats RPC buckets on it at all any more
    (see the `record_type`-filter note below).
  - `ringing_group_id` is written directly by `lib/demon-import.ts`. The
    `trg_set_session_generated_fields` trigger that used to derive it from `Sessions.location_id` is
    retired, and `supabase/__tests__/sessions-schema.test.ts` pins both columns and the trigger as
    gone.
- `Encounters` carries its own `location_id`/`visit_date` (both `NOT NULL`, #1015) alongside
  `session_id`, and since #1024 they are the only record of where/when an individual encounter
  happened. They are also what its uniqueness keys on —
  `encounters_bird_id_location_id_visit_date_unique`, repointed off `(bird_id, session_id)`: with a
  Session covering a whole group-day, a `session_id` key would have meant "one encounter per bird
  per group per day" and silently merged a bird caught at two sites on one day. `lib/demon-import.ts`
  conflict-targets the same three columns. Any new `Encounters` row (test fixtures included) must
  supply both; `supabase/__tests__/rpc-functions/helpers/encounter-fixtures.ts` defaults
  `visit_date` off the Sessions row (`readTestSessionDate` / `withSessionDate`) and `location_id`
  off the location its session was created for, so most fixtures need neither explicitly.
- Several fields are populated by triggers (e.g. `proven_age` on Birds, timestamps on Sessions/Encounters).
- Complex queries are exposed as Postgres RPC functions (e.g. `core_stats`, `notable_retraps`, `find_discrepencies`).
- Database types are auto-generated: run `npm run db:types` after schema changes. Never edit `types/supabase.types.ts` by hand.

### Companion stats RPCs and shared plumbing (`core_stats` / `demographics_stats`, #800/#877)

`core_stats` and `demographics_stats` (a new-adult count, young-trends derivations and #843's
returning-age buckets, split into its own RPC rather than folded into `core_stats`' already-large
single query — for query-plan simplicity and to leave `core_stats`' existing columns untouched)
share the same input
signature (`species_name_filter, from_date, to_date, ringing_group_filter, group_by_species,
group_by_time_period`) and both build on the same underlying logic via `stats_raw_encounters` /
`stats_spine` / `stats_encounter_age_classification` / `stats_bird_age_bucket` — internal utility
RPCs holding the windowed-row-source / grouping-spine / per-encounter-classification /
per-bird-bucket-resolution logic previously duplicated inline in `core_stats`. Each top-level
RPC calls every utility it needs exactly once and materializes the result into a local CTE (reused
by every downstream reference in that RPC), so the base tables aren't rescanned once per downstream
CTE — but a utility RPC that itself depends on another (e.g. `stats_bird_age_bucket` →
`stats_encounter_age_classification` → `stats_raw_encounters`) does re-derive that dependency
independently per call site, so a top-level RPC needing several layers (e.g. `demographics_stats`
needing `stats_spine` + `stats_encounter_age_classification` + `stats_bird_age_bucket`) re-scans the
base tables a small constant number of times rather than once — accepted as a reasonable tradeoff at
this app's data scale; keep an eye on it if a future RPC stacks many more utility layers. Keep the
utility RPCs' bucket/precedence definitions in sync **by hand** with `app/models/encounter.ts`'s
`getAgeClass()` if either changes. `demographics_stats` was originally named `population_stats`
(#800); #877 created the renamed `demographics_stats`/`demographics_stats_result` pair as
byte-identical siblings, #878 migrated every app-code call site onto the new names, and #879
dropped the old `population_stats` function and `population_stats_result` type entirely — the
same three-step pattern used for `core_stats`/`public_core_stats` (#830, see `app/CLAUDE.md`'s
"Public pages and the group summary read-path"). `demographics_stats.new_young_bird_count` was
originally a duplicate of a same-named column on `core_stats` (#800); #824 removed `core_stats`'s
copy (and the corresponding UI series, #817) as unused, so `demographics_stats` now holds the only
`new_young_bird_count` column in the schema.

**"Old timers" no longer exists at any layer (#837).** `demographics_stats` originally carried a
three-way split of the adult cohort — `new_adult_bird_count` / `first_summer_bird_count` /
`old_timers_bird_count`, the latter two resolved by a majority vote over the bird's `(period_year
− 1)` encounters. #855 removed the client-side "Age split" tile that read them and #856 removed the
two columns from `demographics_stats_result`, the `adult_age_split`/`adult_split_counts` CTEs and
the now-unconsumed `bird_year_age_stats` CTE. What survives is `new_adult_bird_count` alone — an
unchanged, non-exhaustive *subset* of `adult_bird_count` (adults whose first-ever year with the
group is the cell's own `period_year`), read by the "Returning vs new" chart (#854). Don't
reintroduce either column or the majority-vote heuristic; `arrivals_stats`' `new_adult` /
`returning_adult` split is the supported way to name the rest of the adult cohort.

`stats_raw_encounters` excludes passive, no-bird-in-hand data so it never leaks into any stats RPC
built on it (#874): it filters out any `Encounters` row whose `record_type` is a resighting/recovery
type — `public.resighting_record_type` (`U`/`F`/`D` — see the DemOn field spec) — by adding the
condition to its `LEFT JOIN ... ON` clause rather than a `WHERE`, so a bird whose only encounters
are resightings still surfaces as a NULL-`encounter_id` row instead of disappearing from the result
entirely. `app/models/db.ts` exports `ResightingRecordType` from the generated enum, and
`lib/demon-import.ts`'s `RESIGHTING_RECORD_TYPES` constant is typed against it — keep that constant
in sync **by hand** if the enum ever changes, the same convention as the age-bucket definitions
above.

**That record_type filter is now the ONLY thing deciding what is "real" data in any stats RPC
(#1021, completed by #1024).** `stats_spine`'s `session_date_range` used to exclude
`FIELD_OBSERVATION` sessions (so a field-observation-only date couldn't stretch the month/year
spine past the range of `FULL_GROWN`/`PULLI` sessions), and `core_stats.session_count` used to be
`COUNT(DISTINCT CASE WHEN session_type = 'FULL_GROWN' THEN visit_date END)`. #1021 removed both,
and #1024 then dropped the `session_type` column itself — along with `stats_raw_encounters`'
`session_type` output column and the two `session_type = 'FULL_GROWN'` filters that survived #1021
in `core_stats`' `session_counts` / `session_effort` CTEs.

Two visible behaviour changes, not refactors, landed across the pair:
- `session_count` is a plain `COUNT(DISTINCT visit_date)`, so a group/period whose history includes
  pulli-only or field-observation-only days reports a HIGHER `session_count` than before #1021.
- `total_effort` / `effort_per_session` / `avg_encounters_per_session` / `max_per_session` /
  `max_new_per_session` now cover every session in a cell (#1024). A pulli-only date used to report
  `session_count = 1` against zero effort; it now reports real effort, and a day's nestling
  captures count toward its effort span and per-session maxima like any other capture. All these
  columns are finally on the same session_type-blind basis as
  `species_count`/`bird_count`/`encounter_count`, which always counted encounters from any
  `session_type`.

**`session_counts` honours `group_by_species`, like every other CTE in `core_stats` (#1049).** It
used to group by a bare `species_id` whatever the caller asked for, so a group-wide call got one row
per `(species, session)` pair rather than one per session — and `max_per_session` ("Busiest
session"), `max_new_per_session` and `avg_encounters_per_session`, all built on top of it, described
the busiest/average *species within* a session rather than the session itself. Prod's `/summary/sep`
reported 39 (its biggest single species) for a 2026 whose busiest session held 62 birds.
`session_count`/`species_count`/`bird_count`/`encounter_count` read `raw_encounters` directly and
were never affected. When `group_by_species` IS true the per-species reading is the wanted one and is
unchanged. `session_effort`/`effort_per_period` have always been species-blind, so `total_effort` and
`effort_per_session` are not species-split even under `group_by_species` — a known asymmetry with
`avg_encounters_per_session`, left as-is.

**Two per-row evaluation traps in `stats_raw_encounters`, both fixed in #947 — don't reintroduce
either.** Because every stats RPC derives this row source (and `core_stats` derives it 4x through
its utility-RPC layering), anything evaluated per row here is paid several times over:

- **`enum_range()` is STABLE, not IMMUTABLE**, so Postgres cannot constant-fold it at plan time.
  Written inline as `= ANY (enum_range(...)::text[])` it was re-evaluated, catalog lookups and
  all, once per `Encounters` row — 81,782 shared buffer hits and ~36-56ms for a 40k-row scan
  versus 1,601 hits and ~7ms once hoisted. It is now spelled `IN (SELECT unnest(enum_range(...)))`,
  which plans as a single hashed SubPlan evaluated once per query. Keep the enum as the source of
  truth — don't "fix" this by inlining a literal `'U'/'F'/'D'` list.
- **There is no `date_trunc(text, date)` overload**, so `date_trunc('month', sess.visit_date)`
  silently resolved to `date_trunc(text, timestamptz)` — STABLE and timezone-dependent. The casts
  to `::timestamp` on `session_month`/`session_year` pick the IMMUTABLE overload, and `session_day`
  is now just `sess.visit_date` (truncating a `DATE` to a day is the identity). Same values, and
  strictly more deterministic since the result no longer depends on the connection's `TimeZone`.

`core_stats` likewise reads `session_day`/`session_month`/`session_year` straight off its
`raw_encounters` CTE instead of re-deriving them from `visit_date` in `session_counts` /
`effort_per_period`. Together these took `core_stats` from a ~976ms to a ~643ms median on a
40k-encounter / 15,000-output-row benchmark, with shared buffer traffic down from ~325k to ~2.2k.

Note also what #947 ruled **out**: `stats_spine`'s internal `raw_encounters` CTE is **not**
duplicated. It has two textual references, so Postgres's `cterefcount > 1` rule always materializes
it — confirmed at every parameterization. What looks like two derivations in an `EXPLAIN ANALYZE`
is the *first* `CTE Scan` on each of two different CTEs (`core_stats`' own and `stats_spine`'s)
carrying its CTE's population cost inclusively. Adding `AS MATERIALIZED` there produces a
byte-identical plan; don't spend time on it again.

`demographics_stats`' four `returning_age_*_bird_count` columns (#843, driving the species page's
"Returning ages" chart) are resolved per bird by a fifth utility RPC,
`stats_bird_returning_age_bucket`. It takes the adult cohort straight from `stats_bird_age_bucket`
(`age_bucket = 'adult'`, the same filter `adult_age_split` applies) and splits it by a
**period-relative** proven age — `period_year − MIN(max_hatch_year)` over the bird's group-scoped
lifetime encounters with `enc_year <= period_year`, the same formula
`trg_encounters_refresh_bird_proven_age` uses but windowed rather than all-time. It deliberately
never reads `Birds.proven_age` itself: that column is live, global and all-time, so joining it onto
a historical cell would stamp today's age onto a ten-year-old row. One narrow carve-out sends a
bird to `'new_unknown_age'` instead of `'1'` — a single first-ever encounter, never precisely aged
(`min_hatch_year = 0`, `trg_set_encounter_generated_fields`' sentinel for an even/imprecise
`age_code`), computing an age of exactly 1, where that 1 is a coding artefact rather than evidence
of return. Don't widen it: a first-ever imprecise encounter computing 2 lands in `'2'` as an
accepted quirk. Note also that an adult-bucketed bird can never compute a period-relative age of 0
(any `age_code > 3` encounter in year V implies `max_hatch_year <= V - 1`), so the four columns in
practice sum to `adult_bird_count`; the RPC's zero/NULL guard is defensive only.

**Reading a bird's lifetime history "as of" a cell's year: merge the streams, don't join per
cell (#932).** `stats_bird_returning_age_bucket` originally joined its per-cell `adult_birds`
relation against each bird's whole per-encounter lifetime history and re-aggregated per cell —
`O(cells_per_bird × lifetime_encounters_per_bird)`. It now collapses the history to one row per
(bird, calendar year), `UNION ALL`s those rows with the cells on the same bird/year axis (an
`event_ord` column ordering a year's history row *before* any cell row for that year, cell rows
carrying a NULL payload so they never perturb the totals), and accumulates once per bird with
`SUM`/`MIN`/`bool_or` over `PARTITION BY bird_id ORDER BY (event_year, event_ord) ROWS BETWEEN
UNBOUNDED PRECEDING AND CURRENT ROW`. Measured 23.4s → 1.2s on a 300-bird × 240-encounter group
grouped by month. Reuse this shape if another RPC needs the same "state as of year Y" lookup —
and note the two alternatives that were measured and rejected: a `LEFT JOIN LATERAL … LIMIT 1`
over the per-year series gets inlined and re-derives the history per cell anyway (8.2s), and a
`MATERIALIZED` + `DISTINCT ON` variant was worse still (24–102s). The reason plan-dependent
shapes are unreliable here is worth remembering on its own: **`adult_birds` used to be estimated
at 1 row when it actually returned tens of thousands** — the `IS NOT DISTINCT FROM` join against a
SQL-function-backed relation defeats the estimator — so anything whose plan hinges on a sane row
estimate is a coin flip. Prefer a shape with no join to mis-plan.

**That same advice was then applied to `adult_birds` itself (2026-09-20).** The cell's
`period_year` is no longer attached to its adult birds by that `IS NOT DISTINCT FROM` join at all:
`cell_period_year`'s one row per cell is `UNION ALL`ed with the adult-bird rows on the same
`(species_id, time_period)` axis (a `cell_event_ord` column distinguishing them, bird rows carrying
a NULL `period_year`), and a single `MAX(period_year) OVER (PARTITION BY species_id, time_period)`
hands every bird row its own cell's value — `PARTITION BY` groups NULLs together, so it is NULL-safe
for the ungrouped case exactly as `IS NOT DISTINCT FROM` was, with no sentinel value. Same
merge-the-streams trick as #932 above, applied to the cell axis instead of the year axis. Two things
motivated it, both measured on a synthetic 164k-encounter / 4-group / 4,000-bird / 60-species
fixture: the join could only ever be a nested loop (neither hashable nor mergeable), costing
`cells × adult-bird-cells` comparisons; and at its `rows=1` estimate the planner was free to
re-execute `cell_period_year`'s whole aggregate once per outer row. The decisive case is **PL/pgSQL
plan caching**, not any exotic data shape: `demographics_stats` is `LANGUAGE plpgsql`, so its
`RETURN QUERY` statement switches to a **generic plan on the 6th execution in a session** — the
worst estimate available — and PostgREST pools connections, so a busy backend reaches it routinely.
Group-wide monthly `demographics_stats` measured ~670ms for executions 1–5 and **77,000ms from
execution 6 onward**; after the rewrite, 520ms and 1,110ms. Keep this in mind for any future
plpgsql RPC: a shape that is merely *lucky* under a custom plan is guaranteed to be tested under a
generic one.

**Every plpgsql RPC in this family now declares `SET plan_cache_mode TO 'force_custom_plan'`
(2026-09-20) — keep it there, and put it on any new one.** An audit of the other three functions,
prompted by the accidental discovery above, found the cliff is not specific to
`stats_bird_returning_age_bucket`'s join: it is inherent to the whole family. These RPCs are
parameterized by the **shape** of their own query, not just by filter values — `group_by_species`
and `group_by_time_period` decide which columns the spine join is keyed on — so the join condition
that constant-folds into a hashable/mergeable equality under a custom plan degrades, under a generic
plan, into an OR of parameter-guarded equalities the planner can only run as a **nested-loop join
filter**. Worse, the generic plan *costs less on paper* (measured on `biometrics_stats`: generic
cost 20,910 / actual 32,112ms, custom cost 7,788,010 / actual 313ms, with 282,674,732 rows removed
by the join filter), because `stats_spine` is a non-inlinable SQL SRF the planner estimates at its
1,000-row default — so `plan_cache_mode = auto` adopts it eagerly. Measured on a 160k-encounter /
4-group / 4,000-bird / 60-species synthetic fixture, executions 1-5 vs 6-8 of the same call in one
session: `biometrics_stats` group-wide monthly 157ms → **10,335ms**, group-wide daily 193ms →
**22,676ms**; `arrivals_stats` group-wide monthly 155ms → 945ms; `demographics_stats` group-wide
monthly ~10,200ms → **~53,400ms** *after* #952's rewrite. `core_stats` does not cliff under
homogeneous group-wide traffic (its generic plan happens to price above the custom average for that
shape) but does through the most ordinary route there is: five cheap ungrouped calls on one pooled
backend flip the cache to generic, and the next group-wide monthly call then takes **44,205ms
instead of 437ms**, for the life of the connection. Forcing custom plans costs nothing measurable —
planning is single-digit milliseconds against hundreds of milliseconds of execution, and executions
1-5 were always custom plans anyway. Don't "optimise" it away, and don't try to fix this by
restructuring the joins instead: sentinel-keyed equality joins would make the generic plan
*tolerable*, but no single plan can be right for a query whose shape is a parameter.

`arrivals_stats` (#858) is a third RPC on the same input signature, answering a question the other
two structurally can't: **arrivals**. `core_stats`/`demographics_stats` compute their bucket
counts per (species, time_period) cell *independently*, so a bird encountered in Jan, Mar and Jun of
one year is counted again in each monthly cell. `arrivals_stats` instead counts each bird exactly
once per calendar year, at whichever cell holds its **first classifiable encounter of that year**,
bucketed by what the bird was at that encounter — `new_adult` / `returning_adult` / `pullus` / `juv`
/ `postjuv` (mutually exclusive and exhaustive, so the five counts sum to the cell's distinct
arriving-bird-year count). The per-bird-year resolution lives in the `stats_bird_first_encounter_of_year`
utility RPC: it drops `'unknown'`-bucket encounters *before* the first-of-year pick (so an
unclassifiable early encounter is skipped in favour of the next classifiable one that year, rather
than losing the bird for that year), takes `DISTINCT ON (bird_id, enc_year)` ordered by
`visit_date, encounter_id` for same-day determinism, and splits `adult` into `new_adult` vs
`returning_adult` off the same unwindowed, `ringing_group_filter`-scoped lifetime-history CTEs
`demographics_stats` uses (`new_adult` iff the arrival year is the bird's first-ever year with the
group — the same first-ever-year rule `demographics_stats.new_adult_bird_count` applies, resolved
per bird-year rather than per cell).
Note the granularity: an "arrival" is a **bird-year**, not a bird, so under an ungrouped query a bird
that arrived in two years contributes two counts.

**Composite-type RETURN QUERY binds by position, not name — this bit us.** A `RETURNS SETOF
<composite type>` function's `RETURN QUERY SELECT ...` binds the SELECT list to the composite
type's columns by ordinal attribute position, never by the `AS "..."` alias text. That position is
only as stable as whatever DDL a given environment's `db:schema:apply` run happens to emit for the
type — confirmed empirically while building `demographics_stats` (as `population_stats`): two
schema-diff runs against the identical schema files produced two *different* physical attribute
orders for a composite type's columns (one matching the file's declared order, one alphabetical),
silently scrambling values into the wrong named output columns with no error either way.
`demographics_stats` and `core_stats`
(the latter retrofitted in #824, the first time `aggregate_stats_result` changed shape since this
note was written) guard against this by wrapping their final projection — `SELECT
(jsonb_populate_record(NULL::the_result_type, to_jsonb(agg))).* FROM (...) AS agg` — which binds
every column by **name** instead, independent of the type's physical attribute order. Use this
wrapper for any new/future `RETURNS SETOF <composite type>` RPC in this codebase.

## Schema files

The authoritative schema lives in `supabase/schema/` as declarative SQL files, organised by type (tables, functions, RLS policies, etc.). Migrations in `supabase/migrations/` are generated from diffs — do not hand-write DDL. The one exception is backfill data migrations: declarative sync only ever emits DDL, never DML, so a schema change that needs existing rows migrated to fit the new shape gets its backfill hand-written and appended after the generated DDL (never interleaved with or replacing it) — see `implement-ticket`'s schema-change guidance for the exact convention (marker comment, PR body section, test mirror).

### Workflow for schema changes

1. Use `npm run db:console:local` to open Supabase Studio and experiment.
2. Run `npm run db:diff` to see what changed vs. prod.
3. Update files in `supabase/schema/` to match the intended state.
4. Run `npm run db:schema:apply` to generate a migration named after the current branch and apply it to the local db
5. You may want to use `npm run db:seed:local` to repopulate the db with test data
6. Inspect the generated migration file before pushing.
7. Commit the generated file(s) under `supabase/migrations/` (no longer gitignored, #862) along
   with your PR, then deploy the schema change to production with `npm run db:migration:push`
   (human-only). There is **no** automated CI deploy of migrations: the
   `.github/workflows/deploy-migrations.yml` job added in #862 was exercised and then deliberately
   removed, so `npm run db:migration:push` is once again the sole deploy path.

**Every `supabase/schema/` change must produce a migration via step 4 above — no exceptions.**
`supabase/migrations/` holds 79+ historical files (~944KB) that are pure noise for almost any
single task, so a `PreToolUse` hook (`.claude/hooks/gate-migration-reads.sh`, wired in
`.claude/settings.json`) denies `Read`/`Grep` access to any migration file that isn't part of the
current branch's diff (or still uncommitted) — keeping that history out of default context. The
migration `db:schema:apply` just generated for your change stays readable automatically, because
it *is* part of the branch's diff; only pre-existing, unrelated migrations are gated. If a task
genuinely needs to inspect a specific historical migration (e.g. to understand a past decision a
ticket must account for), name the file and why to the user and get their sign-off before reading
it — the hook denies rather than asks, since ticket-workflow subagents run non-interactively.

## Developing against production data — read-only by default

All local runs against prod are **read-only**, for humans and Claude alike:

```sh
npm run next:prod              # dev server against prod Supabase, writes blocked
npm run prod:run -- tsx <file> # run any script against prod, writes blocked
```

Requires `op signin` first (human-only). `load-prod-env.sh` signs group JWTs as the
`app_readonly` Postgres role (via `SUPABASE_JWT_ROLE`, see
`supabase/schema/cluster/roles.sql`): it inherits `authenticated`'s privileges but
PostgREST applies `transaction_read_only=on`, so every write fails at the database with
error `25006`. `SUPABASE_SERVICE_ROLE_KEY` lives only in the 1Password vault — it is in
no env file and no code reads it.

To fetch authenticated pages, mint a session cookie without a password: sign a JWT with
`generateGroupJwt(groupId)` (run under `prod:run` so the role is read-only) and pass
`Cookie: TOTFSession=<jwt>`. The role travels inside the cookie, so a readonly cookie is
read-only against any server.

**Prod writes are the explicit exception (human-only, denied to Claude):**
`npm run db:import:prod` and `npm run set-group-password:prod` use
`load-prod-write-env.sh`, which sets `SUPABASE_JWT_ROLE=authenticated` — writes
allowed but still RLS-scoped to the target group. Break-glass
web-import test against prod: `./scripts/load-prod-write-env.sh next dev --turbopack`
(deliberately not an npm script). Migrations are committed and deployed on merge to main by the
supabase github integration.

Note: the deployed Vercel app gets its env directly, with
`SUPABASE_JWT_ROLE=authenticated` set in the Vercel project settings, so production
users are unaffected — groups can still import via the web UI.

## Testing

### DB integration tests (`supabase/__tests__/`)

Test RPC functions and RLS policies against the real local database. Require `npm run db:seed:e2e` to populate test data before running. Use a separate Vitest node environment (no happy-dom).

Tests can run concurrently in separate git worktrees (see `swarm`) against the same shared local
Supabase instance. Any row a write test creates (ring numbers, group names, session/location
names, etc.) must use a random or ticket/branch-specific identifier — never a fixed literal —
so parallel runs never collide on the same row, and so date-based rows never collide in a
group-wide aggregate RPC's results (e.g. `core_stats`) even without a unique
constraint. Use the shared helpers in `supabase/__tests__/test-isolation.ts`
(`randomTestSuffix`, `randomFutureDate`, `addDays`) rather than inventing a new isolation
mechanism per file; extend an existing prefix convention (e.g. `TRIG-TEST-`) with the suffix.

Run manually with `npm run test:integration` (requires local Supabase — `npm run db:start:local`
and `npm run db:seed:e2e`). Not run in CI (no Supabase service there) and not run as a whole by
the pre-push hook — see "Fixture generation and freshness checking" below for the one integration
test the hook does reach.

### Fixture generation and freshness checking

Snapshot fixture data lives in `test-fixtures/snapshots/` and is consumed by app tests
(`app/CLAUDE.md`'s "App tests" covers the consumer side — mocks, the table-cell assertion helper,
etc.) as mock return values, rather than inventing data inline. Fixtures are organised **by data
source, not by the action function that consumes them** (#882): one subdirectory per Postgres RPC
(`core_stats/`, `biometrics_stats/`, `demographics_stats/`, `find_discrepencies/`,
`notable_retraps/`, `ring_sequence_controls/`), or `tables/<TableName>/` for a fixture produced by
a direct PostgREST table query rather than an RPC call. This matters because an action can drift
from the RPC/table it actually calls (#870: `getSpeciesStatsHistory.alpha.robin.json` was named
after the `getSpeciesStatsHistory` action but generated from a raw `core_stats` call) — naming by
source instead of by consumer means a fixture's location can never overstate what it verifies.
Within each directory, filenames follow `<callingGroupOrParams>.<intent>.json` (e.g.
`core_stats/alpha.by-species.json`, `core_stats/alpha.home-page-summary.json`). See the comment
above the relevant block in `supabase/scripts/generate-snapshots.ts`, which documents every
fixture's actual RPC/table and consuming action(s), keeping a fixture's location from silently
drifting from what it actually tests. Regenerate every fixture here with
`npm run db:generate-snapshots` — the sole exception is `synthetic/` (#894), two hand-authored
all-zero/null edge-case fixtures that no real query can ever produce (see that directory's own
`README.md`), which the generator deliberately never touches.

`core_stats`' two companion stats RPCs — `biometrics_stats` and
`demographics_stats` (see "Companion stats RPCs and shared plumbing" above) — went uncovered until
#883, so every test of their row shapes hand-rolled its own literal. Both now have fixtures for
each call shape their real call sites use (`biometrics_stats`: group-wide `by-species`, plus
Robin/Alpha `headline` and `monthly-history`; `demographics_stats`: Robin/Alpha `monthly-history`,
its only call shape), and `biometrics_stats/gamma.by-species.json` is deliberately an empty array —
Gamma has no biometric-eligible encounters — for the no-rows edge case. **Don't reintroduce a
hand-written literal for either RPC's row shape:** base a test's row builder on a fixture row
(spread it, override only the columns the test asserts on) so a column added or removed at the RPC
surfaces in the fixture rather than drifting silently.

**No compound fixtures: one fixture is the raw, unmodified return of exactly one RPC call or one
table query.** Never merge two sources into one file, and never post-process a result before
writing it. A fixture that isn't a verbatim source response can't be checked against any source —
it quietly starts asserting the shape of the merge instead of the shape of the database, which is
the same class of silent drift #870/#890 were about. Where an action joins two sources, write one
fixture per source and let the **consuming test** do the same join the action does, with the same
helper the production read path uses: build a `CoreStatsWithBiometrics` row with
`mergeBiometricsFields` and a `SpeciesStatsRow` with `mergeSpeciesBiometrics` over the two source
fixtures (#821/#823), rather than reading wing/weight columns off a `core_stats` fixture —
`core_stats` stopped carrying its own copies at #827. So `core_stats/alpha.by-species.json` and
`biometrics_stats/alpha.by-species.json` are separate files, and `SppStatsTable`'s test merges
them itself.

**Fixture drift is caught by a pre-push, diff-gated check — but only for the 27 generated
fixtures.** Nothing in the type system notices when an RPC's return shape changes underneath a
fixture consumed via a double assertion (see `app/CLAUDE.md`'s fixture-casting guidance) or via a
JSON import generally, since an imported JSON module is not a fresh object literal so even a
direct assertion still leaves a fixture carrying columns the type no longer declares assignable.
That's how #870's column removal reached `main` with every check green (full investigation in
[#890](https://github.com/wheresrhys/totf/issues/890) / [#884](https://github.com/wheresrhys/totf/issues/884)).
`supabase/__tests__/snapshot-fixture-freshness.test.ts` (#893) closes the gap:

- **What it does.** Runs `generateSnapshots()` into an `fs.mkdtemp` directory and diffs each result
  against the committed copy, failing with the specific per-file differences. Two kinds are
  reported — **column drift** (a column path present on one side only, array indices collapsed to
  `[]`) and **row-count drift** (same columns, different number of rows: a fixture committed at 3
  rows against a database now returning 5 is just as stale). Values are never compared — fixture
  row order and surrogate ids reflect whatever physical order and sequence state the local database
  is in, so value equality would fail on every reseed for reasons unrelated to staleness, whereas a
  column set and a row count are properties of the query and survive a reseed. Stick to that
  column/row vocabulary when touching this code: it's uniform across the module, its tests and its
  failure messages. The comparison helpers and the two fixture inventories live in
  `lib/snapshot-fixtures.ts` (pure, no I/O, unit-tested in the app suite).
- **What it covers.** Exactly the 27 fixtures `supabase/scripts/generate-snapshots.ts` writes
  (`GENERATED_SNAPSHOT_FIXTURES`). It asserts the generator still produces precisely that set, so a
  fixture silently dropping out of the generator fails rather than quietly stopping being checked.
- **What it doesn't.** The 2 permanently hand-authored `synthetic/` fixtures
  (`UNGENERATED_SNAPSHOT_FIXTURES`) — all-zero/null edge cases no real query can ever produce, see
  above. #894 brought every other previously-hand-maintained fixture
  (`core_stats/*.summary-totals.json` / `*.home-page-summary.json`, `ring_sequence_controls/`,
  `tables/Encounters/`, `tables/Species/`) under the generator and deleted four generated-but-
  unconsumed orphans, and #901 split the last two compound fixtures
  (`core_stats/*.yearly-and-monthly-totals.json`, `tables/Birds/arretrap.bird-detail.json`) into
  their raw sources, so this list is now just the two `synthetic/` fixtures rather than an
  open-ended gap. A second coverage test pins the on-disk file list to generated + ungenerated, so
  any future hand-added fixture stays visible rather than implied-covered.
- **When it runs.** Pre-push only — CI has no Supabase service. `supabase/scripts/fixture-freshness-select.sh`
  mirrors `scripts/e2e-select-suite.sh`: it diffs the branch against `origin/main` and runs
  `npm run test:fixture-freshness` only when the diff touches `supabase/schema/`,
  `types/supabase.types.ts`, `supabase/scripts/generate-snapshots.ts`, `lib/snapshot-fixtures.ts`,
  `test-fixtures/snapshots/`, or the test itself. Any branch changing an RPC's shape touches at
  least the first two; most branches pay nothing. It's read-only and writes solely to a temp
  directory, so it stays safe alongside sibling swarm worktrees.

So: if you change an RPC's return shape, run `npm run db:sync:e2e` (not `db:seed:e2e` — see
"Regenerating fixtures reproducibly" immediately below) and commit the regenerated fixtures in the
same PR, and hand-edit the two `synthetic/` ones only if their edge case itself needs to change.

**Regenerating fixtures reproducibly — `db:seed:e2e` vs `db:sync:e2e` (#903).** Both end by
regenerating every generated fixture, but they start from different baselines:

- `npm run db:seed:e2e` is **upsert-only** — it never truncates, so it tops up whatever is already
  in the local database. Fine for routine dev, but *not* a clean baseline: DB integration tests
  write real, undeleted rows into the shared seed groups (e.g. `supabase/__tests__/ring-sequences.test.ts`
  and `triggers.test.ts` write into Gamma/Delta with no teardown), and those rows survive into
  whatever you regenerate next.
- `npm run db:sync:e2e` is `supabase db reset && npm run db:seed:e2e` (the same shape as
  `db:sync:local`) — a destructive reset first, so seeding always starts from an empty database.
  **Use this whenever byte-identical fixture output matters**, i.e. any time you're committing
  regenerated fixtures.

Determinism also depends on the seed importing serially: every table's `id` is `DEFAULT
nextval(...)` rather than `GENERATED ALWAYS AS IDENTITY`, so under concurrent row processing the id
a row gets depends on I/O timing, and the fixtures embed literal ids (e.g.
`tables/Birds/robin-alpha.page-of-birds.json`). `supabase/scripts/seed-e2e-data.ts` therefore calls
`importCSV` from `supabase/scripts/import-csv.ts` in-process at `concurrency: 1`, rather than shelling out
to `npm run db:import:local` at the default 30. That's seeding-only: the CLI (`db:import:{local,prod}`)
and the web import route keep the default concurrency. Two consecutive `db:sync:e2e` +
`db:generate-snapshots` runs now produce byte-identical fixtures.

### E2E `@mutates` / exclusive-resource mechanics

Playwright specs live in `e2e/` and run against fixed seed-data groups (`Alpha`/`Beta`/`Gamma`/`Delta`,
seeded by `npm run db:seed:e2e`) and the same single shared local Supabase instance as everything
else — see `app/CLAUDE.md`'s "E2E tests" for what the specs actually cover. Most specs are
read-only assertions, safe under any amount of worktree concurrency. The exception is any spec
tagged `@mutates` (currently only `e2e/authenticated/import.spec.ts`, which does raw writes/deletes
against the `Delta` group's rows) — concurrent worktrees both running a `@mutates` spec at the same
time can collide. Rather than isolating each one (there's only one, and its writes are inherently
global-fixture writes, not isolable per-worktree rows), the pre-push hook avoids running it unless
the branch's diff actually touches the spec or the source it exercises:

- `e2e/mutating-spec-triggers.json` maps the `@mutates` tag to the paths that make it relevant
  (e.g. `lib/demon-import.ts`, `app/api/import/`).
- `scripts/e2e-select-suite.sh` diffs the branch against `origin/main`; if any changed file matches
  a trigger path it runs the full `npm run test:e2e`, otherwise `npm run test:e2e:safe`
  (`--grep-invert @mutates`) — so most branches never execute the mutating spec at all, and don't
  need any cross-worktree coordination for it. It also treats a change to any direct (one-level,
  not transitive) local import dependency of a trigger file as touching that trigger — resolved by
  `scripts/resolve-mutating-import-deps.mjs`, which parses each trigger file with the TypeScript
  compiler API and walks its import declarations, excluding type-only imports — so editing e.g.
  `lib/group-auth.ts` (imported by `app/api/import/route.ts`) still
  selects the full suite even though it isn't listed in `mutating-spec-triggers.json` itself.
- The rare ticket whose scope *does* intersect a trigger path gets the `e2e-exclusive` label
  (alongside `db-migration`, in the same exclusive-resource set `swarm` caps at 1 in-flight — see
  the root global CLAUDE.md's "Larger work") so two worktrees never run a `@mutates` spec
  concurrently.
- Adding a new spec that writes to shared fixture rows: tag its `test.describe`/`test` with
  `@mutates` and add its trigger paths to `e2e/mutating-spec-triggers.json` — the hook and the
  ticket-labelling skills both read that one file, so nothing else needs updating.

## CSV data import

Bird data is imported from CSV files exported from ringing software:

```sh
npm run db:import:local ./path/to/data.csv "Group Name"
npm run db:import:prod ./path/to/data.csv "Group Name"
```

The import script (`supabase/scripts/import-csv.ts`) upserts Species, RingingGroups, Birds, Locations, Sessions, and Encounters in dependency order, rate-limited to 30 req/s.

Core import logic (types, transforms, `createUpserter`, `processEncounterRow`) lives in
`lib/demon-import.ts` and is shared by both this CLI script and the web import route — see
`app/CLAUDE.md`'s "Web import".

Both entry points run the same **location pre-flight** before any row is processed (#1079): a CSV
naming a `loc_id` the group has no `Locations` row for aborts the whole import with zero writes
(the CLI `console.error`s the names and exits 1). An unrecognised site name is far more often a
rename than a genuinely new site, and importing it silently forks the Locations row and duplicates
every encounter under the new `location_id` (#1048). The consequence for seeding: a group's first
import can't create its own locations any more, so `seed-e2e-data.ts` pre-creates the ones
`alpha.csv`/`beta.csv` reference via psql (in each CSV's first-appearance order, so location ids
stay reproducible across reseeds — see #903 above), and `e2e/authenticated/import.spec.ts` re-creates
`Delta Site` after wiping Delta's rows.

## Setting group passwords

After creating a group, set its login password with:

```sh
npm run set-group-password:local "Group Name" "password"
npm run set-group-password:prod "Group Name" "password"
```

Passwords are bcrypt-hashed with a per-group random salt stored in the `password_salt` column of `RingingGroups`.
