# Research notes — issue #859

**Title:** Add `allowYearAccumulation` prop + Accumulate toggle (stacked-area, cross-toggle
rules) to `YearComparisonTrendChart`

**Parent:** #853 ("Arrivals chart") — tracking issue. #859 is pure component work, **no RPC
dependency** (independent of #858 `arrivals_stats`). #860 (the Arrivals tile) is the first
consumer and is blocked by #858 + #859.

**Model label:** opus. **Type:** UI-only, single stack layer → **one PR that closes #859** (no
DB / no multi-PR chain). No `db-migration` / `e2e-exclusive` labels apply.

---

## Files

- Component: `app/components/YearComparisonTrendChart.tsx`
- Tests: `app/components/__tests__/YearComparisonTrendChart.test.tsx`

Both already read in full. No other files need touching (the consumer tile is #860, out of
scope here).

## Scope / acceptance criteria (from the ticket)

1. New prop `allowYearAccumulation?: boolean` (default undefined/false) — gates whether the
   Accumulate toggle is offered at all. Same pattern as `effortHistory` gating Normalize.
2. New local state `accumulate` (default `false`).
3. Toggle renders only when `allowYearAccumulation && mode === 'all-time'`. (compare-years /
   this-year reshape per-year incompatibly — extending accumulate to them is explicitly OUT of
   scope.)
4. **Accumulate × Interval rule:** while `accumulate` is true, `interval` is forced to `'month'`
   and the Interval toggle is hidden — extend `showIntervalToggle`'s condition
   (`mode === 'all-time' && spansMultipleYears(series)`) with `&& !accumulate`; turning accumulate
   on also resets any existing `interval === 'year'` back to `'month'`.
5. **Mode-reset rule:** the mode switcher's `onChange` also resets `accumulate` to `false`
   whenever the newly selected mode isn't `'all-time'` (so accumulate never persists "on but
   hidden and inert").
6. **Accumulate × Normalize composition rule:** when both on, do NOT accumulate already-normalized
   per-month rates. Accumulate the raw series values and the effort-hours denominator *separately*
   across the year-to-date, then divide once per month:
   `cumulative_raw_count[month] / cumulative_effort_hours[month]` — NOT `sum of (raw[m]/effort[m])`.
   Accumulate is **mutually exclusive** with the plain `normalizeSeriesByEffort` call — the
   combined numerator/denominator transform *replaces* it, doesn't compose on top.
7. Stacked-area rendering: when accumulate on, the all-time `LineChart` renders with `fill: true`
   per dataset and `scales.y.stacked: true`, layered on top of `TREND_CHART_LIBRARY` (not
   replacing it).
8. Export the new transform(s) alongside the file's existing exported transforms for direct unit
   testing.

## Out of scope

