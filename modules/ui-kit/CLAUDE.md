# modules/ui-kit — Claude context

Scoped doc for this module. See the root [`CLAUDE.md`](../../CLAUDE.md) for app overview, tech
stack, and the "Module conventions" section this module follows.

## What this module does

The 17 UI-primitive components, hooks, and design-system building blocks previously living loose
in `app/components/shared/` — toggles, sortable/accordion table plumbing, tab plumbing, and
design-system primitives, reused across most page families in `app/`. Pure relocation (#1326):
behaviour is unchanged, only the import path moved. Unlike `modules/stats/`, this module is
consumed only by `app/` — it's catalogued as a module because it's large enough to warrant its own
directory/barrel/doc (and its own `zone:modules/ui-kit` label), not because anything outside
`app/` consumes it, so it has no
`browser.ts`/`index.ts` split (none of its files import `next/headers`, `server-only`,
`supabase/server`, or use `'use server'`).

## Directory map

```
modules/ui-kit/
  index.ts    # the single barrel — export * from every file below plus types.ts
  types.ts    # ColumnConfig / RowModelWithRawData — shared across SortableTable.tsx,
              # StatsTableBody.tsx and StatsTableColumnConfigs.tsx; none of the three
              # imports another's file directly for these
  lib/
    Accordion.tsx                 # AccordionItem — single collapsible row, expand/collapse only
    AccordionTableBody.tsx        # AccordionTableBody — <tbody> wiring an AccordionItem per row
    AggregateByToggle.tsx         # AggregateByToggle — bird vs encounter aggregation toggle
    CombineYearsToggle.tsx        # CombineYearsToggle — combine-all-years vs per-year toggle
    ConditionalTabPanel.tsx       # ConditionalTabPanel — lazy-mounts a tab's content once loaded
    DesignSystem.tsx              # Page/heading/list/table primitives (PageWrapper,
                                   # PrimaryHeading, SecondaryHeading, Standfirst, BoxyList, Table,
                                   # InlineTable, BadgeList, UnwrappedBadgeList) plus
                                   # printLocationName and defaultTableClassName
    EmptyMonthsToggle.tsx         # EmptyMonthsToggle — show/hide empty-month rows toggle
    NoPrefetchLink.tsx            # NoPrefetchLink — next/link wrapper with prefetch disabled
    RingSearchForm.tsx            # RingSearchForm — ring-number search box, routes to a bird page
    SortableTable.tsx             # SortableTable — generic click-to-sort table shell;
                                   # getFormattedValue applies a column's formatter
    StatOutput.tsx                # StatOutput — single stat display (value + unit + optional
                                   # link); getPlural/getSpaceForUnit are its unit-text helpers
    StatsTableBody.tsx            # createStatsTableBody — factory for a SortableTable
                                   # TableBodyComponent, flat or accordion depending on whether an
                                   # ExpandedContentComponent is supplied
    StatsTableColumnConfigs.tsx   # buildStandardColumnConfigs/buildTotalsRowCells — the shared
                                   # age-bucket column set (New/Retrap/Pulli/Juv/Postjuv/Adult/
                                   # Unaged) and its colour-blocking (columnBlock) and totals row
    TabContent.tsx                # TabContent — per-tab fetch/loading/error handling
    TabSet.tsx                    # TabSet — whole page-level tab block: nav + state + content
    TemporalFilterControls.tsx    # TemporalFilterControls — period prev/next/jump navigation
    useLinkableTabs.ts            # useLinkableTabs — ?tabId= read-on-load/write-on-select hook
  lib/__tests__/                  # colocated tests, one per component file above (12 of the 17
                                   # have one; NoPrefetchLink.tsx, ConditionalTabPanel.tsx,
                                   # Accordion.tsx, AccordionTableBody.tsx and DesignSystem.tsx
                                   # currently have none — out of scope for #1326 to add)
    helpers/two-option-toggle.tsx # shared fixture/assertions for the toggle components' tests
```

## Testing

Each component's test colocates with it in `lib/__tests__/`, named after the file it tests
(`SortableTable.tsx` → `SortableTable.test.tsx`), following this repo's general app-test
convention rather than anything module-specific. The one test that belongs to this module as a
whole rather than any single file is the barrel re-export check — `index.test.ts` (or similar)
asserting every name previously importable from `app/components/shared/*` is still importable
from `@/modules/ui-kit`, a regression guard that matters because a follow-up module
(`modules/stats-view`) builds directly on this barrel's `SortableTable`/`StatsTableColumnConfigs`
exports.
