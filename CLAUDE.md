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

## Repo zones

This repo is split into three scoped `CLAUDE.md` files so a session working in one area doesn't
load context for the other two. This root doc holds the cross-cutting overview, shared code, and
anything genuinely used by all three:

- [`supabase/CLAUDE.md`](supabase/CLAUDE.md) — **data layer**: schema, migrations, RPC internals
  and performance notes, data-layer scripts (`supabase/scripts/`), fixture generation, DB
  integration tests, the `@mutates`/exclusive-resource mechanics.
- [`app/CLAUDE.md`](app/CLAUDE.md) — **app**: auth model, data-fetching and route/page/content
  conventions, code conventions, app/HTTP/E2E test conventions.
- [`.claude/CLAUDE.md`](.claude/CLAUDE.md) — **agentic tooling**: ticket workflow, MCP tool
  inventory, hooks.

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

Four separate test configs, spanning all three zones:

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

A handful of root-level directories are genuinely used across two or all three zones and don't
belong to any single scoped doc:

- `lib/supabase.ts` and `lib/demon-import.ts` — imported by `app/`, data-layer scripts
  (`supabase/scripts/`), and `supabase/__tests__/` alike. True 3-zone dependencies; keep them here
  rather than duplicating or picking one zone to own them.
- `lib/slugify.ts` — used by the agentic-tooling `derive_branch_name` MCP tool and the data-layer
  `supabase/scripts/seed-e2e-data.ts`. Small enough (756 bytes) not to be worth splitting.
- `queries/` and `types/` — typed query definitions and the generated `Database` type, consumed by
  both `app/` pages/actions and `supabase/scripts/generate-snapshots.ts`.

## Project structure

This split is far from perfect and suggestions to improve the comprehensiveness and quality are welcome.

- ./lib is for any library files used by both scripts and the core next.js app
- ./app/lib is for any libarry files used only by the next.js app. Where appropriate they should be grouped into subdirectories
- ./app/models should be mainly for data structures, with only very minimal functionlaity for transforming/massaging data into related data structures. Anything more complex should live in ./app/lib.

## Caveman
Use the caveman skill judiciously:
- extensively while implementing
- less so when communicating with me
