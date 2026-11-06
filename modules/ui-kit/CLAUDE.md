# modules/ui-kit — Claude context

Scoped doc for this module. See the root [`CLAUDE.md`](../../CLAUDE.md) for app overview, tech
stack, and the "Module conventions" section this module follows.

## What this module does

The 12 UI-primitive components, hooks, and design-system building blocks previously living loose
in `app/components/shared/` — sortable/accordion table plumbing, tab plumbing, and design-system
primitives, reused across most page families in `app/`. Pure relocation (#1326): behaviour is
unchanged, only the import path moved. Unlike `modules/stats/`, this module is `zone:app`-only —
it's catalogued here as a module because it's large enough to warrant its own
directory/barrel/doc, not because anything outside `app/` consumes it, so it has no
`browser.ts`/`index.ts` split (none of its files import `next/headers`, `server-only`,
`supabase/server`, or use `'use server'`).

**Five files moved on to `modules/stats-view` (#1353):** the three two-option toggles
(`AggregateByToggle`, `CombineYearsToggle`, `EmptyMonthsToggle`) and the stats-table-specific
`StatsTableBody`/`StatsTableColumnConfigs` factories had no caller outside `modules/stats-view`,
so they're owned there now rather than here — see that module's own `CLAUDE.md` for where they
live and what they build on from this module (`SortableTable`, `AccordionTableBody`,
`NoPrefetchLink`, and the `ColumnConfig`/`RowModelWithRawData` types below, all of which stay
here since `SortableTable.tsx` itself still uses them).

## Directory map

```
modules/ui-kit/
  index.ts    # the single barrel — export * from every file below plus types.ts
  types.ts    # ColumnConfig / RowModelWithRawData — used by SortableTable.tsx here and by
              # modules/stats-view's StatsTableBody.tsx/StatsTableColumnConfigs.tsx, which
              # import them directly from this module's barrel rather than redefining them
  lib/
    Accordion.tsx                 # AccordionItem — single collapsible row, expand/collapse only
    AccordionTableBody.tsx        # AccordionTableBody — <tbody> wiring an AccordionItem per row
    ConditionalTabPanel.tsx       # ConditionalTabPanel — lazy-mounts a tab's content once loaded
    DesignSystem.tsx              # Page/heading/list/table primitives (PageWrapper,
                                   # PrimaryHeading, SecondaryHeading, Standfirst, BoxyList, Table,
                                   # InlineTable, BadgeList, UnwrappedBadgeList) plus
                                   # printLocationName and defaultTableClassName
    NoPrefetchLink.tsx            # NoPrefetchLink — next/link wrapper with prefetch disabled
    RingSearchForm.tsx            # RingSearchForm — ring-number search box, routes to a bird page
    SortableTable.tsx             # SortableTable — generic click-to-sort table shell;
                                   # getFormattedValue applies a column's formatter
    StatOutput.tsx                # StatOutput — single stat display (value + unit + optional
                                   # link); getPlural/getSpaceForUnit are its unit-text helpers
    TabContent.tsx                # TabContent — per-tab fetch/loading/error handling
    TabSet.tsx                    # TabSet — whole page-level tab block: nav + state + content
    TemporalFilterControls.tsx    # TemporalFilterControls — period prev/next/jump navigation
    useLinkableTabs.ts            # useLinkableTabs — ?tabId= read-on-load/write-on-select hook
  lib/__tests__/                  # colocated tests, one per component file above (7 of the 12
                                   # have one; NoPrefetchLink.tsx, ConditionalTabPanel.tsx,
                                   # Accordion.tsx, AccordionTableBody.tsx and DesignSystem.tsx
                                   # currently have none — out of scope for #1326 to add)
```

## Testing

Each component's test colocates with it in `lib/__tests__/`, named after the file it tests
(`SortableTable.tsx` → `SortableTable.test.tsx`), following this repo's general app-test
convention rather than anything module-specific. The one test that belongs to this module as a
whole rather than any single file is the barrel re-export check — `index.test.ts` (or similar)
asserting every name previously importable from `app/components/shared/*` is still importable
from `@/modules/ui-kit`, a regression guard that matters because `modules/stats-view` builds
directly on this barrel's `SortableTable`/`AccordionTableBody`/`NoPrefetchLink` exports and the
`ColumnConfig`/`RowModelWithRawData` types.
