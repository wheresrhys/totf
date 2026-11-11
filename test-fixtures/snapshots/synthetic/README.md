# Synthetic fixtures

Every other subdirectory under `test-fixtures/snapshots/` holds a real query result
captured from the local e2e seed data by `supabase/scripts/generate-snapshots.ts` (run via
`npm run db:generate-snapshots`). The two files here are the deliberate exception:

- `zero.home-page-summary.json` — an all-zero/null `HomePageSummaryStats` composite
  (`{allTime, thisYear, lastYear}`), used to exercise the home page's zero-activity
  rendering path.
- `zero.summary-totals.json` — the equivalent all-zero/null single summary-totals
  row, used the same way for the summary pages. The type it mirrors is now one of
  `modules/stats`' `StatsCacheResult`/`StatsCacheBySpeciesResult` pair
  (#1372/#1419) — app-owned TypeScript types rather than a Postgres composite:
  the RPC it originally mirrored was dropped in #1359 and the summary read path
  moved onto the `SimpleStatsCache` tables. Its own shape is the combined-grain
  `StatsCacheResult`, but its consumer asserts it to `StatsCacheBySpeciesResult`,
  because that is what the summary read path still declares it returns until
  #1424 makes that path generic on `group_by_species`.

  **This file has drifted and needs a hand-maintenance pass.** #1419 probed it
  against the current row type and it is missing 8 age-bucket encounter columns
  (`adult_enc_count`, `juv_enc_count`, `new_postjuv_enc_count`,
  `new_postjuv_juv_enc_count`, `postjuv_enc_count`, `postjuv_juv_enc_count`,
  `pullus_enc_count`, `unknown_age_enc_count`) and still carries 9 count
  columns under their pre-cache RPC spellings (`adult_count`, `juv_count`,
  `3_count`, …). Its one consumer
  (`app/components/__tests__/SummaryStatsSection.test.tsx`) reads it through an
  `as unknown as` double assertion, which is precisely why nothing caught the
  drift — see `app/CLAUDE.md`'s `as unknown as` section. Adding the 8 missing
  columns as `0` would **not** on its own let that cast become a single
  assertion: the fixture is ungrouped, so its `species_name` *and* `time_period`
  are both genuinely `null` while both cache tables declare `time_period` NOT
  NULL, so the double assertion survives the column fix either way. #1419 left
  the whole thing alone as out of scope for a rename.

Neither is captured from a real query — no group in the local seed data has zero
activity, so there is nothing that would ever produce these shapes. They are
hand-authored and must be **maintained by hand**: if either shape changes (a column
added, renamed or removed on `StatsCacheResult`/`HomePageSummaryStats`, or on the
`SimpleStatsCache` read behind them), update these two files to match alongside that
change, since `npm run db:generate-snapshots` will never touch them. Living outside
the generator's output paths also means the drift check that #893 adds cannot (and is
not meant to) validate these two — see #894.
