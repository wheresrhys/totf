# Session highlight ordering

Session highlights (the "Standouts" list on a session page) are produced by
`app/models/highlights/`. This doc covers the directory layout, how each
group composes its own order, the fixed section order, and why
`long-absence-retrap` sits outside the three groups. See [#758](https://github.com/wheresrhys/totf/issues/758)
for the design discussion this restructure implements, and
[#409](https://github.com/wheresrhys/totf/issues/409) for the restructure
itself.

## Directory layout

```
app/models/highlights/
  shared/
    record-scope.ts        # RECORD_SCOPES / RecordScope / SCOPE_BREADTH_RANK / getScopeMatcher
    placement.ts            # Placement / resolvePlacement — shared 1st/2nd/3rd ranking logic
    session-stats.ts        # SessionStatsData — the shared derive-function input shape
    rare-species-suppression.ts  # cross-group extension point — see below
  rarities/
    types.ts                 # RarityHighlight union
    derive-first-ever-species.ts
    derive-first-of-year-species.ts
    derive-rare-species.ts
    rules/                   # combine-*.ts
    index.ts                 # runRaritiesGroup — derive -> rules -> compose
  counts/
    types.ts                 # CountHighlight union
    derive-session-total.ts
    derive-session-total-juv.ts
    derive-species-count.ts
    derive-species-juv-count.ts
    derive-since-comparison.ts
    rules/                   # remove-*.ts, combine-*.ts
    index.ts                 # runCountsGroup — derive -> rules -> compose
  vital-stats/
    types.ts                 # VitalStatHighlight union
    derive-weight-record.ts
    rules/                   # combine-weight-records.ts
    index.ts                 # runVitalStatsGroup — derive -> rules -> compose
  long-absence-retrap.ts     # sibling of the three groups — see below
  index.ts                   # top-level: SessionHighlight union, { rarities, counts, vitalStats }
```

`app/components/session-highlight-renderers.tsx` (untouched by #409, componentized per group by
a later ticket, #760) renders each highlight via its `type`; `app/actions/session-highlights.ts`
calls the four groups and concatenates them into the flat list the client renders today.

## Each group composes its own order — no shared priority list

Before #758/#409, every highlight stamped a `sortValue: { family, orderWithinFamily }` drawn
from one global `HIGHLIGHT_FAMILIES` priority list, and a final machine rule
(`orderBySortValue`) re-sorted the whole flat pool by that key. That's gone. Each group's
`index.ts` now:

1. Runs its own `derive*` functions to build a raw highlight pool (in a fixed, documented
   generation order).
2. Runs its own `rules/` (removal/combining) over that pool, in the same relative order the old
   flat machine ran the equivalent rules in.
3. Composes the final list as a **literal concatenation of blocks** — plain arrays, no computed
   priority number, no field stamped onto the highlight itself.

### Rarities — `[megaBlock, onlyEverBlock, firstEverBlock, rareBlock, firstOfYearBlock]`

`megaBlock` is sorted by rarity (days-ever ascending) — the ticket's own acceptance criterion.
The other blocks preserve derivation order. This reproduces the old family order
(`mega-species` < `only-ever-species` < `first-ever-species` < `rare-species`) for everything
that stays inside Rarities.

**Intentional deviation from the old flat order:** `first-of-year-species` used to sort in family
position 9 — after every Counts family. It's now part of the Rarities block (last), so a session
that's both first-of-year for one species and holds a Counts record now shows Rarities before
Counts unconditionally. This is an accepted, deliberate consequence of the group-split
architecture (see the #409 PR description), not a bug.

### Counts — `[sessionMagnitudeBlock, speciesCountBlock, juvBlock, sinceBlock]`

This ordering is kind-blocked rather than score-interleaved, but it reproduces the old flat
machine's output exactly for this group: every session-total score there always outranked every
species-count score, and both always outranked the juv families and since-comparison. Within
`speciesCountBlock`/`juvBlock`, a local ordering key (scope breadth, then placement rank) is a
deliberate refinement over the old "same-scope records fall back to generation order" behaviour —
approved as part of #409. The full editorial redesign of Counts' internal composition (rule-6b
fold, exact tie-breaking) is #411/#412/#413/#416's job, not #409's.

### Vital stats — one block

Weight records and their this-year/all-time combined variant are left in derivation order (which
already yields all-time-before-this-year per species, since `deriveWeightRecordBreakers` iterates
scopes all-time-first). A true cross-species "all-time weight → this-year weight" global sort is
#414's call to make, not #409's — that ticket owns Vital-stats' full editorial composition.

## Fixed section order (for the future sectioned UI)

Rarities → Counts → Vital stats. Today's single flat "Standouts" list concatenates them in this
order (`app/actions/session-highlights.ts`); a future ticket (#760) turns this into three
distinct page sections.

## `long-absence-retrap` — excluded from the three groups

`long-absence-retrap` (a bird retrapped after a long gap) is sourced from a per-bird RPC
(`long_absence_retraps`), not the aggregate `stats_per_day_and_species` matrix the three groups
are built from — it's recoveries-shaped, not rarity-shaped. It lives at
`app/models/highlights/long-absence-retrap.ts`, a sibling of the three group directories, and is
exposed from the top-level `index.ts` as its own fourth, independent function
(`deriveLongAbsenceRetraps`). In the flat "Standouts" list it sorts **last** —
`rarities + counts + vitalStats + longAbsenceRetraps` — unlike its old position (between the
leading rarity families and the record block). It's the natural seed for a future "Notable
retraps" section (see #758's comment thread), out of scope until that section is designed.

## Cross-group rare-species suppression — extension point only

The old flat machine had one genuinely cross-group rule: a rare-species highlight suppressed
that same species' own count/juv/weight highlights elsewhere in the pool
(`removeCountAndWeightHighlightsForRareSpecies`, Rem-3). Splitting into independent groups means
Rarities has no way to signal Counts/Vital-stats before their own combine steps run.

`app/models/highlights/shared/rare-species-suppression.ts` defines the suppression logic and its
signal type (`RareSpeciesSuppressionSignal`) as an **extension point** — it is fully implemented
and tested, but nothing in this tree calls it. #418 designs and wires the mechanism that threads
a Rarities-derived signal into Counts and Vital-stats. Until then, a rare species' own
count/weight highlights are **not** suppressed — a deliberate, documented behaviour change from
the pre-#409 output (see the #409 PR description for the specific test case this affects).
