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
maintenance and runs them in parallel, one git worktree + subagent per unit of work. If you want
to grab a branch `swarm` is mid-way through and keep working on it by hand (e.g. in VS Code), use
the `take-over` skill — it halts the worker and frees the branch's worktree so a normal
`git checkout` works.

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
| `swarm_plan_batch` | Pre-filtered, pre-ranked PR-maintenance + ready-ticket lists for `swarm` |
| `resolve_work_item` | Resolve a branch/issue/PR/agent-id/paraphrase to its worker, for `take-over` |
| `derive_branch_name` | Ticket branch naming (wraps `lib/slugify.ts`) + collision check |
| `create_ticket` | `gh issue create` with labels + sub-issue linking, no shell-escaping/tempfile dance |
| `resolve_migration_dml` | Extract hand-authored backfill DML from a PR body or local migration file |
| `link_ticket_dependencies` | Apply GitHub blocked-by links to an issue (one comma-joined `gh issue edit --add-blocked-by` call) — ticketify's dependency wiring |
| `apply_schema_migration` | Run `npm run db:schema:apply` in a worktree, classify the outcome (`applied`/`history-mismatch`/`error`) and name the colliding worktree on a mismatch — take-over's schema-apply + mismatch detection |

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
(currently only `'summary'` is allowlisted, #768) and the SECURITY DEFINER `public_aggregate_stats` RPC,
which returns real data only when the target group has opted in — otherwise nothing, with no JWT
required. `lib/group-summary-access.ts`'s `fetchAuthorisedAggregateStats` implements the resulting
4-case access model for a `(viewedGroupId, viewerGroupId)` pair (own group, always via the normal
authenticated client; a public grant via `public_aggregate_stats`, checked *before* any
authenticated/RLS attempt — since `public_aggregate_stats` is a pure gated pass-through to
`aggregate_stats` for the same params, this never shows an already-authorised cross-group viewer a
degraded view, and it spares an anonymous visitor a wasted authenticated attempt; an existing
`GroupDataSharing`-granted cross-group view via the normal authenticated client, only attempted once
the target isn't public and the viewer actually has a session; or blocked), returning
`{ accessLevel, rows }` — every summary-stats action function (`app/actions/summary-stats.ts`,
`period-totals.ts`, `spp-data.ts`) routes through it (currently destructuring only `rows`) instead of
calling `getAuthenticatedSupabaseClient()` + `aggregate_stats` directly.

`lib/group-slug.ts`'s group-lookup functions (`resolveGroupIdBySlug`, `resolveGroupSlugById`,
`resolveGroupPublicAreas`) deliberately use the plain unauthenticated `supabase` client (`lib/supabase.ts`)
rather than `getAuthenticatedSupabaseClient()`, since `RingingGroups` is publicly `SELECT`-able — this is
what lets an anonymous visitor's request resolve a group at all without a 500. `resolveGroupPublicAreas`
itself never caches (a group can toggle its public-summary setting at any time), but the same group's
public_areas gets resolved from two places in one request when an anonymous visitor is served a public
summary — the root layout's public-page access gate below, and `fetchAuthorisedAggregateStats`'s own public
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
- Complex queries are exposed as Postgres RPC functions (e.g. `top_metrics_by_period`, `aggregate_stats`, `notable_retraps`, `find_discrepencies`).
- Database types are auto-generated: run `npm run db:types` after schema changes. Never edit `types/supabase.types.ts` by hand.

### Companion stats RPCs and shared plumbing (`aggregate_stats` / `population_stats`, #800)

`aggregate_stats` and `population_stats` (age-split + young-trends derivations, split into its own
RPC rather than folded into `aggregate_stats`' already-large single query — for query-plan
simplicity and to leave `aggregate_stats`' existing columns/performance untouched) share the same
input signature (`species_name_filter, from_date, to_date, ringing_group_filter, group_by_species,
group_by_time_period`) and reuse the same underlying logic via `stats_raw_encounters` /
`stats_spine` / `stats_encounter_age_classification` / `stats_bird_age_bucket` — internal utility
RPCs, each called once per top-level RPC invocation and materialized into a local CTE, not
re-invoked per use (avoids re-scanning the base tables once per downstream CTE). `aggregate_stats`
itself still carries its own historical inline copies of the same logic rather than calling these
utility RPCs — refactoring it to delegate was judged unnecessary regression risk to a
heavily-exercised, already-tested function; keep the utility RPCs' bucket/precedence definitions in
sync **by hand** with `aggregate_stats.sql`'s inline copies if either changes.
`population_stats.new_young_bird_count` is a duplicate of `aggregate_stats.new_young_bird_count`
(same derivation, kept in both places) — `aggregate_stats`' copy is the untouched/authoritative one.

**Composite-type RETURN QUERY binds by position, not name — this bit us.** A `RETURNS SETOF
<composite type>` function's `RETURN QUERY SELECT ...` binds the SELECT list to the composite
type's columns by ordinal attribute position, never by the `AS "..."` alias text. That position is
only as stable as whatever DDL a given environment's `db:schema:apply` run happens to emit for the
type — confirmed empirically while building `population_stats`: two schema-diff runs against the
identical schema files produced two *different* physical attribute orders for a composite type's
columns (one matching the file's declared order, one alphabetical), silently scrambling values into
the wrong named output columns with no error either way. Both `aggregate_stats` and
`population_stats` guard against this by wrapping their final projection —
`SELECT (jsonb_populate_record(NULL::the_result_type, to_jsonb(agg))).* FROM (...) AS agg` — which
binds every column by **name** instead, independent of the type's physical attribute order. Use this
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
7. Deploy schema changes with `npm run db:migration:push`.

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
  route (e.g. `BirdPage`, `SpeciesPage`, `RecordsPage`), which calls `BootstrapPage`
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
(deliberately not an npm script). Migrations are deployed by the human
(`npm run db:migration:push`).

Note: the deployed Vercel app gets its env directly, with
`SUPABASE_JWT_ROLE=authenticated` set in the Vercel project settings, so production
users are unaffected — groups can still import via the web UI.

## Testing

### Test suites

Three separate Vitest configs:

| Suite | Config | Command | Runs in |
|---|---|---|---|
| App tests | `vitest.config.ts` | `npm run test:nowatch` | pre-push hook + CI |
| DB integration tests | `vitest.integration.config.ts` | `npm run test:integration` | manually (requires local Supabase) |
| HTTP tests | `vitest.http.config.ts` | `npm run test:http` | manually (auto-starts Next.js dev server if not running) |
| E2E tests | `playwright.config.ts` | `npm run test:e2e` (full) / `test:e2e:safe` / `test:e2e:mutates` | pre-push hook (diff-aware, see below) + CI (full) |

```sh
npm test              # watch mode (app tests only)
npm run test:nowatch  # single run (app tests)
npm run test:integration  # DB integration tests against local Supabase
npm run test:http     # HTTP tests — starts dev server automatically if needed
npm run test:e2e      # full Playwright E2E suite
npm run qa            # lint + type-check + app tests
```

The pre-push hook runs app tests, then `scripts/e2e-select-suite.sh` (see "E2E tests" below) —
never DB integration tests, which are run manually. Local Supabase must be running
(`npm run db:start:local`) and seeded (`npm run db:seed:e2e`) for the E2E and DB integration
suites to pass.

HTTP tests (`http-tests/`) use `http-tests/global-setup.ts` to start/stop the Next.js dev server automatically. The default server URL is derived per-worktree from `scripts/worktree-test-port.ts` (`deriveWorktreePort()` hashes the worktree's absolute path into a fixed port range, avoiding `3000` and the local Supabase ports) — so concurrent swarm worktrees each get their own port and a reused server can only ever be one this same worktree started, never a sibling's. Set `TEST_BASE_URL` to override the derivation and point at a specific/remote server. If a server is already running at the resolved URL, it reuses it and does not kill it after the suite. `playwright.config.ts` uses the same helper for the E2E dev server.

### App tests (Vitest + happy-dom)

Tests live in `__tests__/` directories alongside the code they test. Global mocks in `vitest.setup.tsx`:
- `next/link`, `next/navigation`
- `app/actions/group-cookie` (returns group ID `1`)
- `BootstrapPage` component

Page-level tests render async server components directly with `await Page({ params: Promise.resolve(...) })`.

Snapshot fixture data lives in `test-fixtures/snapshots/` — use these as mock return values rather than inventing data inline.

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