- Extending accumulate to compare-years / this-year modes.
- The `arrivals_stats` RPC and the Arrivals tile itself (#858 / #860).

---

## Design / approach decided

### New transform: `accumulateSeriesByYear(metric, effortHistory?)`

Single exported function; the optional second arg triggers the Normalize composition. Placed
after `aggregateSeriesByYear`, exported. Operates per-metric (like `aggregateSeriesByYear`),
preserving the `[date, value]` shape (unlike `toYearOnYearSeries`, which reshapes to month
labels) so it drops straight into the all-time timeline pipeline.

Semantics:
- Sort points by date ascending (running sum is order-dependent; dense spine is already ordered
  but sort defensively — lexical ISO-date compare is fine).
- Track `currentYear`, `cumulativeCount`, `cumulativeEffortHours`, `seenReportableThisYear`. Reset
  all four at each new calendar year (UTC year, matching sibling transforms' UTC handling).
- Reuse the `hasReportableValue` gap convention (a dense-spine `0` is a gap): a gap month
  contributes nothing to the sum but does **not** reset/break the running total — it carries
  forward flat.
- Output value:
  - Before the first reportable month of a year → `null` (leading gap, so the area doesn't start
    at zero prematurely).
  - Raw mode (no effort) → `cumulativeCount`.
  - Composed mode (effort) → `cumulativeEffortHours ? cumulativeCount / cumulativeEffortHours : 0`
    (0 for zero/missing effort — mirrors `normalizeSeriesByEffort`, never NaN/Infinity).

Decision on gap-month output value: a mid-series gap outputs the carried-forward running sum
(flat), NOT `null`. Rationale: a cumulative count can't "un-happen"; for arrivals the cumulative
total is still whatever it was. Only *leading* gaps (before first data this year) are `null`.

### Stacked-area chart config

Module-level constant layered on top of `TREND_CHART_LIBRARY`:

```ts
const STACKED_AREA_CHART_LIBRARY = {
  ...TREND_CHART_LIBRARY,
  elements: {
    ...TREND_CHART_LIBRARY.elements,
    line: { ...TREND_CHART_LIBRARY.elements.line, fill: true }
  },
  scales: { y: { stacked: true } }
};
```

`elements.line.fill: true` = "fill true per dataset" (chart.js applies the line-element default to
every line dataset — equivalent to per-dataset fill, and keeps it a single "layered on top"
object rather than mutating each series). All-time `LineChart` gets
`library={accumulating ? STACKED_AREA_CHART_LIBRARY : TREND_CHART_LIBRARY}`.

### Pipeline placement

`accumulating = !!allowYearAccumulation && accumulate && mode === 'all-time'` (gate on `mode` too
so compare-years/this-year sub-charts — which derive from `effectiveSeries`/`plottedSeries` — can
never receive accumulated data even for a render frame).

`effectiveSeries` becomes:
```ts
const effectiveSeries = accumulating
  ? series.map((metric) =>
      accumulateSeriesByYear(metric, normalize && effortHistory ? effortHistory : undefined))
  : normalize && effortHistory
    ? normalizeSeriesByEffort(series, effortHistory)
    : series;
```
`effectiveYtitle` stays driven by `normalize` alone → when accumulate+normalize, ytitle is
"… per hour" (correct: cumulative rate). `plottedSeries` (Total append) and `allTimeSeries` (year
aggregation) are unchanged — since accumulate forces `interval === 'month'`, the year-aggregation
branch is never taken while accumulating, so no special-casing needed there. Total (if
`includeTotalSeries`) is summed from the accumulated metrics = cumulative total, which is correct.

### Cross-toggle wiring

- `showIntervalToggle = mode === 'all-time' && spansMultipleYears(series) && !accumulate`.
- `showAccumulateToggle = !!allowYearAccumulation && mode === 'all-time'`.
- Mode switcher `onChange`: `setMode(v); if (v !== 'all-time') setAccumulate(false);`.
- Accumulate toggle `onChange`: `setAccumulate(v); if (v) setInterval('month');`.

### Toggle UI

Yes/No radio group mirroring Normalize. Renamed the existing `NORMALIZE_OPTIONS` constant to a
shared `YES_NO_OPTIONS` (used by both Normalize and Accumulate — DRY; a small in-file rename).
Accumulate group uses `name={`${toggleName}-accumulate`}` / `id={…-accumulate-${value}}` so it's
a distinct radio group. Placed in the same wrapping flex row, after the Normalize block.

**Test-ambiguity note:** both Normalize and Accumulate render "Yes"/"No" labels, so
`getByRole('radio', { name: 'Yes' })` is ambiguous when both are present. Tests that toggle both
must scope the query — e.g. `within(screen.getByText('Accumulate').parentElement!)` (the label
`<span>Accumulate</span>` is the first child of the group `<div>`), or `getAllByRole(...)` by
index. Import `within` from `@testing-library/react`.

---

## Progress so far (edits already applied to the working tree, NOT committed)

These are uncommitted modifications to `app/components/YearComparisonTrendChart.tsx`. They are
left in the working tree but excluded from the WIP commit (only `RESEARCH-859.md` is committed):

1. DONE — renamed `NORMALIZE_OPTIONS` → `YES_NO_OPTIONS` (constant + its use in the Normalize
   toggle map).
2. DONE — added exported `accumulateSeriesByYear(metric, effortHistory?)` after
   `aggregateSeriesByYear`, with the full raw + composed-normalize logic described above.
3. DONE — added `STACKED_AREA_CHART_LIBRARY` constant (immediately before `type ChartMode`).
4. DONE — added `allowYearAccumulation` to the prop destructuring and to the props type (with
   doc comment).
5. DONE — added `const [accumulate, setAccumulate] = useState(false);`.
6. DONE — added `accumulating` flag + rewrote `effectiveSeries` to the accumulate-or-normalize
   branch.
7. DONE — `showIntervalToggle` extended with `&& !accumulate`; added `showAccumulateToggle`.
8. DONE — mode switcher `onChange` now resets accumulate when leaving all-time.

### Remaining work (NOT yet done)

A. **Insert the Accumulate toggle JSX** into the toggle row — after the Normalize `) : null}`
   block and before the row-closing `</div>`. The file uses **TAB** indentation; the toggle
   items sit at 4 tabs (the `{showAccumulateToggle ? (` opener), mirroring the `{effortHistory ? (`
   Normalize block exactly. Insert target: after the current line reading `\t\t\t\t) : null}`
   that closes the Normalize block (was line 760 pre-insert), before `\t\t\t</div>`. JSX to add:
   ```jsx
   {showAccumulateToggle ? (
     <div className="flex items-center gap-1">
       <span className="text-sm">Accumulate</span>
       <div className="border-base-content/20 flex gap-0.5 rounded-field border p-0.5">
         {YES_NO_OPTIONS.map((option) => (
           <label
             key={String(option.value)}
             htmlFor={`${toggleName}-accumulate-${option.value}`}
             className="btn btn-sm btn-text has-checked:btn-active"
           >
             <span>{option.label}</span>
             <input
               id={`${toggleName}-accumulate-${option.value}`}
               name={`${toggleName}-accumulate`}
               type="radio"
               className="hidden"
               checked={accumulate === option.value}
               onChange={() => {
                 setAccumulate(option.value);
                 if (option.value) setInterval('month');
               }}
             />
           </label>
         ))}
       </div>
     </div>
   ) : null}
   ```

B. **Make the all-time `LineChart` library conditional.** Change the all-time chart's
   `library={TREND_CHART_LIBRARY}` (the one in the `mode === 'all-time'` block, NOT the identical
   one in `PerMetricChartGrid`) to
   `library={accumulating ? STACKED_AREA_CHART_LIBRARY : TREND_CHART_LIBRARY}`.

   ⚠️ `library={TREND_CHART_LIBRARY}` appears **twice** in the file (PerMetricChartGrid + all-time
   chart) — a plain Edit needs enough surrounding context to be unique, or target by line. The
   all-time occurrence is inside the `{mode === 'all-time' && (<LineChart … />)}` block.

C. Without A and B, the working tree does NOT compile cleanly: `showAccumulateToggle`,
   `STACKED_AREA_CHART_LIBRARY`, and the accumulate branch are declared but the toggle UI + the
   conditional library that consume `showAccumulateToggle` / `STACKED_AREA_CHART_LIBRARY` in JSX
   aren't wired yet. Finish A + B before running `npm run qa`. (`accumulating` IS already
   consumed by `effectiveSeries`.)

### Blocker hit / why paused

The Edit tool repeatedly failed to match the JSX-insertion `old_string` due to tab-vs-space
whitespace. Confirmed the file uses tabs via `sed -n … | cat -tv` (`^I` = tab). The
`tab-safe-insert` skill was loaded to fall back to a `perl -i -pe 'print "…" if $. == N'`
line-targeted insert. The exact insert region (tab counts) was captured:
- Normalize block closes with `\t\t\t\t) : null}` (4 tabs) then the row closes `\t\t\t</div>`
  (3 tabs) then `\t\t\t<div>` (3 tabs) then `\t\t\t\t{mode === 'all-time' && (` (4 tabs).
- The all-time `LineChart` props are at 6 tabs; `library={TREND_CHART_LIBRARY}` at 6 tabs.
Then the coordinator asked to stop before this insert was applied.

---

## Test plan (USE algorithm) — enumerated, not yet written

All in `app/components/__tests__/YearComparisonTrendChart.test.tsx`. Add `within` to the
`@testing-library/react` import and `accumulateSeriesByYear` to the component import.

### Mock extension needed

The `react-chartkick` `LineChart` mock currently only surfaces the legend filter from `library`.
Extend it to also surface stacked-area config, e.g. add attributes:
`data-stacked={JSON.stringify(library?.scales?.y?.stacked)}` and
`data-fill={JSON.stringify(library?.elements?.line?.fill)}`. Then the stacked-area test asserts
`chart.dataset.stacked === 'true'` (and optionally `data-fill`).

### `accumulateSeriesByYear` unit tests (`describe('accumulateSeriesByYear')`)

- Usual: `it('accumulates Jan..Dec as a running sum within a year, e.g. feb = feb + jan')`
  - `[['2024-01-01',5],['2024-02-01',3],['2024-03-01',2]]` →
    `[['2024-01-01',5],['2024-02-01',8],['2024-03-01',10]]`.
- Structure: `it('resets the running sum at the start of each new calendar year')`
  - `[['2023-11-01',5],['2023-12-01',3],['2024-01-01',7],['2024-02-01',1]]` →
    `[['2023-11-01',5],['2023-12-01',8],['2024-01-01',7],['2024-02-01',8]]`.
- Structure: `it('accumulates numerator and denominator separately then divides once, when combined with normalize')`
  - metric `[['2024-01-01',2],['2024-02-01',4]]`, effort `[['2024-01-01',4],['2024-02-01',4]]` →
    `[['2024-01-01',0.5],['2024-02-01',0.75]]` (cumRaw 2/4=0.5, then 6/8=0.75). Distinguishes from
    sum-of-per-month-rates (which would give 0.5, then 0.5+1.5=2.0).
- Edge: `it('accumulates a series with no data some months without treating a gap as breaking the running sum')`
  - `[['2024-01-01',5],['2024-02-01',0],['2024-03-01',3]]` →
    `[['2024-01-01',5],['2024-02-01',5],['2024-03-01',8]]` (dense-spine 0 = gap; feb carries 5
    forward, mar = 5+3=8).
- Edge: `it('returns an empty series unchanged')`
  - `{name:'x',data:[]}` → `{name:'x',data:[]}`.

### Component tests (inside `describe('YearComparisonTrendChart')`)

- Usual: `it('does not render an Accumulate toggle when allowYearAccumulation is unset')`
  - render without prop → `queryByText('Accumulate')` null.
- Usual: `it('renders an Accumulate toggle only in all-time mode when allowYearAccumulation is true')`
  - render with prop → Accumulate present in all-time; switch to Compare years / This year →
    absent.
- Structure: `it('turning Accumulate on forces interval to month and hides the Interval toggle')`
  - multi-year `series` (Interval toggle shown); click Interval "Year"; scope + click Accumulate
    "Yes" → `queryByRole('radio',{name:'Year'})` null (Interval hidden). Optionally toggle
    accumulate back off → Month selected (interval was reset).
- Structure: `it('turning Accumulate on renders the chart as a stacked area')`
  - render with prop; click Accumulate "Yes"; assert all-time chart `data-stacked` = `'true'`
    (and `data-fill` = `'true'`).
- Edge: `it('switching to compare-years mode while accumulate is on turns accumulate back off')`
  - render with prop; Accumulate "Yes"; switch to Compare years; switch back to All time →
    scoped Accumulate "No" checked, chart not stacked.
- Edge: `it('turning on both Accumulate and Normalize divides cumulative counts by cumulative effort, not the sum of per-month rates')`
  - render with `effortHistory` + `allowYearAccumulation`; single-metric single-year data
    `[['2024-01-01',2],['2024-02-01',4]]`, effort `[['2024-01-01',4],['2024-02-01',4]]`; scope +
    click Accumulate "Yes" and Normalize "Yes"; assert all-time chart values `[[…,0.5],[…,0.75]]`
    (distinguishes from sum-of-rates 0.5/2.0). Scope Yes-radios via
    `within(screen.getByText('Accumulate').parentElement!)` /
    `within(screen.getByText('Normalize').parentElement!)`.

### Existing tests — regression check

Existing tests never pass `allowYearAccumulation`, so `showAccumulateToggle` is false throughout
and no "Accumulate"/extra "Yes"/"No" radios appear — existing `getByRole('radio',{name:'Yes'})`
(Normalize) stays unambiguous. The `NORMALIZE_OPTIONS`→`YES_NO_OPTIONS` rename is internal only
(labels unchanged). No existing test should need editing; confirm with `npm run qa`.

## Open questions / assumptions (subagent mode — recorded, not blocking)

- Gap-month output = carried-forward running sum (not null); only leading gaps are null. Chosen
  as the natural cumulative semantic. If a reviewer prefers null for all gaps, only the Edge
  transform test + the transform's `!seenReportableThisYear` branch change.
- "fill: true per dataset" implemented via `elements.line.fill: true` (line-element default)
  rather than mutating each series' `dataset.fill`. Equivalent in chart.js; keeps it a single
  layered library object. If per-series fill is required, map `allTimeSeries` adding
  `dataset:{...s.dataset, fill:true}` when accumulating instead.
- `effectiveYtitle` intentionally still driven by `normalize` only, so accumulate+normalize shows
  "… per hour" (a cumulative rate).

## Verification not yet run

`npm run qa` has NOT been run (remaining code wiring A+B incomplete). Run it after finishing A+B
and writing the tests. `.env.dev` was copied into the worktree at setup so qa/pre-push env is
present.
