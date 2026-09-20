# top-of-the-flocks — Claude context

## What this app does

A leaderboard/statistics dashboard for bird ringing data. Bird ringing groups (organisations that trap, ring, and release birds for scientific tracking) upload their CSV data, and the app presents aggregated stats, per-species analysis, session histories, and notable retraps.

## Tech stack

- **Next.js 16 / React 19** — app directory router, server actions, Turbopack
- **Supabase** — PostgreSQL 17, PostgREST API, Row Level Security
- **Vercel** — hosting and CI/CD
- **Tailwind CSS 4 + FlyonUI** — styling and component primitives
- **Vitest + Testing Library** — unit/component tests
- **dotenvx** — environment variable management (`.env.dev` for local, 1Password-backed for prod)

## Key domain concepts

- A **RingingGroup** is the "user" in this system — it represents an organisation that rings birds. There are no individual user accounts. The `RingingGroups` table is what you treat as "users".
- A **Bird** is an individual bird identified by its ring number. It can appear across multiple sessions and groups (if caught by more than one group).
- An **Encounter** is a single capture event: one bird, one session, with measurements.
- A **Session** is a visit to a ringing location on a given date.

**Standard terminology/enum reference:** imported CSV data follows the DemOn ringing-software
field spec — [`demon-ringing-data-entry-fields.xls`](https://app.bto.org/static/files/demon/demon-ringing-data-entry-fields.xls),
published by the BTO. It's the authoritative source for what each `DemonColumnNames` field
(`lib/demon-import.ts`) means and, for most coded fields (`record_type`, age codes, etc.), the
full code→meaning table. Consult it before guessing at what a raw code value means. Note:
`finding_condition`/`finding_circumstances` are **not** covered by this spec — treat their values
as opaque codes (store/display/filter on them as-is) rather than inventing a decode mapping.

## Ticket workflow

Tickets are created with the `flesh-out-ticket` skill (single task) or `ticketify` skill (a task
list, or a single large task it decomposes first, one issue per task, reusing `flesh-out-ticket`
per ticket) and implemented
with the `implement-ticket` skill. `swarm` picks up open `ready` tickets and open PRs needing
maintenance and runs them in parallel, one git worktree + subagent per unit of work.

When creating a ticket, add exactly one model label reflecting implementation complexity — the
subagent implementing it runs on that model:

- `sonnet` — small, precisely specified, low-risk changes
- `opus` — fiddly or multi-constraint work (complex SQL, seed-data churn, interacting rules)
- `fable` — complex or foundational work that sets patterns others build on

This repo has a single shared local Supabase instance, so any ticket that will mutate it gets an
**exclusive-resource label**, and `swarm` runs any exclusive-resource-labelled unit of work
completely solo — no other worker (maintenance or ticket) runs concurrently with it — since
concurrent worktrees doing either kind of mutation would otherwise collide:
- `db-migration` — touches `supabase/schema/` (schema migrations or DB integration tests).
- `e2e-exclusive` — touches a path listed in `e2e/mutating-spec-triggers.json` (an E2E spec
  tagged `@mutates`; see "E2E tests (Playwright)" below).

### MCP tools for skills

The ticket-workflow skills above call a project-local MCP server (`.claude/mcp/swarm-tools/`,
registered in `.mcp.json`) instead of hand-rolling `jq`/`gh api`/anchor-text-parsing pipelines,
wherever a pattern is multi-step, state-mutating, or repeats across skills. Tools land
incrementally; current inventory:

| Tool | Purpose |
|---|---|
| `swarm_tools_ping` | Health check — confirms the server is reachable |
| `swarm_state_append` / `_remove` / `_list` | Read/mutate `.claude/swarm-state.json` (locked, atomic — never hand-write it) |
| `swarm_state_release_db_lock` | Let an exclusive-resource worker release the shared-local-Postgres lock early (by `agentId`), once its migration/`@mutates` work is applied and verified and only push/PR steps remain — other non-exclusive tickets can then start, while a *new* exclusive-resource worker still waits for it to finish. One-way |
| `swarm_plan_batch` | Pre-filtered, pre-ranked PR-maintenance + ready-ticket lists for `swarm` |
| `derive_branch_name` | Ticket branch naming (wraps `lib/slugify.ts`) + collision check |
| `create_ticket` | `gh issue create` with labels + sub-issue linking, no shell-escaping/tempfile dance |
| `link_ticket_dependencies` | Apply GitHub blocked-by links to an issue (one comma-joined `gh issue edit --add-blocked-by` call) — ticketify's dependency wiring |
| `ensure_local_migrations_applied` | Catch a worktree's shared local Postgres up to the committed `supabase/migrations/` before DB-dependent work — fast-paths off a locked `.claude/swarm-migration-state.json` marker, only running `npx supabase migration up --local` when the marker is behind (#863). Called by `swarm` on every worktree spawn. |
| `ensure_worktree_env` | Copy `.env.dev` from the main checkout root into a worktree, no-clobber — `.env.dev` is gitignored so a freshly created worktree never has it, causing `npm run qa`/the pre-push hook to fail with `SUPABASE_JWT_ROLE environment variable is not set`. Called by `swarm` on every worktree spawn, replacing what used to be manual `cp` prose a worker could skip or botch. |

Use these tools for anything that touches `.claude/swarm-state.json`, creates a GitHub issue,
derives a branch name, or extracts backfill DML — never reimplement the `jq`/glob/anchor-text
equivalent in Bash. Raw `git`/`gh` Bash calls remain fine for simple one-off reads (`gh issue
view <n> --comments`, `git fetch`, `git merge origin/main`) that aren't multi-step or
state-mutating.

## Authentication model

There are no per-person logins. Authentication is group-scoped:

1. The selected group is stored in a `TOTFSession` HTTP-only cookie (a signed JWT, `app/actions/group-cookie.ts`).
2. Server actions call `getAuthenticatedSupabaseClient()` (`lib/group-auth.ts`), which reads the cookie and returns a Supabase client carrying a **custom JWT** embedding `app_metadata.ringing_group_id`.
3. All RLS policies on the database read `ringing_group_id` from this JWT — so the database itself enforces data isolation.
4. Clients are cached in an LRU cache (100 entries, 5-minute TTL) to avoid re-signing JWTs on every request.

**Important:** Multi-tenancy via RLS is only partially implemented. See [issue #149](https://github.com/wheresrhys/totf/issues/149) for current status. Do not assume that all tables are fully isolated — verify before adding features that rely on group isolation.

### Public pages and the group summary read-path (#770)

A group can opt an area of its data into public, unauthenticated view via `RingingGroups.public_areas`
(currently only `'summary'` is allowlisted, #768) and the SECURITY DEFINER `public_core_stats` RPC,
which returns real data only when the target group has opted in — otherwise nothing, with no JWT
required. `app/lib/auth/group-summary-access.ts`'s `fetchAuthorisedCoreStats` implements the resulting
4-case access model for a `(viewedGroupId, viewerGroupId)` pair (own group, always via the normal
authenticated client; a public grant via `public_core_stats`, checked *before* any
authenticated/RLS attempt — since `public_core_stats` is a pure gated pass-through to
`core_stats` for the same params, this never shows an already-authorised cross-group viewer a
degraded view, and it spares an anonymous visitor a wasted authenticated attempt; an existing
`GroupDataSharing`-granted cross-group view via the normal authenticated client, only attempted once
the target isn't public and the viewer actually has a session; or blocked), returning
`{ accessLevel, rows }` — every summary-stats action function (`app/actions/summary-stats.ts`,
`period-totals.ts`, `spp-data.ts`) routes through it (currently destructuring only `rows`) instead of
calling `getAuthenticatedSupabaseClient()` + `core_stats` directly. (`core_stats`/`public_core_stats`
are byte-identical siblings of the still-schema-resident `core_stats`/`public_aggregate_stats`
RPCs — #830 moved every app-code call site onto the new names; a later ticket deletes the old ones.)

`lib/group-slug.ts`'s group-lookup functions (`resolveGroupIdBySlug`, `resolveGroupSlugById`,
`resolveGroupPublicAreas`) deliberately use the plain unauthenticated `supabase` client (`lib/supabase.ts`)
rather than `getAuthenticatedSupabaseClient()`, since `RingingGroups` is publicly `SELECT`-able — this is
what lets an anonymous visitor's request resolve a group at all without a 500. `resolveGroupPublicAreas`
itself never caches (a group can toggle its public-summary setting at any time), but the same group's
public_areas gets resolved from two places in one request when an anonymous visitor is served a public
summary — the root layout's public-page access gate below, and `fetchAuthorisedCoreStats`'s own public
fallback — so both route through `resolveGroupPublicAreasForRequest`, a `React.cache()`-memoised wrapper
around it that dedupes within a single request/render pass without weakening the "always live" guarantee
across requests.

The root layout (`app/layout.tsx`'s `AuthorisedView`) is the single auth gate for the whole app — every
route renders through it, so it's the only place that can make a page-aware, group-aware decision before
anything else runs. A no-cookie request only ever falls through to `<LoginModal>` after
`lib/public-group-access.ts`'s `resolvePublicPageViewedGroupId(pathname)` returns `null`; that helper
matches the pathname against the summary-subtree pattern, resolves the target group by slug, and checks
its `public_areas`, returning the viewed group's id (instead of a bare boolean) when all three line up.
`AuthorisedView` looks that id up in the same `groups` list it already fetched for the authenticated
branch and renders `GlobalNav` in `readOnly` mode (branding + viewed-group name only — no group switcher,
"Import data", "Log out", or authenticated-only nav links/search, none of which are reachable
anonymously since only `'summary'` is in the public allowlist, #768) around bare `children`, skipping
`RingingGroupProvider` entirely (there's no logged-in group to track). Because a Server Component layout
can't see which deeper static route segment a request actually matched (Next.js only gives a layout
`params` for its own position in the route tree, and the root layout has no dynamic segments at all),
`proxy.ts` (Next.js 16's renamed `middleware.ts`) stamps the real request pathname onto an `x-pathname`
header for `/group/**` requests, which `lib/request-pathname.ts` reads back via `next/headers` — this is
how the root layout can see it's being asked for a `/group/<slug>/summary` path despite sitting above the
whole route tree. Every other request has no `x-pathname` header, so `resolvePublicPageViewedGroupId`
returns `null` and the existing login gate is unchanged. Reuse this pathname pattern (and widen
`proxy.ts`'s matcher) if another subtree ever needs a similar route-aware decision in the root layout —
don't reinvent it per route. There is deliberately no `app/(routes)/group/[groupSlug]/layout.tsx` any
more — a nested layout can never run before the root layout's gate does, so any auth decision belongs in
the root layout, not a subtree one.

## Database schema

Tables (PascalCase in Postgres, matching generated TypeScript types in `types/supabase.types.ts`):

| Table | Purpose |
|---|---|
| `RingingGroups` | The "users" — ringing organisations |
| `Birds` | Individual birds identified by ring number |
| `Species` | Bird species reference data |
| `Sessions` | A ringing session (date + location) |
| `Encounters` | One bird captured once in one session, with measurements |
| `Locations` | Ringing sites, owned by a group |

Key design notes:
- `Birds.ringing_group_ids` is a Postgres array column (GIN-indexed) — a bird belongs to one or more groups.
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
same three-step pattern used for `core_stats`/`public_core_stats` (#830, see "Public pages and
the group summary read-path" above). `demographics_stats.new_young_bird_count` was originally a
duplicate of a same-named column on `core_stats` (#800); #824 removed `core_stats`'s
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

`stats_raw_encounters` and `stats_spine` also exclude passive, no-bird-in-hand data so it never
leaks into any stats RPC built on them (#874). `stats_raw_encounters` filters out any `Encounters`
row whose `record_type` is a resighting/recovery type — `public.resighting_record_type` (`U`/`F`/`D`
— see the DemOn field spec) — by adding the condition to its `LEFT JOIN ... ON` clause rather than a
`WHERE`, so a bird whose only encounters are resightings still surfaces as a NULL-`encounter_id` row
instead of disappearing from the result entirely. `stats_spine`'s `session_date_range` separately
excludes `FIELD_OBSERVATION` sessions, so a field-observation-only date can't stretch the month/year
spine past the range of real (`FULL_GROWN`/`PULLI`) sessions. `app/models/db.ts` exports
`ResightingRecordType` from the generated enum, and `lib/demon-import.ts`'s
`RESIGHTING_RECORD_TYPES` constant is typed against it — keep that constant in sync **by hand** if
the enum ever changes, the same convention as the age-bucket definitions above.

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
shapes are unreliable here is worth remembering on its own: **`adult_birds` is estimated at 1
row when it actually returns tens of thousands** — the `IS NOT DISTINCT FROM` join against a
SQL-function-backed relation defeats the estimator — so anything whose plan hinges on a sane row
estimate is a coin flip. Prefer a shape with no join to mis-plan.

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

## Data fetching conventions

- Data fetching happens in **server actions** (`app/actions/`) or in server-rendered pages/components — never in client components (anything marked `'use client'`).
- Every data-fetching function calls `getAuthenticatedSupabaseClient()` to get a group-scoped client.
- Errors from Supabase calls are handled via `catchSupabaseErrors()`.
- RPC calls go through `.rpc('function_name', args)` on the Supabase client.
- TypeScript types for DB rows come from `app/models/db.ts`, which re-exports from the auto-generated types. Types for a query's return shape (e.g. an embedded-relation select used by only one page) can live alongside the page/component that fetches and renders it instead, if not reused elsewhere.

## Code conventions

- **Models** (`app/models/`) hold domain types and pure transformation logic — no I/O.
  - Session highlights are plain-data objects (`app/models/highlights/`), split into three independent groups — Rarities, Counts, Vital stats — plus a `long-absence-retrap.ts` sibling; see [`docs/session-highlight-ordering.md`](docs/session-highlight-ordering.md) for the directory layout, each group's own derive → rules → compose pipeline, the fixed section order, and why long-absence-retrap sits outside the three groups. The plain data serialises across the server-action boundary; the client renders each group via its own renderer in `app/components/highlights/{rarities,counts,vital-stats}/renderers.tsx` (each a `type`-keyed `HIGHLIGHT_RENDERERS` map, mapped-typed against that group's own union only, plus a `render*Highlight` dispatch function), with formatting helpers reused across groups (e.g. `capitalize`, `buildSpeciesList`, `formatShortDate`) in `app/components/highlights/shared/render-sentence.tsx` and a barrel at `app/components/highlights/index.ts`. `long-absence-retrap`'s renderer is a sibling (`app/components/highlights/long-absence-retrap-renderer.tsx`), not part of any group and not re-exported from the barrel — it isn't wired into a page yet (see the doc's exclusion note). `app/components/pages/session/SessionHighlights.tsx` partitions the action's flat highlight list into each group's array (using that group's renderer-map keys as the membership check) and renders three independently-shown/hidden sections in the fixed Rarities → Counts → Vital stats order. Editorial refinements belong in a group's own rule (removal/combining) or block composition, or in a renderer (rewording); add a rule by writing a file and slotting it into that group's `RULES`.
- **Actions** (`app/actions/`) are `'use server'` functions that fetch data and return typed results.
- **Components** (`app/components/`) and page files receive data as props; they do not fetch.
- Route pages are in `app/(routes)/` — the `(routes)` group is just for organisation, it doesn't affect URLs.
- Tests live in `__tests__/` directories alongside the code they test.

## Route/page/content/dataFetcher conventions

Every page lives under `app/(routes)/` and follows a consistent split between the route
entrypoint, its content, and its data fetcher:

- **`page.tsx`** is always server-side. It exports a default `___Page` component named after the
  route (e.g. `BirdPage`, `SpeciesPage`), which calls `BootstrapPage`
  (`app/components/layout/BootstrapPage.tsx`) with a `PageComponent` and a `dataFetcher`.
  `page.tsx` also hosts the `fetch___PageContent` function itself, even though
  `PageContent.tsx` sits right next to it — the fetcher is inherently server-side (it's passed
  into `BootstrapPage`), while `PageContent.tsx` may need `'use client'` for its content
  component, so colocating the fetcher there risks a server/client boundary conflict.
- **`PageContent.tsx`**, colocated alongside `page.tsx`, holds only the content component
  (`___PageContent`) and any types/helpers it needs — never the data fetcher.
- **Group-scoped variant** (`app/(routes)/group/[groupSlug]/...`) resolves `{id, slug}` and
  delegates to the top-level `___Page` component, passing it `viewedGroup`. The resolution
  boilerplate (await `params`, resolve the slug via `resolveGroupIdBySlug`, `notFound()` on a
  miss, build the `viewedGroup`) is factored into `withGroupScope`
  (`app/components/layout/withGroupScope.tsx`) — a higher-order function that wraps the page: each
  group page is `export default withGroupScope(({ viewedGroup }) => <___Page viewedGroup={viewedGroup} />)`.
  Pages with extra route params type them on the generic (`withGroupScope<{ speciesName: string }>`)
  and read them off the callback's `params`; a page needing post-resolution work (e.g. the home
  page's redirect-to-own-group) passes an `async` callback. (It's a HOF, not a React context
  provider, because these are async server components and context is client-only.) Its own export
  is named `Group___Page` (e.g. `GroupHomePage`,
  `GroupMistakesPage`; disambiguated where a route has more than one group-scoped variant, e.g.
  `GroupSpeciesPage` for the list vs. `GroupSpeciesDetailPage` for `species/[speciesName]`).
  Group variants don't need their own `PageContent.tsx`. A route that only exists in
  group-scoped form (no bare top-level URL — e.g. the by-date session page,
  `group/[groupSlug]/session/[date]/`) still follows the `Group___Page` / `___PageContent` /
  `fetch___PageContent` naming even though there's no separate top-level page to delegate to.
- **Multiple route-depth variants of the same page** (e.g. `summary/`, `summary/[year]/`,
  `summary/[year]/[month]/`, and the equivalent `species/[speciesName]/...` drill-downs) share
  one `PageContent.tsx` colocated with the base route; the deeper variants import it via relative
  path (`../PageContent`, `../../PageContent`). This replaces the old `_shared.tsx` convention,
  which has been removed everywhere.
- **Page-specific components** — used by only one page's content — live under
  `app/components/pages/{route-name}/` (e.g. `components/pages/session/`,
  `components/pages/species/`). Components used by more than one page family stay in top-level
  `app/components/`.

Naming reference (see #667 for the original design discussion):

| Route | PageComponent (`page.tsx`) | ContentComponent (`PageContent.tsx`) | dataFetcher (`page.tsx`) | Child-component directory |
|---|---|---|---|---|
| `app/(routes)/group/[groupSlug]/session/[date]/page.tsx` | `GroupSessionPage` | `SessionPageContent` | `fetchSessionPageContent` | `components/pages/session` |
| `app/(routes)/bird/[ring]/page.tsx` | `BirdPage` | `BirdPageContent` | `fetchBirdPageContent` | — |
| `app/(routes)/species/[speciesName]/page.tsx` | `SpeciesPage` | `SpeciesPageContent` | `fetchSpeciesPageContent` | `components/pages/species` |


## Development environment

```sh
npm run db:start:local   # start local Supabase (Docker)
npm run db:sync:local    # reset local DB to prod schema + seed data
npm run next:dev         # start Next.js dev server against local DB
```

### Developing against production data — read-only by default

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

### Test suites

Three separate Vitest configs:

| Suite | Config | Command | Runs in |
|---|---|---|---|
| App tests | `vitest.config.ts` | `npm run test:nowatch` | pre-push hook + CI |
| DB integration tests | `vitest.integration.config.ts` | `npm run test:integration` | manually (requires local Supabase); the fixture-freshness test alone also runs pre-push, diff-aware (`npm run test:fixture-freshness`) |
| HTTP tests | `vitest.http.config.ts` | `npm run test:http` | manually (auto-starts Next.js dev server if not running) |
| E2E tests | `playwright.config.ts` | `npm run test:e2e` (full) / `test:e2e:safe` / `test:e2e:mutates` | pre-push hook only (diff-aware, see below) |

CI (`.github/workflows/ci.yml`) has exactly three jobs — `lint`, `type-check`, `unit-tests` — and no
Supabase service, so **no** suite that needs a database runs in CI. The `unit-tests` job fabricates a
`.env.dev` pointing at a `localhost:54321` that nothing is listening on; app tests are fully mocked
by construction. E2E and DB integration tests are local-only (pre-push hook and manual respectively).

```sh
npm test              # watch mode (app tests only)
npm run test:nowatch  # single run (app tests)
npm run test:integration  # DB integration tests against local Supabase
npm run test:fixture-freshness  # just the snapshot-fixture-drift check (a DB integration test)
npm run test:http     # HTTP tests — starts dev server automatically if needed
npm run test:e2e      # full Playwright E2E suite
npm run qa            # lint + type-check + app tests
```

**Output is concise by default (#927).** Every one-shot ("run", not "watch") Vitest command —
`test:nowatch`, `test:ci`, `test:integration`, `test:fixture-freshness`, `test:http` — passes
`--reporter=dot`: a single character per test instead of a verbose per-test PASS line, with full
detail still printed for any failure plus the final summary. `npm test` (interactive watch mode)
is deliberately left on Vitest's default reporter — that's for a human watching it run, not an
automated one-shot pass. Playwright (`playwright.config.ts`) uses `[['dot'], ['html', { open:
'never' }]]` for the same reason, and to stop the HTML reporter auto-opening a browser tab when a
test fails in a subagent's headless environment. `npm run lint`'s Prettier step passes
`--log-level warn` so it stays silent when a file needs no reformatting, rather than printing a
line per file scanned. This matters most when tests/lint run inside a subagent (`implement-ticket`'s
`npm run qa`, `swarm` workers, the pre-push hook firing on a subagent's `git push`) — verbose
per-test/per-file output there burns tokens for no signal.

The pre-push hook runs app tests, then two diff-aware selection scripts —
`scripts/fixture-freshness-select.sh` (see "App tests" below) and `scripts/e2e-select-suite.sh`
(see "E2E tests" below). It never runs the DB integration suite as a whole; that stays manual,
and the fixture-freshness check is the one integration test it can reach, gated on the branch
diff. Local Supabase must be running (`npm run db:start:local`) and seeded
(`npm run db:seed:e2e`, or `npm run db:sync:e2e` for a guaranteed-clean baseline — see
"Regenerating fixtures reproducibly" below) for the E2E and DB integration suites to pass.

HTTP tests (`http-tests/`) use `http-tests/global-setup.ts` to start/stop the Next.js dev server automatically. The default server URL is derived per-worktree from `scripts/worktree-test-port.ts` (`deriveWorktreePort()` hashes the worktree's absolute path into a fixed port range, avoiding `3000` and the local Supabase ports) — so concurrent swarm worktrees each get their own port and a reused server can only ever be one this same worktree started, never a sibling's. Set `TEST_BASE_URL` to override the derivation and point at a specific/remote server. If a server is already running at the resolved URL, it reuses it and does not kill it after the suite. `playwright.config.ts` uses the same helper for the E2E dev server.

### App tests (Vitest + happy-dom)

Tests live in `__tests__/` directories alongside the code they test. Global mocks in `vitest.setup.tsx`:
- `next/link`, `next/navigation`
- `app/actions/group-cookie` (returns group ID `1`)
- `BootstrapPage` component

Page-level tests render async server components directly with `await Page({ params: Promise.resolve(...) })`.

Snapshot fixture data lives in `test-fixtures/snapshots/` — use these as mock return values rather
than inventing data inline. Fixtures are organised **by data source, not by the action function
that consumes them** (#882): one subdirectory per Postgres RPC (`core_stats/`,
`biometrics_stats/`, `demographics_stats/`, `find_discrepencies/`, `notable_retraps/`,
`ring_sequence_controls/`), or
`tables/<TableName>/` for a fixture produced by a direct PostgREST table query rather than an RPC
call. This matters because an action can drift from the RPC/table it actually calls (#870:
`getSpeciesStatsHistory.alpha.robin.json` was named after the `getSpeciesStatsHistory` action but
generated from a raw `core_stats` call) — naming by source instead of by consumer
means a fixture's location can never overstate what it verifies. Within each directory, filenames
follow `<callingGroupOrParams>.<intent>.json` (e.g. `core_stats/alpha.by-species.json`,
`core_stats/alpha.home-page-summary.json`). See the comment above the relevant block in
`scripts/generate-snapshots.ts`, which documents every fixture's actual RPC/table and consuming
action(s), keeping a fixture's location from silently drifting from what it actually tests.
Regenerate every fixture here with `npm run db:generate-snapshots` — the sole exception is
`synthetic/` (#894), two hand-authored all-zero/null edge-case fixtures that no real query can ever
produce (see that directory's own `README.md`), which the generator deliberately never touches.

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

**Never write `fixture as unknown as SomeType` for a new fixture cast — try `fixture as SomeType`
first (#895).** The double assertion through `unknown` switches assignability checking off
completely, so a fixture's shape is never compared against the type at all — a fixture missing a
column the type has since gained goes uncaught. A direct single assertion still doesn't catch
every drift (an imported JSON module isn't a fresh object literal, so TypeScript's
excess-property check never applies to it — a fixture carrying a column the type has since
*removed* stays assignable either way; that direction is `snapshot-fixture-freshness.test.ts`'s
job, described below), but it does catch a newly-*added* required column, which the double
assertion can't. Only fall back to `as unknown as SomeType` when the fixture is a genuine
structural mismatch — e.g. an ungrouped/species-filtered `core_stats`-family fixture with a
literal `null` in a column the row type (`CoreStatsResult`, `DemographicsStatsResult`,
`BiometricsStatsResult` in `app/models/db.ts`) strips non-null via `NonNullable`, or a hand-built
object that only fills in the columns a test actually reads.

**This is enforced, not just documented (#921).** `eslint.config.js` forbids the `x as unknown as
T` pattern outright via a `no-restricted-syntax` selector — `npm run lint` fails on any new one. A
genuine exception still needs a one-line `// eslint-disable-next-line no-restricted-syntax --
<reason>` comment directly above the line the cast is on (a longer explanation can precede it as
ordinary comment lines, as long as the disable directive itself is the line immediately above the
cast — `eslint-disable-next-line` only ever suppresses the line right after it). Don't fall back to
a freeform "kept as `as unknown as`: ..." comment with no enforcing directive — that's exactly the
drift this rule exists to catch, since nothing then stops another cast being added the same way
without anyone noticing.

**Fixture drift is caught by a pre-push, diff-gated check — but only for the 27 generated
fixtures.** Nothing in the type system notices when an RPC's return shape changes underneath a
fixture consumed via a double assertion (see above) or via a JSON import generally, since an
imported JSON module is not a fresh object literal so even a direct assertion still leaves a
fixture carrying columns the type no longer declares assignable. That's
how #870's column removal reached `main` with every check green (full investigation in
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
- **What it covers.** Exactly the 27 fixtures `scripts/generate-snapshots.ts` writes
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
- **When it runs.** Pre-push only — CI has no Supabase service. `scripts/fixture-freshness-select.sh`
  mirrors `scripts/e2e-select-suite.sh`: it diffs the branch against `origin/main` and runs
  `npm run test:fixture-freshness` only when the diff touches `supabase/schema/`,
  `types/supabase.types.ts`, `scripts/generate-snapshots.ts`, `lib/snapshot-fixtures.ts`,
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
`tables/Birds/robin-alpha.page-of-birds.json`). `scripts/seed-e2e-data.ts` therefore calls
`importCSV` from `scripts/import-csv.ts` in-process at `concurrency: 1`, rather than shelling out
to `npm run db:import:local` at the default 30. That's seeding-only: the CLI (`db:import:{local,prod}`)
and the web import route keep the default concurrency. Two consecutive `db:sync:e2e` +
`db:generate-snapshots` runs now produce byte-identical fixtures.

**Asserting on table cells:** never index into cells by raw position (`cells[6]`,
`querySelectorAll('td')[8]`) — a reordered or added column silently breaks an unrelated
assertion. Use the shared helpers in `app/__tests__/helpers/table.ts` instead:
`getColumnIndex(container?, headingText)`, `getRowByText(container?, rowText)`, and
`getCellByHeading(container?, headingText, row)` where `row` is a row-text string, a 0-based
data-row index, or a resolved row element (e.g. `screen.getByTestId('totals-row')`). The
`container` param is optional on all three — omit it to default to the sole
`screen.getByRole('table')` in the rendered output; pass it explicitly only when a test renders
more than one table at once.

**Fixing tests after a component default changes:** when a default prop/state value changes (e.g. a
toggle's initial value flips), don't force old assertions to keep passing by adding a click/toggle
to reach the old value — only tests whose stated purpose *is* that toggle should drive state via
clicks. For every other test, a full-dataset row count used merely as an incidental "did it load"
load-signal should just be corrected to whatever the new default actually renders. Toggle-specific
describe blocks should be inverted (default-state assertions swap direction; a click now reveals the
old default instead of the new one). Watch for genuinely redundant tests this exposes (e.g. a
zero-fill assertion already covered by a model-level unit test) — delete rather than contort. Also
watch for corner cases the new default introduces that are worth a dedicated test in their own right
(e.g. a component that renders no controls at all once its default filters every row away, so the
"reveal" toggle becomes unreachable in that state).

### DB integration tests (`supabase/__tests__/`)

Test RPC functions and RLS policies against the real local database. Require `npm run db:seed:e2e` to populate test data before running. Use a separate Vitest node environment (no happy-dom).

Tests can run concurrently in separate git worktrees (see `swarm`) against the same shared local
Supabase instance. Any row a write test creates (ring numbers, group names, session/location
names, etc.) must use a random or ticket/branch-specific identifier — never a fixed literal —
so parallel runs never collide on the same row, and so date-based rows never collide in a
group-wide aggregate RPC's results (e.g. `stats_per_day_and_species`) even without a unique
constraint. Use the shared helpers in `supabase/__tests__/test-isolation.ts`
(`randomTestSuffix`, `randomFutureDate`, `addDays`) rather than inventing a new isolation
mechanism per file; extend an existing prefix convention (e.g. `TRIG-TEST-`) with the suffix.

### E2E tests (Playwright)

Playwright specs live in `e2e/`, run against fixed seed-data groups (`Alpha`/`Beta`/`Gamma`/`Delta`,
seeded by `npm run db:seed:e2e`) and the same single shared local Supabase instance as everything
else. Unlike DB integration tests, most E2E specs are read-only assertions against that stable
seed data — safe under any amount of worktree concurrency, since nothing mutates the rows they
read.

The exception is any spec tagged `@mutates` (currently only `e2e/authenticated/import.spec.ts`,
which does raw writes/deletes against the `Delta` group's rows) — concurrent worktrees both
running a `@mutates` spec at the same time can collide. Rather than isolating each one (there's
only one, and its writes are inherently global-fixture writes, not isolable per-worktree rows),
the pre-push hook avoids running it unless the branch's diff actually touches the spec or the
source it exercises:

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
  "Larger work" above) so two worktrees never run a `@mutates` spec concurrently.
- Adding a new spec that writes to shared fixture rows: tag its `test.describe`/`test` with
  `@mutates` and add its trigger paths to `e2e/mutating-spec-triggers.json` — the hook and the
  ticket-labelling skills both read that one file, so nothing else needs updating.

## Environment variables

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (public) |
| `SUPABASE_JWT_SECRET` | Used to sign group JWTs (must match Supabase project's JWT secret) |
| `SUPABASE_JWT_ROLE` | Postgres role embedded in signed group JWTs. **Required** — the app fails closed if unset. `authenticated` for normal read/write (local dev, Vercel prod, explicit prod-write commands); `app_readonly` for read-only prod access (set by `load-prod-env.sh`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (bypasses RLS — admin scripts only) |

Local values are in `.env.dev`. Production values are managed via 1Password (see `scripts/load-prod-env.sh`).

## CSV data import

Bird data is imported from CSV files exported from ringing software:

```sh
npm run db:import:local ./path/to/data.csv "Group Name"
npm run db:import:prod ./path/to/data.csv "Group Name"
```

The import script (`scripts/import-csv.ts`) upserts Species, RingingGroups, Birds, Locations, Sessions, and Encounters in dependency order, rate-limited to 30 req/s.

Core import logic (types, transforms, `createUpserter`, `processEncounterRow`) lives in `lib/demon-import.ts` and is shared by both the CLI script and the web import route.

### Web import

Logged-in groups can also upload CSVs via the UI at `/import`. The page POSTs to `POST /api/import` (`app/api/import/route.ts`), which streams NDJSON progress back to the browser. Processing is sequential (no rate limiter) and aborts with a date-range summary after 280 seconds. Vercel `maxDuration` is set to 300s.

## Setting group passwords

After creating a group, set its login password with:

```sh
npm run set-group-password:local "Group Name" "password"
npm run set-group-password:prod "Group Name" "password"
```

Passwords are bcrypt-hashed with a per-group random salt stored in the `password_salt` column of `RingingGroups`.


## Project structure

This split is far from perfect and suggestions to improve the comprehensiveness and quality are welcome.

- ./lib is for any library files used by both scripts and the core next.js app
- ./app/lib is for any libarry files used only by the next.js app. Where appropriate they should be grouped into subdirectories
- ./app/models should be mainly for data structures, with only very minimal functionlaity for transforming/massaging data into related data structures. Anything more complex should live in ./app/lib.

## Caveman
Use the caveman skill judiciously:
- extensively while implementing
- less so when communicating with me
