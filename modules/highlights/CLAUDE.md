# modules/highlights — Claude context

Scoped doc for this module. See the root [`CLAUDE.md`](../../CLAUDE.md) for app overview, tech
stack, and the "Module conventions" section this module follows.

## What this module does

The rule-based highlights pipeline that powers the session/summary pages' Highlights tabs. A
**rule** is one `HighlightsGenerator` config object (`rules/*.ts`, registered via
`lib/rule-registry.ts`): a `generator` that turns stats rows into raw `HighlightValue`s, a
`descriptor` naming its category/unit, a `presence` config saying which temporal-unit scopes it
runs at, an optional `condition` gating which scope it applies to at all, and `formatters` that
print the resulting sentence. `getAllHighlightsAcrossScopes`
(`lib/pipeline/run-highlights-pipeline.ts`) runs every registered rule across every scope its
`presence` config names, deduplicates/combines what comes back into `CombinedHighlight`s, and
sorts them into the order the pages render — see "Pipeline phases" below for the four stages this
breaks into.

## Barrel: one `index.ts`, no `browser.ts` split

Unlike `modules/stats`, this module has exactly one barrel, `index.ts` — nothing in
`modules/highlights` has a server-only dependency, so there is no client-unsafe surface to carve
off into a separate `browser.ts`.

