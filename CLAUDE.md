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

## Authentication model

There are no per-person logins. Authentication is group-scoped:

1. The logged-in group is stored in a `selected_group_id` HTTP-only cookie.
2. Server actions call `getAuthenticatedSupabaseClient()` (`lib/group-auth.ts`), which reads the cookie and returns a Supabase client carrying a **custom JWT** embedding `app_metadata.ringing_group_id`.
3. RLS policies on the database read `ringing_group_id` from this JWT — so the database itself enforces data isolation.
4. Clients are cached in an LRU cache (100 entries, 5-minute TTL) to avoid re-signing JWTs on every request.

### Cross-group data sharing

Groups can grant other groups read access to their data via the `GroupDataSharing` table (`granter_group_id` → `recipient_group_id`). The relationship is non-commutative and non-transitive. The JWT always carries the **logged-in** group's ID; RLS policies allow reading shared data via a `GroupDataSharing` EXISTS check, without switching the JWT.

`loggedInGroupId` = group from the cookie (always the authenticated user's group).
`viewedGroupId` = group whose data is currently being displayed (may differ when browsing another group's pages).

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
| `GroupDataSharing` | Non-commutative read-access grants between groups (`granter_group_id` shares data with `recipient_group_id`) |

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

## Route structure

- Own-group pages: `/`, `/sessions`, `/species`, `/species/[name]`, `/effort`, `/mistakes`, `/retraps`
- Cross-group pages: `/group/[id]/`, `/group/[id]/sessions`, `/group/[id]/species`, etc.
- Session detail: `/group/[id]/session/[date]` and `/group/[id]/session/[date]/site/[locationId]`
- Bird detail: `/bird/[ring]` — always global, no group prefix
- Import: own-group only, no cross-group variant

Cross-group pages live in `app/group/[id]/`. Thin page wrappers import own-group page components and pass `viewedGroupId` extracted from URL params. `app/group/[id]/layout.tsx` enforces authorization (checks `GroupDataSharing` row exists).

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

To develop against production data:
```sh
npm run next:prod        # dev server pointing at prod Supabase
```
You will need to ask your human to run `op signin` first

## Testing

```sh
npm test              # watch mode
npm run test:nowatch  # single run
npm run qa            # lint + type-check + tests
```

Tests use Vitest with happy-dom. Mocked in `vitest.setup.tsx`:
- `next/link`, `next/navigation`
- `app/actions/group-cookie` (returns group ID `1`)
- `BootstrapPageData` component

Tests render async server components directly with `await Page({ params: Promise.resolve(...) })`.

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

## Setting group passwords

After creating a group, set its login password with:

```sh
npm run set-group-password:local "Group Name" "password"
npm run set-group-password:prod "Group Name" "password"
```

Passwords are bcrypt-hashed with a per-group random salt stored in the `password_salt` column of `RingingGroups`.
