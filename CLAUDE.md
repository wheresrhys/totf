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

## Creating GitHub tickets

When creating a ticket, add exactly one model label reflecting implementation complexity — the `next-ticket` skill routes implementation to a subagent on that model:

- `sonnet` — small, precisely specified, low-risk changes
- `opus` — fiddly or multi-constraint work (complex SQL, seed-data churn, interacting rules)
- `fable` — complex or foundational work that sets patterns others build on

## Authentication model

There are no per-person logins. Authentication is group-scoped:

1. The selected group is stored in a `selected_group_id` HTTP-only cookie.
2. Server actions call `getAuthenticatedSupabaseClient()` (`lib/group-auth.ts`), which reads the cookie and returns a Supabase client carrying a **custom JWT** embedding `app_metadata.ringing_group_id`.
3. All RLS policies on the database read `ringing_group_id` from this JWT — so the database itself enforces data isolation.
4. Clients are cached in an LRU cache (100 entries, 5-minute TTL) to avoid re-signing JWTs on every request.

**Important:** Multi-tenancy via RLS is only partially implemented. See [issue #149](https://github.com/wheresrhys/totf/issues/149) for current status. Do not assume that all tables are fully isolated — verify before adding features that rely on group isolation.

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

## Schema files

The authoritative schema lives in `supabase/schema/` as declarative SQL files, organised by type (tables, functions, RLS policies, etc.). Migrations in `supabase/migrations/` are generated from diffs — do not write migrations by hand.

### Workflow for schema changes

1. Use `npm run db:console:local` to open Supabase Studio and experiment.
2. Run `npm run db:diff` to see what changed vs. prod.
3. Update files in `supabase/schema/` to match the intended state.
4. Run `npm run db:schema:apply` to generate a migration named after the current branch and apply it to the local db
5. You may want to use `npm run db:seed:local` to repopulate the db with test data
6. Inspect the generated migration file before pushing.
7. Deploy schema changes with `npm run db:migration:push`.

## Data fetching conventions

- All data fetching happens in **server actions** (`app/actions/`), never in client components.
- Every server action calls `getAuthenticatedSupabaseClient()` to get a group-scoped client.
- Errors from Supabase calls are handled via `catchSupabaseErrors()`.
- RPC calls go through `.rpc('function_name', args)` on the Supabase client.
- TypeScript types for DB rows come from `app/models/db.ts`, which re-exports from the auto-generated types.

## Code conventions

- **Models** (`app/models/`) hold domain types and pure transformation logic — no I/O.
- **Actions** (`app/actions/`) are `'use server'` functions that fetch data and return typed results.
- **Components** (`app/components/`) and page files receive data as props; they do not fetch.
- Route pages are in `app/(routes)/` — the `(routes)` group is just for organisation, it doesn't affect URLs.
- Tests live in `__tests__/` directories alongside the code they test.

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
`load-prod-write-env.sh`, which leaves `SUPABASE_JWT_ROLE` unset — JWTs are
`authenticated`, writes allowed but still RLS-scoped to the target group. Break-glass
web-import test against prod: `./scripts/load-prod-write-env.sh next dev --turbopack`
(deliberately not an npm script). Migrations are deployed by the human
(`npm run db:migration:push`).

Note: the deployed Vercel app gets its env directly (no `SUPABASE_JWT_ROLE`), so
production users are unaffected — groups can still import via the web UI.

## Testing

### Test suites

Three separate Vitest configs:

| Suite | Config | Command | Runs in |
|---|---|---|---|
| App tests | `vitest.config.ts` | `npm run test:nowatch` | pre-push hook + CI |
| DB integration tests | `vitest.integration.config.ts` | `npm run test:integration` | pre-push hook (requires local Supabase) |
| HTTP tests | `vitest.http.config.ts` | `npm run test:http` | manually (auto-starts Next.js dev server if not running) |

```sh
npm test              # watch mode (app tests only)
npm run test:nowatch  # single run (app tests)
npm run test:integration  # DB integration tests against local Supabase
npm run test:http     # HTTP tests — starts dev server automatically if needed
npm run qa            # lint + type-check + app tests
```

The pre-push hook runs app tests and DB integration tests. Local Supabase must be running (`npm run db:start:local`) and seeded (`npm run db:seed:e2e`) for integration tests to pass.

HTTP tests (`http-tests/`) use `http-tests/global-setup.ts` to start/stop the Next.js dev server automatically. If a server is already running at `http://localhost:3000` (or `TEST_BASE_URL`), it reuses it and does not kill it after the suite.

### App tests (Vitest + happy-dom)

Tests live in `__tests__/` directories alongside the code they test. Global mocks in `vitest.setup.tsx`:
- `next/link`, `next/navigation`
- `app/actions/group-cookie` (returns group ID `1`)
- `BootstrapPageData` component

Page-level tests render async server components directly with `await Page({ params: Promise.resolve(...) })`.

Snapshot fixture data lives in `test-fixtures/snapshots/` — use these as mock return values rather than inventing data inline.

### DB integration tests (`supabase/__tests__/`)

Test RPC functions and RLS policies against the real local database. Require `npm run db:seed:e2e` to populate test data before running. Use a separate Vitest node environment (no happy-dom).

## Environment variables

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (public) |
| `SUPABASE_JWT_SECRET` | Used to sign group JWTs (must match Supabase project's JWT secret) |
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
