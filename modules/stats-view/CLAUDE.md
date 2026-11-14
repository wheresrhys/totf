# modules/stats-view — Claude context

Scoped doc for this module. See the root [`CLAUDE.md`](../../CLAUDE.md) for app overview, tech
stack, and the "Module conventions" section this module follows.

## What this module does

The "stats table" UI — the sortable, age-bucketed totals tables every summary/species/session tab
is built out of — plus the pure functions that reshape a `stats_cache_*_metrics`/`SimpleStatsCache`
row into the row model each table renders. Five components and four data-shaping helpers,
previously scattered across `app/components/`, `app/components/pages/species/`,
`app/components/pages/session/` and
`app/lib/` with no single owned location. Pure relocation (#1327): behaviour is unchanged, only
the import path moved.

**Widened scope (#1353):** the three two-option toggles (`AggregateByToggle`,
`CombineYearsToggle`, `EmptyMonthsToggle`) and the age-bucketed column-set/table-body factories
(`StatsTableColumnConfigs`, `StatsTableBody`) moved here from `modules/ui-kit` — every caller of
those five files was already inside this module or in an `app/` component rendering one of its
tables, so `ui-kit` was the wrong owner. `ui-kit` still owns the generic `SortableTable`/
`AccordionTableBody`/`NoPrefetchLink` primitives and the `ColumnConfig`/`RowModelWithRawData`
types these five build on, imported from `@/modules/ui-kit` same as before; only the
stats-specific layer moved.

Like `modules/ui-kit` (which this module builds directly on top of) and unlike `modules/stats`,
this module is consumed only by `app/` — nothing else imports it. It's catalogued as a module
because it's large enough to warrant its own directory/barrel/doc (and its own
`zone:modules/stats-view` label), not because it's cross-zone, and
it has no `browser.ts`/`index.ts` split: all five components are `'use client'`
(`SessionSpeciesTotalsTable` was the one plain Server Component until #1431 gave it a
`useState`-backed Counts/Biometrics toggle), but none of the files imports a server-only
dependency, so the single barrel is safe from either side of the boundary.

## Sibling of `modules/stats`, not a child of it

**`modules/stats-view/` is a sibling of `modules/stats/`, deliberately not nested inside it.**
`modules/stats` is imported by the Node CLI importer (`supabase/scripts/import-csv.ts`) as well as
by `app/`, so it has to stay React/JSX-free — a `tsx` component anywhere under it would drag React
into a plain `tsx`-run CLI script's module graph. The name pairing (`stats` → the cache
read/dispatch/refresh pipeline; `stats-view` → the UI that renders what those stats say) is the
whole relationship.

