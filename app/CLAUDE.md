# App — Claude context

Scoped doc for everything under `app/`. See the root [`CLAUDE.md`](../CLAUDE.md) for app overview,
tech stack, and cross-zone shared code (`lib/supabase.ts`, `lib/demon-import.ts`); see
[`supabase/CLAUDE.md`](../supabase/CLAUDE.md) and [`.claude/CLAUDE.md`](../.claude/CLAUDE.md) for
the other two zones.

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
authenticated client; a public grant via `public_core_stats`, checked _before_ any
authenticated/RLS attempt — since `public_core_stats` is a pure gated pass-through to
`core_stats` for the same params, this never shows an already-authorised cross-group viewer a
degraded view, and it spares an anonymous visitor a wasted authenticated attempt; an existing
`GroupDataSharing`-granted cross-group view via the normal authenticated client, only attempted once
the target isn't public and the viewer actually has a session; or blocked), returning
`{ accessLevel, rows }` — every summary-stats action function (`app/actions/summary-stats.ts`,
`period-totals.ts`, `spp-data.ts`) routes through it (currently destructuring only `rows`) instead of
calling `getAuthenticatedSupabaseClient()` + `core_stats` directly. (`core_stats`/`public_core_stats`
are byte-identical siblings of the still-schema-resident `core_stats`/`public_aggregate_stats`
RPCs — #830 moved every app-code call site onto the new names; a later ticket deletes the old ones.
See `supabase/CLAUDE.md`'s "Companion stats RPCs" for the RPC-side internals.)

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

## Data fetching conventions

- Data fetching happens in **server actions** (`app/actions/`) or in server-rendered pages/components — never in client components (anything marked `'use client'`).
- Every data-fetching function calls `getAuthenticatedSupabaseClient()` to get a group-scoped client.
- Errors from Supabase calls are handled via `catchSupabaseErrors()`.
- RPC calls go through `.rpc('function_name', args)` on the Supabase client.
- TypeScript types for DB rows come from `app/models/db.ts`, which re-exports from the auto-generated types. Types for a query's return shape (e.g. an embedded-relation select used by only one page) can live alongside the page/component that fetches and renders it instead, if not reused elsewhere.
- **Temporal filtering** of a direct `Encounters` table query goes through `applyTemporalFilter`
  (`app/lib/supabase/temporal-filter.ts`, #1075) — never hand-rolled `.gte`/`.lte` calls. It takes
  the standard `{fromDate, toDate, year, month}` filter (#1051, the same shape as the stats RPC
  family's `from_date`/`to_date`/`year_filter`/`month_filter`), intersects all four into inclusive
  `Encounters.visit_date` bounds, and returns the same query builder so it composes inside a
  `fetchAllPaginatedRows` callback — it never calls `.range()`/`.order()`/`.select()`, which stay
  the caller's. A bare `month` with no `year` is a squashed-month filter, not a contiguous range,
  so PostgREST can't express it and the helper throws: route that through the RPC family's
  `month_filter` instead.

## Code conventions

- **Models** (`app/models/`) hold domain types and pure transformation logic — no I/O.
  - Session highlights (`app/lib/highlights/`) A rule is one `HighlightsGenerator` object (`rules/*.ts`, registered in `rules/index.ts`): a `statsSelector` picking `overall` / `withSpecies` / `bySpecies` off the `core_stats` repository (`app/actions/stats-cache.ts`), a `generator` built by a finder in `lib/rule-utils.ts`, a `descriptor` whose `category` names the page section, a `condition` gating which temporal unit / parent window it applies to, and `formatters` that print the sentence. `lib/highlight-generator.ts` runs every rule at the all-time, year and month scopes; `lib/time-period-highlights.ts` then cherry-picks the highlights landing on the period being rendered, drops narrower-scoped restatements (`removeLessSignificantHighlights`), folds what's left across scopes (`combineSimilarHighlights`) and sorts by category. Registering a rule is enough to cover it: `rules/__tests__/rules.combinedhighlights.output.test.js` snapshot-tests every registered rule's printer against a battery of generated `CombinedHighlight` shapes — regenerate `rules/__tests__/expectations.ts` (`npx tsx app/lib/highlights/rules/__tests__/generate-expectations.ts`, then `npm run lint` to format it) and commit it with any new or changed rule, rather than hand-writing a per-rule test file. The two sanctioned extension points are new finders in `lib/rule-utils.ts` and new properties on its `HighlightFinderOptions`; don't add a second combining mechanism. **Combining is strictly one metric, one species, several scopes** — the Rarities migration (#990) deliberately lost v1's multi-species "First A, B and C records" lines and its cross-metric MEGA badge because neither is expressible that way; `combineSimilarHighlights`' header comment is the authority on this, read it before trying to reinstate either.
    - `app/components/pages/session/SessionHighlights.tsx` fetches this pipeline (`getCondensedHighlightsAtTimePeriod`) and renders the same three independently-shown/hidden sections in the fixed Rarities → Counts → Vital stats order: the first two filter the v2 list by `descriptor.category` and print with each highlight's own `combinedHighlightPrinter`, the third partitions the v1 list by the renderer map's keys. Editorial refinements belong in a v2 rule's finder/printer for those two sections, and in a v1 rule or renderer for Vital stats.
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
- **URL-addressable client state** (e.g. `/compare/species`' repeated `?name=` species selection,
  #115): the server `page.tsx` parses `searchParams` in its `getParams` into the shape the content
  component wants, seeds `useState` from it, and mirrors later changes back onto the URL with
  `window.history.replaceState` — not `router.replace`/`push`. Next.js supports the native history
  API for search-param updates, and where the state is a pure client-side filter over data the page
  has already fetched (as it is there — one fetch covers every selection), a real navigation would
  re-run the server component and its RPCs to produce byte-identical data. `replaceState` rather
  than `pushState` keeps a run of toggling out of the back button. Reach for `router.replace` only
  when the new URL genuinely needs a different server render.
  Tab selection follows the same convention and needs no per-page wiring: `useLinkableTabs`
  (`app/components/shared/useLinkableTabs.ts`) reads `?tabId=` on load via
  `app/lib/tab-query-param.ts`'s `resolveInitialTabId` and writes the selected tab back via its
  `setTabIdSearchParam` (#1013), so every page that takes its tab state from that hook — directly,
  or through the shared `TabSet` component (`app/components/shared/TabSet.tsx`) — gets
  reload-survivable, copy-pasteable tab links for free.

Naming reference (see #667 for the original design discussion):

| Route                                                    | PageComponent (`page.tsx`) | ContentComponent (`PageContent.tsx`) | dataFetcher (`page.tsx`)  | Child-component directory  |
| -------------------------------------------------------- | -------------------------- | ------------------------------------ | ------------------------- | -------------------------- |
| `app/(routes)/group/[groupSlug]/session/[date]/page.tsx` | `GroupSessionPage`         | `SessionPageContent`                 | `fetchSessionPageContent` | `components/pages/session` |
| `app/(routes)/bird/[ring]/page.tsx`                      | `BirdPage`                 | `BirdPageContent`                    | `fetchBirdPageContent`    | —                          |
| `app/(routes)/species/[speciesName]/page.tsx`            | `SpeciesPage`              | `SpeciesPageContent`                 | `fetchSpeciesPageContent` | `components/pages/species` |

## Testing

### Test suites relevant to this zone

| Suite      | Config                  | Command                                                          | Runs in                                                  |
| ---------- | ----------------------- | ---------------------------------------------------------------- | -------------------------------------------------------- |
| App tests  | `vitest.config.ts`      | `npm run test:nowatch`                                           | pre-push hook + CI                                       |
| HTTP tests | `vitest.http.config.ts` | `npm run test:http`                                              | manually (auto-starts Next.js dev server if not running) |
| E2E tests  | `playwright.config.ts`  | `npm run test:e2e` (full) / `test:e2e:safe` / `test:e2e:mutates` | pre-push hook only (diff-aware)                          |

See the root [`CLAUDE.md`](../CLAUDE.md) for the full test-suite matrix (including the DB
integration suite) and CI job summary.

### App tests (Vitest + happy-dom)

Tests live in `__tests__/` directories alongside the code they test. Global mocks in `vitest.setup.tsx`:

- `next/link`, `next/navigation`
- `app/actions/group-cookie` (returns group ID `1`)
- `BootstrapPage` component

Page-level tests render async server components directly with `await Page({ params: Promise.resolve(...) })`.

Snapshot fixture data lives in `test-fixtures/snapshots/` — use these as mock return values rather
than inventing data inline. See `supabase/CLAUDE.md`'s "Fixture generation and freshness checking"
for how fixtures are organised, generated, and kept in sync with the RPCs/tables they mirror — that
doc owns the data-source side, this one covers how app tests consume them.

**Never write `fixture as unknown as SomeType` for a new fixture cast — try `fixture as SomeType`
first (#895).** The double assertion through `unknown` switches assignability checking off
completely, so a fixture's shape is never compared against the type at all — a fixture missing a
column the type has since gained goes uncaught. A direct single assertion still doesn't catch
every drift (an imported JSON module isn't a fresh object literal, so TypeScript's
excess-property check never applies to it — a fixture carrying a column the type has since
_removed_ stays assignable either way; that direction is `supabase/__tests__/snapshot-fixture-freshness.test.ts`'s
job, see `supabase/CLAUDE.md`), but it does catch a newly-_added_ required column, which the double
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
to reach the old value — only tests whose stated purpose _is_ that toggle should drive state via
clicks. For every other test, a full-dataset row count used merely as an incidental "did it load"
load-signal should just be corrected to whatever the new default actually renders. Toggle-specific
describe blocks should be inverted (default-state assertions swap direction; a click now reveals the
old default instead of the new one). Watch for genuinely redundant tests this exposes (e.g. a
zero-fill assertion already covered by a model-level unit test) — delete rather than contort. Also
watch for corner cases the new default introduces that are worth a dedicated test in their own right
(e.g. a component that renders no controls at all once its default filters every row away, so the
"reveal" toggle becomes unreachable in that state).

### HTTP tests

`http-tests/` uses `http-tests/global-setup.ts` to start/stop the Next.js dev server automatically.
The default server URL is derived per-worktree from `scripts/worktree-test-port.ts`
(`deriveWorktreePort()` hashes the worktree's absolute path into a fixed port range, avoiding `3000`
and the local Supabase ports) — so concurrent swarm worktrees each get their own port and a reused
server can only ever be one this same worktree started, never a sibling's. Set `TEST_BASE_URL` to
override the derivation and point at a specific/remote server. If a server is already running at the
resolved URL, it reuses it and does not kill it after the suite. `playwright.config.ts` uses the
same helper for the E2E dev server.

### E2E tests (Playwright) — what's tested

Playwright specs live in `e2e/`, run against fixed seed-data groups (`Alpha`/`Beta`/`Gamma`/`Delta`,
seeded by `npm run db:seed:e2e`) and exercise app pages end to end (bird, sessions, species, import,
retraps, mistakes, etc.) — mostly read-only assertions against stable seed data. See
`supabase/CLAUDE.md`'s "E2E `@mutates` / exclusive-resource mechanics" for how the one mutating
spec (`e2e/authenticated/import.spec.ts`) is kept from colliding across concurrent swarm worktrees.

## Web import

Logged-in groups can also upload CSVs via the UI at `/import`. The page POSTs to `POST /api/import` (`app/api/import/route.ts`), which streams NDJSON progress back to the browser. Processing is sequential (no rate limiter) and aborts with a date-range summary after 280 seconds. Vercel `maxDuration` is set to 300s. Core import logic is shared with the CLI script — see `supabase/CLAUDE.md`'s "CSV data import".
