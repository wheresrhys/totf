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
- An **Encounter** is a single capture event: one bird, at one location, on one date, with
  measurements. It is where a capture's location and date actually live.
- A **Session** is a group's day of ringing — one row per group per date (#1024). It groups a day's
  encounters together and nothing more; it carries no location of its own, so a day spent at
  several sites is one Session whose encounters sit at different locations.

**Standard terminology/enum reference:** imported CSV data follows the DemOn ringing-software
field spec — [`demon-ringing-data-entry-fields.xls`](https://app.bto.org/static/files/demon/demon-ringing-data-entry-fields.xls),
published by the BTO. It's the authoritative source for what each `DemonColumnNames` field
(`modules/demon-import/types.ts`) means and, for most coded fields (`record_type`, age codes, etc.), the
full code→meaning table. Consult it before guessing at what a raw code value means. Note:
`finding_condition`/`finding_circumstances` are **not** covered by this spec — treat their values
as opaque codes (store/display/filter on them as-is) rather than inventing a decode mapping.

## Repo zones

A **zone** is a directory of this repo with its own scoped `CLAUDE.md`, so a session working in
one area doesn't load context for the others. This root doc holds the cross-cutting overview,
shared code, and anything genuinely used across zones.

**This list is canonical.** It is the one place the zone set is enumerated in prose — every other
doc and skill that needs it links here rather than restating it. The sole unavoidable duplicate is
`.claude/mcp/swarm-tools/tools/create-ticket.ts`'s `ZONE_LABEL_DESCRIPTIONS` map and `zoneLabels`
zod enum, which need static literals; they must be kept in step with this table (see "Module
conventions" below).

The zone set is an explicit, maintained list — deliberately *not* derived from the folder
structure at runtime. Three top-level zones, plus one zone per `modules/<name>/` directory:

| Zone label | Directory | Scoped doc |
|---|---|---|
| `zone:app` | `app/` | [`app/CLAUDE.md`](app/CLAUDE.md) — auth model, data-fetching and route/page/content conventions, code conventions, app/HTTP/E2E test conventions |
| `zone:supabase` | `supabase/` | [`supabase/CLAUDE.md`](supabase/CLAUDE.md) — schema, migrations, RPC internals and performance notes, data-layer scripts (`supabase/scripts/`), fixture generation, DB integration tests, the `@mutates`/exclusive-resource mechanics |
| `zone:agentic-tooling` | `.claude/` | [`.claude/CLAUDE.md`](.claude/CLAUDE.md) — ticket workflow, MCP tool inventory, hooks |
| `zone:modules/stats` | `modules/stats/` | [`modules/stats/CLAUDE.md`](modules/stats/CLAUDE.md) — the stats-cache event-building/read/dispatch/refresh pipeline; cross-zone (consumed by `app/` and by `supabase/scripts/import-csv.ts`) |
| `zone:modules/demon-import` | `modules/demon-import/` | [`modules/demon-import/CLAUDE.md`](modules/demon-import/CLAUDE.md) — the DemOn CSV-import pipeline; cross-zone (consumed by `app/`, `supabase/scripts/` and `supabase/__tests__/`) |
| `zone:modules/ui-kit` | `modules/ui-kit/` | [`modules/ui-kit/CLAUDE.md`](modules/ui-kit/CLAUDE.md) — the UI-primitive components/hooks every page family imports; consumed only by `app/` |
| `zone:modules/stats-view` | `modules/stats-view/` | [`modules/stats-view/CLAUDE.md`](modules/stats-view/CLAUDE.md) — the stats-table components and row-model helpers every summary/species/session tab renders; consumed only by `app/` |
| `zone:modules/highlights` | `modules/highlights/` | [`modules/highlights/CLAUDE.md`](modules/highlights/CLAUDE.md) — the rule-based highlights pipeline that powers the session/summary pages' Highlights tabs; consumed only by `app/` |

A module zone is the **narrowest** zone covering its directory, and it wins over the broader zone
of whatever consumes it: work confined to `modules/ui-kit/` is `zone:modules/ui-kit`, not
`zone:app`, even though only `app/` imports it. Reach for a broader zone — or several zones — only
when the work genuinely spans outside the module's own directory.

See "Shared code" below for why each `modules/<name>/` directory exists and what it holds, and
`.claude/CLAUDE.md`'s "Ticket workflow" for how these labels drive ticket scoping.

## Development environment

```sh
npm run db:start:local   # start local Supabase (Docker)
npm run db:sync:local    # reset local DB to prod schema + seed data
npm run next:dev         # start Next.js dev server against local DB
```

See `supabase/CLAUDE.md`'s "Developing against production data" for the read-only-by-default prod
access model (`npm run next:prod`, `npm run prod:run`) and the human-only prod-write exceptions.

## Testing

### Test suites

Four separate test configs, spanning every zone:

| Suite | Config | Command | Runs in |
|---|---|---|---|
| App tests | `vitest.config.ts` | `npm run test:nowatch` | pre-push hook + CI |
| DB integration tests | `vitest.integration.config.ts` | `npm run test:integration` | manually (requires local Supabase); the fixture-freshness test alone also runs pre-push, diff-aware (`npm run test:fixture-freshness`) |
| HTTP tests | `vitest.http.config.ts` | `npm run test:http` | manually (auto-starts Next.js dev server if not running) |
| E2E tests | `playwright.config.ts` | `npm run test:e2e` (full) / `test:e2e:safe` / `test:e2e:mutates` | pre-push hook only (diff-aware, see `supabase/CLAUDE.md`) |

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
`supabase/scripts/fixture-freshness-select.sh` and `scripts/e2e-select-suite.sh` (both detailed in
`supabase/CLAUDE.md`). It never runs the DB integration suite as a whole; that stays manual, and
the fixture-freshness check is the one integration test it can reach, gated on the branch diff.
Local Supabase must be running (`npm run db:start:local`) and seeded (`npm run db:seed:e2e`, or
`npm run db:sync:e2e` for a guaranteed-clean baseline — see `supabase/CLAUDE.md`'s "Regenerating
fixtures reproducibly") for the E2E and DB integration suites to pass.

See `app/CLAUDE.md`'s "Testing" for app/HTTP/E2E test conventions, and `supabase/CLAUDE.md`'s
"Testing" for DB integration tests, fixture generation/freshness, and `@mutates` mechanics.

## Environment variables

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (public) |
| `SUPABASE_JWT_SECRET` | Used to sign group JWTs (must match Supabase project's JWT secret) |
| `SUPABASE_JWT_ROLE` | Postgres role embedded in signed group JWTs. **Required** — the app fails closed if unset. `authenticated` for normal read/write (local dev, Vercel prod, explicit prod-write commands); `app_readonly` for read-only prod access (set by `load-prod-env.sh`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (bypasses RLS — admin scripts only) |

Local values are in `.env.dev`. Production values are managed via 1Password (see `scripts/load-prod-env.sh`).

## Shared code

A handful of root-level directories are genuinely used across two or all three of the top-level
zones and don't belong to any single scoped doc:

- `lib/supabase.ts` — imported by `app/`, data-layer scripts (`supabase/scripts/`), and
  `supabase/__tests__/` alike. A true 3-zone dependency; keep it here rather than duplicating it
  or picking one zone to own it.
- `lib/slugify.ts` — used by the agentic-tooling `derive_branch_name` MCP tool and the data-layer
  `supabase/scripts/seed-e2e-data.ts`. Small enough (756 bytes) not to be worth splitting.
- `queries/` and `types/` — typed query definitions and the generated `Database` type, consumed by
  both `app/` pages/actions and `supabase/scripts/generate-snapshots.ts`.
- `modules/stats/` — the stats-cache event-building/read/dispatch/refresh pipeline, consumed by
  `app/` (actions, the stats-cache-refresh-window queue route) and by
  `supabase/scripts/import-csv.ts`'s CLI importer — the same cross-zone shape as `lib/supabase.ts`
  above, just large enough to warrant its own directory, barrel and scoped doc. See its own
  [`modules/stats/CLAUDE.md`](modules/stats/CLAUDE.md) — the reference implementation of the
  "Module conventions" below.
- `modules/demon-import/` — the whole DemOn CSV-import pipeline (staging into `DemonRecords` →
  domain-table chunk writes → `ImportJobs` tracking, plus the ring-sequence and location-lookup
  helpers), extracted from a 1536-line `lib/demon-import.ts` (#1324). Shared verbatim by the web
  import route in `app/`, `supabase/scripts/import-csv.ts` and `supabase/__tests__/`, so the same
  3-zone shape as `lib/supabase.ts` above. See its own
  [`modules/demon-import/CLAUDE.md`](modules/demon-import/CLAUDE.md).
- `modules/ui-kit/` — the 12 UI-primitive components/hooks (sortable/accordion table
  plumbing, tab plumbing, design-system primitives) every page family in `app/` imports from,
  extracted from `app/components/shared/*` (#1326). Unlike `modules/stats/` above, this one is
  catalogued here purely because it's a module per the "Module conventions" below, not because
  it's used outside `app/` — nothing else consumes it. See its own
  [`modules/ui-kit/CLAUDE.md`](modules/ui-kit/CLAUDE.md).
- `modules/stats-view/` — the 5 stats-table components (`PeriodTotalsTable`,
  `SpeciesTotalsTable`, `SessionSpeciesTotalsTable`, `SppStatsTable`, `SpTable`) every
  summary/species/session tab renders, plus the 4 pure helpers that reshape a
  `stats_cache_*_metrics`/`SimpleStatsCache` row into the row model each one wants, 
  extracted from `app/components/*` and `app/lib/*`
  (#1327), and (since #1353) the stats-table-specific primitives those components build on —
  the three two-option toggles (`AggregateByToggle`, `CombineYearsToggle`, `EmptyMonthsToggle`)
  and the age-bucketed column-set/table-body factories (`StatsTableColumnConfigs`,
  `StatsTableBody`) that moved here from `modules/ui-kit`, since nothing outside this module
  used them. Consumed only by `app/`, catalogued here for the same reason `modules/ui-kit` above
  is, and a **sibling of `modules/stats`, deliberately not nested inside it** — `modules/stats` is
  imported by the `supabase/scripts/import-csv.ts` CLI importer and so must stay React/JSX-free.
  See its own [`modules/stats-view/CLAUDE.md`](modules/stats-view/CLAUDE.md).
- `modules/highlights/` — the rule-based highlights pipeline (fetch/fan-out/combine/sort phases
  over a registered catalogue of `HighlightsGenerator` rules) that powers the session/summary
  pages' Highlights tabs. Consumed only by `app/`, catalogued here for the same reason
  `modules/ui-kit` above is. See its own
  [`modules/highlights/CLAUDE.md`](modules/highlights/CLAUDE.md).

## Module conventions

A **module** (`modules/<name>/`) is a self-contained unit of cross-cutting logic large enough to
warrant its own directory, barrel and scoped doc rather than living loose in `lib/`. `modules/stats/`
is the reference implementation — see [its own `CLAUDE.md`](modules/stats/CLAUDE.md) for a worked
example of every point below. A well-formed module:

- Has exactly one top-level export file, `index.ts`/`index.tsx`, which implements no business logic
  of its own — it only re-exports selected functions/types from the module's other files. A module
  with some exports that must never reach a Client Component bundle (because they pull in a
  server-only dependency) splits this into two barrels instead — a client-safe `browser.ts` plus an
  `index.ts` that re-exports `browser.ts` and adds the server-only surface — rather than one barrel
  callers have to import selectively from. Every caller reachable from a Client Component then has
  to spell out the `@/modules/<name>/browser` specifier, and **a `modules/<name>/package.json`
  `exports` conditional map cannot take that burden off them.** #1257 spiked exactly that — one
  `@/modules/<name>` specifier everywhere, a `browser` condition routing to `browser.ts` and
  `default` to `index.ts` — and both resolvers ignore the field outright for a local,
  non-`node_modules` directory reached through the `@/*` tsconfig path alias. TypeScript 5.9 under
  `moduleResolution: "bundler"` treats the directory as a plain file/folder load, reading only
  `typings`/`types`/`main` off the `package.json` before falling back to `index.ts`; `exports`
  never appears in its `--traceResolution` output, even with `customConditions: ["browser"]` in
  the active condition set. Turbopack behaves the same way — with `exports` mapping `.`
  *unconditionally* to `./browser.ts`, `next build --turbopack` still resolved `index.ts` in the
  Client Component Browser layer and reproduced the original `Module not found` failure. So it is
  not a matter of picking a different condition name: the map has no effect at all, and the
  explicit `/browser` specifiers stay.
- Keeps its implementation in a `lib/` subdirectory. A module with enough files that some of them
  sensibly group together may use several appropriately-named subdirectories under `lib/` instead
  of one flat directory.
- Keeps every type used across more than one file *within* the module in a single `types.ts`,
  re-exported from `index.ts`/`browser.ts` — not duplicated per file or imported file-to-file,
  which is how type-import spaghetti starts. This governs types the module **owns**. A type owned
  elsewhere (e.g. `app/models/temporal-unit.ts`'s temporal-unit family) is imported directly from
  its canonical home by every file that needs it, module-internal files included — never aliased
  or re-exported through the module's `types.ts`/barrel, which only hides the canonical source
  behind an extra hop.
- Colocates tests next to the file they test, named after it (`foo.ts` → `foo.test.ts`, or
  `__tests__/foo.test.ts`).
- Draws a hard boundary at the module edge: a file (test files included) *outside* the module must
  only import or mock what the module actually exports from `index.ts`/`browser.ts` — never reach
  past the barrel into an internal file directly. If enforcing this means deleting a test that
  reached past the boundary, the cases it covered move into the module's own test suite first,
  if they aren't already covered there.
- Has its own `CLAUDE.md`, scoped the same way the top-level repo-zone docs are (see "Repo zones"
  above) — most file-level context belongs there, not loose inline comments. Keep inline comments
  to a brief sentence on a function's purpose, or on a specific tricky/unintuitive line.
- Is its own **zone**, so creating a new `modules/<name>/` directory is not finished until its
  `zone:modules/<name>` label exists in all three places that have to agree: a row in "Repo
  zones" above, an entry in `.claude/mcp/swarm-tools/tools/create-ticket.ts`'s
  `ZONE_LABEL_DESCRIPTIONS` **and** its `zoneLabels` zod enum (the zod enum needs static
  literals, so this is the one list that can't just link to the doc), and the GitHub label itself
  (`gh label create "zone:modules/<name>" --color 1d76db --description "Touches only
  modules/<name>/ — safe to scope investigation/context to that subtree"`; `create_ticket` also
  creates it on first use). Skipping any of the three is how `zone:agentic-tooling` ended up
  documented in six places but absent from GitHub for months (#1364).
- Keeps files to roughly 400 lines, each with one function reaching `index.ts`/`browser.ts` — a
  file may export more than that to aid testing/mocking, but not extravagantly. Not a hard limit:
  mechanical, repetitive restructuring (e.g. splitting one oversized file into several) is exempt
  from the usual per-branch size heuristic, but the resulting files should still land near this
  size.

## Project structure

This split is far from perfect and suggestions to improve the comprehensiveness and quality are welcome.

- ./lib is for any library files used by both scripts and the core next.js app
- ./app/lib is for any libarry files used only by the next.js app. Where appropriate they should be grouped into subdirectories
- ./app/models should be mainly for data structures, with only very minimal functionlaity for transforming/massaging data into related data structures. Anything more complex should live in ./app/lib. `app/models/temporal-unit.ts` is the canonical TemporalUnit vocabulary — derive new temporal-unit-related types from it rather than redefining the concept elsewhere.

## Caveman
Use the caveman skill judiciously:
- extensively while implementing
- less so when communicating with me