The one edge between them is **type-only and one-directional**: every file here that handles a whole
cache cell imports its shape from `@/modules/stats/browser` — `StatsResult` (the either-grain union)
in `lib/period-totals.ts`, `lib/species-totals.ts` and `components/PeriodTotalsTable.tsx` since
#1417, and `StatsCacheBySpeciesResult` (the by-species member) in `types.ts`,
`lib/species-totals.ts`, `components/SpeciesTotalsTable.tsx` and `components/SppStatsTable.tsx`
since #1418 retargeted them off the deleted `SpeciesStatsRow`.
`modules/stats` imports nothing from here and never will;
the direction is what matters, since the React/JSX constraint above is entirely about what ends up
in `modules/stats`' module graph. Always the `/browser` barrel, never the bare `@/modules/stats`
one — four of the five components here are `'use client'` (see this module's own header, and
`modules/stats/CLAUDE.md`'s "Barrel split").

## Directory map

```
modules/stats-view/
  index.ts    # the single barrel — re-export-only. `MONTH_ABBREVIATIONS`
              # (lib/squashed-month.ts) and `deriveSessionSpeciesBiometrics`
              # (lib/session-species-biometrics.ts) are deliberately not on it: no
              # caller outside the module, the same treatment modules/stats gives
              # runSimpleStatsCacheRefreshPass
  types.ts    # the 6 types shared across more than one file in this module —
              # PeriodTotalsGrouping, PeriodTotalsRow, SpeciesTotalsRow,
              # SpeciesStatConfig, SessionSpeciesBiometrics, StatsClass. Before #1327
              # each lived in whichever helper derived it and was imported
              # file-to-file from there
  lib/
    period-totals.ts    # derivePeriodTotalsRowByBird / ...ByEncounter — one
                        # StatsResult (either grain) -> one PeriodTotalsRow, per the
                        # "Aggregate by" toggle; formatPeriodTotalsLabel for the first column
    species-totals.ts   # deriveSpeciesTotalsRow / ...ByEncounter, plus
                        # calculateRetraps / calculateEncounterRetraps (the
                        # bird-count-minus-new-count derivation both tables and
                        # SummaryStatsSection use)
    session-species-biometrics.ts  # deriveSessionSpeciesBiometrics — the 8 wing/weight
                        # stats for a set of SessionEncounters, computed client-side from
                        # each encounter's raw weight/wing_length (#1431). The one stats
                        # table whose rows the cache can't answer for: they're scoped by
                        # capture_method, a grain nothing materializes. Null-on-empty
                        # (never zero) and an interpolating PERCENTILE_CONT(0.5) median,
                        # matching the SQL layer's own convention for those columns
    species-stats.ts    # speciesStatConfigs — the /species list page's column set, the
                        # file's only export since #1418 deleted mergeSpeciesBiometrics
                        # (the counts/wing-weight rejoin, callerless since #1415) and the
                        # SpeciesStatsRow it returned
    squashed-month.ts   # the 12 month abbreviations a `[yearOrMonth]` route segment
                        # accepts as a squashed-month filter, their parse/format
                        # helpers, and the two squashed-month href builders
    AggregateByToggle.tsx       # AggregateByToggle — bird vs encounter aggregation
                                 # toggle (moved from modules/ui-kit, #1353)
    CombineYearsToggle.tsx      # CombineYearsToggle — combine-all-years vs per-year
                                 # toggle (moved from modules/ui-kit, #1353)
    EmptyMonthsToggle.tsx       # EmptyMonthsToggle — show/hide empty-month rows
                                 # toggle (moved from modules/ui-kit, #1353)
    CountsBiometricsToggle.tsx  # CountsBiometricsToggle — age-bucket counts vs
                                 # wing/weight biometrics toggle for a stats table's
                                 # breakdown block (#1433). Its value is the
                                 # `StatsClass` union ('counts' | 'biometrics'), not a
                                 # `showBiometrics` boolean, so a caller's state and
                                 # the column-building functions it feeds all name the
                                 # stat class outright (#1431 review)
    StatsTableBody.tsx          # createStatsTableBody — factory for a SortableTable
                                 # TableBodyComponent, flat or accordion depending on
                                 # whether an ExpandedContentComponent is supplied
                                 # (moved from modules/ui-kit, #1353). Applies each
                                 # column config's formatter to its data cells, as
                                 # buildTotalsRowCells does to the totals row (#1431)
    StatsTableColumnConfigs.tsx # buildStandardColumnConfigs/buildBiometricColumnConfigs/
                                 # buildTotalsRowCells — the shared age-bucket column set
                                 # (New/Retrap/Pulli/Juv/Postjuv/Adult/Unaged) and its
                                 # colour-blocking (columnBlock), the 8 wing/weight
                                 # columns the Counts/Biometrics toggle switches to
                                 # (#1433), and the totals row (moved from
                                 # modules/ui-kit, #1353)
    __tests__/          # one test per helper above except species-stats.ts (whose only
                        # export is a column-config list tsc already proves, #1418),
                        # plus helpers/two-option-toggle.tsx
                        # (the toggle components' shared test runner, also moved
                        # from modules/ui-kit, #1353)
    components/
      PeriodTotalsTable.tsx         # one row per time period (year/month/day) —
                                     # the summary and species totals tabs' table
      SpeciesTotalsTable.tsx        # one row per species over a period — the
                                     # summary pages' Species totals tab
      SessionSpeciesTotalsTable.tsx # one row per species within one session, with
                                     # an expandable per-species encounters drill-down;
                                     # shared by the Mist-netting and Other catches tabs.
                                     # Its Counts/Biometrics toggle (#1431) switches the
                                     # breakdown block between the age buckets +
                                     # Max Proven Age and the 8 client-side-derived
                                     # wing/weight stats
      SppStatsTable.tsx             # the /species list page's whole table including
                                     # its year/CES/date-range filter form
      SpTable.tsx                   # one row per individual bird of one species, with
                                     # an expandable per-bird encounters drill-down
      __tests__/                    # PeriodTotalsTable, SpeciesTotalsTable,
                                     # SppStatsTable and — since #1431 gave it a
                                     # mode-dependent column set —
                                     # SessionSpeciesTotalsTable have one; SpTable has
                                     # none (#1327 added no new tests, and it's covered
                                     # indirectly through the pages that render it)
```

## What it imports from outside the module

- **`@/modules/ui-kit`** — every component here is a thin domain-specific wrapper over that
  module's `SortableTable`, `AccordionTableBody`, `NoPrefetchLink` and `DesignSystem` primitives,
  plus the `ColumnConfig`/`RowModelWithRawData` types. `StatsTableColumnConfigs`
  (`buildStandardColumnConfigs` / `buildTotalsRowCells` / `createNameLinkCell`),
  `StatsTableBody` and `AggregateByToggle` moved into this module from `ui-kit` (#1353), so a
  component here now imports those via a relative `../lib/*` path rather than `@/modules/ui-kit`.
  This module owns the _stats-specific_ row models, column sets and toggles; `ui-kit` owns only
  the generic table machinery underneath them.
- **`@/modules/stats/browser`** — `StatsResult` and `StatsCacheBySpeciesResult`, the canonical
  cache-cell shapes, imported directly from their owning module by every file here that needs one
  rather than aliased or re-exported through this module's `types.ts`/barrel (the root
  `CLAUDE.md`'s "a type owned elsewhere is imported from its canonical home" rule — the same one
  `modules/stats` applies to `StatsTemporalUnit`). Type-only and one-directional; see "Sibling of
  `modules/stats`" above for why that edge is fine and why it must always be the `/browser` barrel.
- **`@/app/models/{bird,encounter,session}`** — `EnrichedBirdOfSpecies`, `SpeciesWithEncounters`,
  `getAgeClass`. **No file here imports `app/models/db.ts` at all any more** — source or test:
  #1418 retargeted the last two source files (`types.ts`, `lib/species-stats.ts`) off that file's
  `@deprecated` stats aliases onto the canonical `modules/stats` names above, and #1419 swept the
  four test files that still named them as it deleted the aliases outright.
- **A handful of `app/` leaves** — `@/app/lib/group-slug` (`ViewedGroup`),
  `@/app/lib/measurement-range`, `@/app/actions/spp-data` (`SppStatsTable`'s own refetch on filter
  change), `@/app/components/SingleBirdTable`,
  `@/app/components/pages/species/MeasurementRangeCell`,
  `@/app/components/pages/session/EncountersTable`, and the type-only
  `@/app/(routes)/species/page` (`PageData`). The three components among those stayed put on
  purpose: `SingleBirdTable` is independently reused by the mistakes and bird pages, and
  `MeasurementRangeCell`/`EncountersTable` are page-family-specific rather than stats-table
  primitives.

**One of those edges used to close a cycle through the barrel; #1415 broke it.**
`app/actions/spp-data.ts` imported `mergeSpeciesBiometrics` from `@/modules/stats-view` while the
barrel re-exported `SppStatsTable`, which imports `fetchSpeciesData` back out of
`app/actions/spp-data.ts`. The module-boundary rule (root `CLAUDE.md`'s "Module conventions")
forbade the obvious escape — an outside file reaching past the barrel into `lib/species-stats.ts`
directly — so the cycle stood (`next build --turbopack` and the full app suite both passed with
it, verified on #1327). It is gone now that `spp-data.ts` reads whole cache rows and merges its own
arbitrary-window fallback, so it imports nothing from this module at all — and the function it used
to reach for no longer exists, deleted outright by #1418. `SppStatsTable`'s inbound
`fetchSpeciesData` import is the only edge left; if a future change needs a second one in the
other direction, lift that fetch into a prop rather than reintroducing the cycle.

## Testing

Each file's test colocates with it (`lib/__tests__/` for the helpers,
`lib/components/__tests__/` for the components), named after the file it tests, following this
repo's general app-test convention rather than anything module-specific. Everything here runs in
the app suite (`npm run test:nowatch`) — there is no DB or server dependency anywhere in the
module. `__tests__/index.test.ts` is the one test belonging to the module as a whole rather than
any single file — a barrel regression guard scoped to the five names that moved in from
`modules/ui-kit` (#1353), mirroring that module's own `index.test.ts`; it doesn't attempt to
cover this module's pre-existing exports.

`components/__tests__/SessionSpeciesTotalsTable.test.tsx` is the one test here that renders an
`app/` component — it mounts `SessionMistNettingTab`/`SessionOtherCatchesTab` for its last two
cases, since "both session tabs get the toggle" is a claim about those tabs and not about this
table. That's an inward import of an `app/` leaf, the same direction every source file here
already takes (see "What it imports from outside the module"), not a reach past another module's
barrel.