That's not an accident to take for granted, though. This module's own predecessor (the old
`lib/hg2.ts`, since split into `lib/pipeline/`) **once broke the dev build** by importing the full
`@/modules/stats` barrel from a client-rendered path instead of `@/modules/stats/browser` — the
same `@opentelemetry/api`-into-the-browser-bundle failure documented in
[`modules/stats/CLAUDE.md`](../stats/CLAUDE.md#barrel-split-indexts-vs-browserts). This module is
itself reachable from a Client Component: `app/components/pages/session/session-tab-config.ts`
declares its Highlights tab's `TabConfig.dataFetcher` as `clientSideOnly: true`, which means that
`dataFetcher` — and everything it imports, including the bare `@/modules/highlights` barrel — runs
in the browser, not on the server. **Every file in this module that touches `modules/stats` must
keep importing `@/modules/stats/browser`, never the bare `@/modules/stats` barrel** — this was
checked against every `modules/stats` import in the module while writing this doc
(`lib/pipeline/fetch-scoped-stats.ts`, `lib/highlight-utils.ts`, `lib/rule-utils.ts`,
`rules/rarities.ts`) and all four are still `/browser`. Only test files import the bare barrel
(for types only, which are erased at compile time and never reach a bundle), which is fine.

## Directory map

```
modules/highlights/
  index.ts          # the one barrel above
  types.ts          # every type owned by and shared across more than one file in this module
  const.ts          # DEFAULT_THRESHOLD — see "Rule-authoring notes" below
  lib/
    pipeline/              # the 5 files split out of the old lib/hg2.ts — see "Pipeline phases"
      scope-config.ts         # getPresence / getTimeWindow — scope-config helpers the fan-out
                               # phase reads a rule's `presence` through
      fetch-scoped-stats.ts   # getScopedHighlightsOfType — the fetch phase
      fan-out-raw-highlights.ts # getRawHighlightsOfTypeAcrossScopes — the fan-out phase
      combine-highlights.ts    # removeLessSignificantHighlights / combineSimilarHighlights —
                               # the combine phase
      run-highlights-pipeline.ts # getAllHighlightsAcrossScopes — the orchestrator, including
                               # the sort phase (delegates to highlight-utils.ts's sortHighlights)
    rule-registry.ts   # the highlightRules array + getRule(type) lookup
    rule-utils.ts       # shared finder factories (getTopByProperty / getTopByPropertiesSum) —
                        # see "Rule-authoring notes"
    highlight-utils.ts  # scope filtering/caching, ranking (limitHighlights), final sortHighlights
    printer-utils.ts    # sentence-building helpers every rule's formatters compose
  rules/                # one file per registered rule — see "Why rules/ stays top-level" below
    __tests__/          # rules' own tests, colocated here rather than under lib/
```

### Why `rules/` stays top-level rather than `lib/rules/`

This is a deliberate, named exception to the module-conventions "keep implementation in `lib/`"
rule. Each `rules/*.ts` file is not an implementation helper — it's a registered
`HighlightsGenerator` config object, and together they form this module's public rule catalogue:
`lib/rule-registry.ts`'s `highlightRules` array is built by importing every one of them, and that
array (via `getRule`/`ruleTypes`) is what the rest of the pipeline treats as the catalogue of
highlights that can be generated. Registering a new highlight means adding a file here, not
editing a shared implementation file — closer in kind to the module's public surface than to its
internals. The tests back that framing up structurally too: `rules/__tests__/` sits alongside the
catalogue it tests, separate from `lib/__tests__/`'s tests of the shared internals.

## Pipeline phases

`getAllHighlightsAcrossScopes` (`lib/pipeline/run-highlights-pipeline.ts`) runs every rule in
`highlightRules` across both `inter`/`intra` outlooks; for each rule it runs these four phases in
order:

1. **Fetch** (`lib/pipeline/fetch-scoped-stats.ts`'s `getScopedHighlightsOfType`) — loads one
   scope's rows from `SimpleStatsCache`/`SimpleStatsCacheBySpecies` via
   `globalStatsCacheFetchPool`, narrows the pool's plain `Record<string, unknown>[]` return to
   `StatsResult[]` (every other `readStatsCacheRows`-family caller narrows the same way), filters
   those rows to the rule's scope/species, and runs the rule's `generator` to produce raw
   `NewHighlightValue`s for that one scope.
2. **Fan-out** (`lib/pipeline/fan-out-raw-highlights.ts`'s `getRawHighlightsOfTypeAcrossScopes`,
   reading `scope-config.ts`'s `getPresence`/`getTimeWindow`) — resolves a rule's `presence`
   config into one fetch config per sample-temporal-unit/lake-scope combination, then calls the
   fetch phase for every one of them concurrently (`Promise.all`).
3. **Combine** (`lib/pipeline/combine-highlights.ts`) — two steps:
   - `removeLessSignificantHighlights` drops ("clobbers") a highlight when a broader-scoped
     sibling already reports the same fact. A highlight is never compared against itself; a
     potential clobberer must share the same rule type, category, sample temporal unit and
     species as the highlight it's evaluating — it only ever drops a restatement of the *same*
     metric, never a different one; the clobberer must be ranked at least as good as the
     highlight it's dropping (a 2nd-place highlight can't clobber a 1st-place one); and **only an
     all-time-scoped highlight** (no `parentTimeWindow`) is allowed to clobber — a narrower scope
     never drops a broader one. The one exception: if the clobberer and the highlight tie for the
     same position but the clobberer's tie is ambiguous (several items share that position) while
     the highlight's win is a sole, un-tied one, the narrower highlight survives — printing the
     unambiguous win rather than silently losing it to an ambiguous broader tie.
   - `combineSimilarHighlights` groups what's left by `(temporalUnit, timePeriod, species)`,
     sorts each group by position/time-window breadth, and emits the `CombinedHighlight`s pages
     render — one per group, carrying every surviving scope so the printer can list them all.
4. **Sort** (`run-highlights-pipeline.ts` delegates to `lib/highlight-utils.ts`'s
   `sortHighlights`) — orders the combined results by category (rarity → count → biometrics →
   demographics), then species-presence, then position/time-window breadth, then value — the
   final order the Highlights tabs render in.

## Rule-authoring notes

Two sanctioned extension points: new shared finders in `lib/rule-utils.ts`, and new rules in
`rules/`. A few things aren't obvious from the code alone:

- **`DEFAULT_THRESHOLD`** (`const.ts`, value `2`) is the floor below which a finder's would-be top
  value isn't distinctive enough to surface as a highlight: `getTopByPropertiesSum`
  (`lib/rule-utils.ts`) only keeps rows at or above `Math.max(threshold, max / 2)` — i.e. at least
  the threshold *and* at least half of the scope's maximum — so a scope whose best count is
  trivially small (e.g. a single bird) doesn't get highlighted just for being the biggest of a
  tiny set.
- **`suppressInEarliestPeriod`** (a `HighlightFinderOptions` field in `lib/rule-utils.ts`) exists
  to drop an appearance that falls in the earliest period of a rarity finder's working set — on a
  group's very first session (or first month, or first year), every species is trivially a "first
  record", which says more about where the data starts than about the birds.
- **`rules/each-species-count.ts`** suppresses a highlight for a low max count (under 5) if that
  max has occurred twice or more — e.g. catching 2 Kingfishers happens often enough that "highest
  ever: 2" isn't worth a highlight every time, whereas a species whose all-time max of 2 happened
  only once is still worth noting.
- **`rules/rarities.ts`** has three quirks specific to its printer/generator:
  - Its `combinedHighlightPrinter` only ever reads `scopes[0]`. Unlike a count metric, where each
    extra scope adds information ("busiest ever **and** busiest of 2020"), every extra scope on a
    first record merely restates the broadest one — a species' first record ever is necessarily
    also its first of that year, so only the broadest scope (`scopes[0]`, per
    `sortByPositionAndTimeWindow`) is printed.
  - The highlight's carried `value` is the cell's raw encounter count; it's only ever read as the
    singular/plural switch on the species name in the printer, never displayed as a number itself
    (the `descriptor.unit` is `'encounter'` for the same reason, even though no count is shown).
  - Its `condition` excludes a month-only window (`!scope.parentTimeWindow?.month`) because "of
    any February" has no coherent reading as a first record — the earliest February a species
    appeared in isn't a first of anything.
- **`lib/printer-utils.ts`**: `printSpeciesForCount` pluralises the species name to agree with the
  count the sentence is about ("Robin" for one bird, "Robins" for more) — the rarity rules name
  the species directly in their sentences ("First Robins ever") rather than a unit ("First Robin
  records ever"), so the species name is what has to agree. `printCombinedHighlight`'s
  `onlyBroadestScope` option exists because some metrics (first/only/rare species records) are
  the same fact whichever scope they were found at, so the narrower scope is discarded outright
  rather than combined into the sentence the way `firstLineItem`/`lineItem` normally would.
- **`types.ts`**'s `HighlightsGenerator.generator` reads `modules/stats`' `StatsResult` — either
  member of that discriminated union, i.e. an all-species-combined or a per-species cache cell
  (#1413 retargeted this and `lib/highlight-utils.ts` onto it; they used to spell the union out
  by hand as `SimpleStatsCacheBySpeciesRow | SimpleStatsCacheRow`, which also forced an
  `as A[] & B[]` cast to get past this very signature) — historically the field was spelled `rpcName: 'core_stats' |
  'biometrics_stats'`, naming the RPC a rule's stats came from, back when a rule really did
  dispatch its own RPC call. Every rule's stats now come from the same
  `SimpleStatsCache`/`SimpleStatsCacheBySpecies` read, so the field is now purely a column-subset
  label over that one row set — and both `core_stats` and `biometrics_stats` have since been
  deleted from the schema outright, which would have left the old name pointing at functions that
  no longer exist.

## Testing

`lib/rule-utils.ts`'s shared finder factories (`getTopByProperty`/`getTopByPropertiesSum`) are
unit-tested once, directly, in `lib/__tests__/rule-utils.test.ts`. That one test file is also the
coverage path for 11 of the 12 registered rules: every rule but `rarities` builds its `generator`
from one of these shared finders, so `rules/__tests__/rules.combinedhighlights.output.test.ts`
(with its fixtures in `rules/__tests__/fixture-generator.ts` and expected output in
`rules/__tests__/expectations.ts`) snapshot-tests each rule's *printer* against a battery of
generated `CombinedHighlight` shapes, rather than re-testing finder logic the shared suite already
covers. `rarities` is excluded from that shared matrix — its `generator` has bespoke logic (the
'Only'/'first of only N'/'N of only M' value shapes) that no shared finder produces and the shared
matrix's fixtures don't model — so it gets its own direct test file, `rules/__tests__/rarities.test.ts`,
covering both its `generator` and its printer with hand-crafted, shape-appropriate fixtures.
`lib/highlight-utils.ts`'s scope-filtering/ranking/sort helpers are covered directly in
`lib/__tests__/highlight-utils.test.ts`.
