# Synthetic fixtures

Every other subdirectory under `test-fixtures/snapshots/` holds a real query result
captured from the local e2e seed data by `supabase/scripts/generate-snapshots.ts` (run via
`npm run db:generate-snapshots`). The two files here are the deliberate exception:

- `zero.home-page-summary.json` — an all-zero/null `HomePageSummaryStats` composite
  (`{allTime, thisYear, lastYear}`), used to exercise the home page's zero-activity
  rendering path.
- `zero.summary-totals.json` — the equivalent all-zero/null single `CoreStatsResult`
  row, used the same way for the summary pages. `CoreStatsResult` (`app/models/db.ts`)
  is now an app-owned TypeScript type rather than a Postgres composite: the RPC it
  used to mirror was dropped in #1359 and the summary read path moved onto the
  `SimpleStatsCache` tables, but the row shape the summary components consume is
  unchanged, so this fixture still matches it column for column.

Neither is captured from a real query — no group in the local seed data has zero
activity, so there is nothing that would ever produce these shapes. They are
hand-authored and must be **maintained by hand**: if either shape changes (a column
added, renamed or removed on `CoreStatsResult`/`HomePageSummaryStats`, or on the
`SimpleStatsCache` read behind them), update these two files to match alongside that
change, since `npm run db:generate-snapshots` will never touch them. Living outside
the generator's output paths also means the drift check that #893 adds cannot (and is
not meant to) validate these two — see #894.
