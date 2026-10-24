# ADR 0001 — Vercel Queues for the import pipeline and bulk stats-cache backfill dispatch

- **Status:** Accepted in principle (design only — nothing in this ADR is implemented)
- **Date:** 2026-10-20
- **Spike:** [#962](https://github.com/wheresrhys/totf/issues/962)
- **Supersedes:** nothing
- **Implementation:** deferred to follow-up tickets (see [Follow-up tickets](#follow-up-tickets))

This is the first ADR in the repo. The convention it sets: one numbered markdown file per
significant design decision under `docs/adr/`, written when the decision is made rather than after
it is implemented, and left in place (amended with a **Superseded by** line) when a later ADR
changes it.

---

## Context

Four tickets in flight turn the CSV import from a single synchronous request into a four-phase
pipeline:

| Phase | Ticket | What it does |
|---|---|---|
| Raw staging | D1 [#960](https://github.com/wheresrhys/totf/issues/960) (table), D2 [#959](https://github.com/wheresrhys/totf/issues/959) (write path) | Every CSV row is written near-verbatim into `DemonRecords` (`raw_row jsonb` + `ring_no`/`encounter_date`/`encounter_time` + `import_job_id`) before it is interpreted |
| Domain processing | existing `lib/demon-import.ts` | `Species` → `RingSequences` → `Birds` → `Locations` → `Sessions`/`Encounters` upserts, per row |
| Stats-cache refresh | A1 [#958](https://github.com/wheresrhys/totf/issues/958), A2 [#955](https://github.com/wheresrhys/totf/issues/955), A3 [#956](https://github.com/wheresrhys/totf/issues/956), wired by B2 [#957](https://github.com/wheresrhys/totf/issues/957) | `refresh_core_stats_cache(p_group_id, p_affected_dates)` and its two siblings, each a full or date-scoped DELETE+re-INSERT of one group's cached rows |
| Run tracking | C [#961](https://github.com/wheresrhys/totf/issues/961) | One `ImportJobs` row per run: status, row counts, `affected_dates`, and three independent `*_stats_refresh_status` columns |

All eight prerequisite ticket numbers referenced by #962 were located and read; none are missing,
so nothing in this ADR is guessing at a prerequisite's shape. (B1 —
[#963](https://github.com/wheresrhys/totf/issues/963) — migrates read paths onto the cache tables
and is not a dependency of this design.)

The current web entrypoint, `app/api/import/route.ts`, carries all of that in one Vercel function:

- it reads the whole upload with `request.formData()`, parses it with `csv-parser`, and runs the
  unrecognised-location pre-flight ([#1079](https://github.com/wheresrhys/totf/issues/1079));
- it processes rows under a `pRateLimit({ interval: 1000, rate: 30, concurrency: 30 })` limiter;
- it streams NDJSON progress lines to the browser as it goes (`ImportProgressMessage` /
  `ImportCompleteMessage` / `ImportTimeoutMessage` / `ImportErrorMessage` /
  `ImportUnrecognisedLocationsMessage`);
- it self-aborts at `TIMEOUT_MS = 280_000` and is capped by `export const maxDuration = 300`.

That 280s budget was sized for the single-phase row upsert. Once the same request also has to
stage every row, process it, and then run three full-history cache recomputes, the budget is a real
constraint rather than a theoretical one — and the 280s abort is a *user-visible data-shaped
failure*: the group is told "re-export from Demon with records no older than this date and import
again".

Separately, this repo's `supabase/CLAUDE.md` contradicted itself about how migrations reach
production. That is fixed in the same PR as this ADR (see
[What changes in CLAUDE.md](#what-changes-in-claudemd)) and the corrected mechanism —
auto-deploy on merge to `main` — is load-bearing for [Question 3](#question-3--what-triggers-a-bulk-backfill).

---

## Question 1 — what shape does a Vercel Queues consumer take here?

### What the invocation model actually is

Checked against the Vercel Queues docs rather than inferred by analogy. In **push mode** (the
default), a consumer is an App Router **route handler** whose `POST` export is wrapped by the SDK,
registered against a topic in `vercel.json`:

```ts
// app/api/queues/<topic-name>/route.ts
import { handleCallback } from '@vercel/queue';

export const POST = handleCallback(async (message, metadata) => { /* ... */ });
```

```json
{
  "functions": {
    "app/api/queues/<topic-name>/route.ts": {
      "experimentalTriggers": [
        { "type": "queue/v2beta", "topic": "<topic-name>", "maxDeliveries": 20 }
      ]
    }
  }
}
```

The four properties that decide the answer, all from the docs:

1. **It is a function invocation by Vercel's internal queue infrastructure, not an HTTP request
   from a client.** The docs are explicit: *"the function is completely air-gapped from the
   internet. It has no public URL and can only be invoked by Vercel's internal queue
   infrastructure… you don't need to add authentication or authorization logic to your consumer
   functions. Unauthorized requests can never reach them."*
2. **A server action is not a candidate.** `handleCallback` returns a route-handler `POST`; there
   is no mechanism by which Vercel Queues can invoke a `'use server'` function (those are reached
   through Next's RSC action protocol from a client component). Queues can *publish* from a server
   action — `send()` works "from any server-side context: a route handler, a Server Action" — but
   it can only *consume* into a route handler (or `handleNodeCallback` for Pages Router, which this
   repo does not use).
3. **`maxDuration` still applies.** Push consumers run as ordinary Vercel Functions on fluid
   compute: 300s default, 300s hard maximum on Hobby, 800s maximum on Pro/Enterprise (1800s in
   beta). **Queueing does not remove the per-invocation budget — it lets the pipeline spend several
   budgets instead of one, and makes exceeding one a retry rather than a user-visible failure.**
   Any phase that cannot be bounded under one budget still has to be chunked. See
   [open question O1](#open-questions) — which plan this project is on decides whether chunking is
   mandatory or merely prudent.
4. **Topics are partitioned by deployment ID.** *"In push mode, Vercel delivers messages back to
   the same deployment that published them."* This is benign for the import pipeline (producer and
   consumer are the same deployment by construction) and is a genuine hazard for CI-triggered
   backfill — see [Question 3](#question-3--what-triggers-a-bulk-backfill).

### Decision

**A queue consumer is an API route by file shape, but a third backend shape by convention** —
distinct from both `app/actions/` server actions and the existing public `app/api/` routes, and
documented as such. Consumers live in their own namespace:

```
app/api/queues/<topic-name>/route.ts
```

Rationale for the separate namespace rather than dropping them in among the existing API routes:
everything else under `app/api/` is reachable by a browser and therefore has to authenticate; a
consumer is unreachable and must not. Keeping them in one directory makes "no cookie here, no auth
check needed here, and `vercel.json` must have a matching trigger entry" a property of a location
rather than a fact to remember per file. The directory name also matches the Vercel docs' own
examples, so the `vercel.json` paths read conventionally.

### The consequence that matters most for this codebase: there is no cookie

Every existing data path in this app starts from the `TOTFSession` cookie:
`getGroupCookie()` → `getAuthenticatedSupabaseClient()` → a Supabase client carrying
`app_metadata.ringing_group_id`, which every RLS policy reads. **A queue consumer has no request
cookie** — it is not a browser request. So:

- The **group id travels in the message payload**, stamped by the producer, which *does* have the
  cookie.
- The consumer mints its own group-scoped client from that id. The primitive already exists:
  `getAuthenticatedSupabaseClientForGroup(groupId)` in `app/lib/auth/group-auth.ts` (via
  `generateGroupJwt`). No new auth code is needed.
- This is safe precisely because of property (1) above: the topic is air-gapped, so the only code
  that can publish a group id is this deployment's own code, which read it from a signed cookie.
  The trust boundary moves from "the consumer validates the caller" to "only our own producer can
  reach the consumer at all", which Vercel enforces at the infrastructure level.
- **No service-role key is involved anywhere in this design.** The dispatcher's one cross-group
  read (enumerating groups) is satisfied by the publicly-`SELECT`-able `RingingGroups` table, and
  every write is RLS-scoped by a minted group JWT. `SUPABASE_SERVICE_ROLE_KEY` continues to live
  only in 1Password, read by nothing.

### Local development, E2E, and the abstraction seam this forces

The SDK authenticates via Vercel OIDC. Locally that needs `vercel link` + `vercel env pull`
(producing `.env.local` with OIDC tokens); `send()` then reaches real Vercel Queues infrastructure
and works under `next dev`. **There is no offline emulator.**

That is a problem for this repo specifically. The E2E suite (`e2e/authenticated/import.spec.ts`,
`@mutates`-tagged) and the HTTP suite run against local Supabase on a derived port, with no Vercel
project link assumed — and CI has no Supabase at all. A queued import that can only be exercised
against live Vercel infrastructure would make the one mutating E2E spec unrunnable.

**Recommendation: put a one-function port in front of `send()`.**

```ts
// lib/queue-dispatch.ts  (sketch, not final)
export type DispatchMode = 'queue' | 'inline';
export async function dispatchImportDomainProcessing(payload: ImportDomainJob): Promise<void>;
export async function dispatchStatsCacheRefresh(payload: StatsCacheRefreshJob): Promise<void>;
```

Two implementations, selected by an env var (`IMPORT_DISPATCH_MODE`, defaulting to `queue` when
`VERCEL` is set and `inline` otherwise):

- **`queue`** — `await send(topic, payload)`. Production.
- **`inline`** — `await` the consumer's handler function directly, in-process. Local dev, the E2E
  suite, and the CLI importer.

This is not test-only scaffolding: the **CLI importer genuinely needs the inline path in
production use.** `supabase/scripts/import-csv.ts` runs on a human's laptop under `npm run
db:import:local` / `db:import:prod`, has no function timeout to escape, and cannot publish to a
deployment's topic. So the inline implementation is a real, supported mode with a real caller —
which also means it stays exercised rather than rotting.

The design constraint this imposes: **each consumer's body must be a plain exported async function
of `(payload) => Promise<void>`**, with `handleCallback` as a thin wrapper around it in the route
file. No consumer logic in the route handler itself.

---

## Question 2 — how do the pipeline's phases map onto consumer stages?

### The central insight: `DemonRecords` is already the work queue for row data

The naive mapping ships rows through the queue. It is the wrong one. Once D2 lands, **every row is
already durably stored, group-stamped, job-stamped, and deduplicated in `DemonRecords` before
domain processing starts.** A queue message therefore only has to carry *job identity*, and the
consumer reads its unit of work from Postgres:

```ts
type ImportDomainJob = { importJobId: number; ringingGroupId: number };
type StatsCacheRefreshJob = {
  ringingGroupId: number;
  affectedDates: string[] | null;   // null = full recompute
  importJobId: number | null;       // null = bulk backfill, nothing to record against
  reason: 'import' | 'backfill';
};
```

Consequences:

- Messages are ~100 bytes. Billing meters in 4 KiB chunks, so every message is one operation —
  against a 1,000,000-operation included Hobby allowance. Cost is a non-issue at any plausible
  import volume.
- The 100 MB message-size limit and the 4.5 MB function request-body limit both become irrelevant
  to the queue design. (The 4.5 MB body limit still caps the *upload* — it does today too, and this
  design does not change it.)
- A redelivered message re-reads current state from `DemonRecords`/`ImportJobs` instead of
  replaying a stale snapshot of it.

### At-least-once delivery is already satisfied

Vercel Queues is at-least-once; the docs' guidance is *"make operations naturally idempotent (like
setting a value rather than incrementing)"*. Every phase of this pipeline already is:

| Phase | Why it is idempotent |
|---|---|
| `DemonRecords` staging | `ON CONFLICT DO NOTHING` against `demon_records_group_ring_date_time_unique` (D2's batch writer) |
| Domain processing | `createUpserter`'s `.upsert(..., { onConflict })` on natural keys throughout `writeEncounterRow` |
| Stats-cache refresh | A1/A2/A3 are DELETE+re-INSERT per group per grain — a set, not an increment |
| `ImportJobs` transitions | `ImportJobTracker`'s six operations are all absolute `.update()`s, each touching disjoint columns |

So the single largest risk of moving to at-least-once delivery is neutralised by the design the
prerequisite tickets already chose, for unrelated reasons. The only non-idempotent quantity is the
*derived row counts* (`rows_processed`/`rows_successful`/`rows_failed`), which must be recomputed
from `DemonRecords` on each attempt rather than accumulated in memory across attempts.

### Stage split

Three stages, two topics, one synchronous front door.

```
Browser ──POST /api/import──▶ Stage A  (synchronous route, unchanged shape)
                               │ parse CSV, location pre-flight
                               │ createImportJob()  → ImportJobs: in_progress
                               │ write every row to DemonRecords (D2 batch writer)
                               │ recordAffectedDates()
                               │ status → 'queued'
                               ├─send('import.process-domain', {importJobId, ringingGroupId})
                               └─▶ 202 { importJobId }          [no NDJSON stream]

           topic import.process-domain ──▶ Stage B  app/api/queues/import-process-domain/
                               │ read this job's DemonRecords rows (cursor-ordered)
                               │ writeEncounterRow per row, under the existing pRateLimit
                               │ checkpoint rows_processed as it goes
                               │ if budget nearly spent → re-enqueue continuation, return
                               │ else status → 'succeeded'
                               └─send('stats-cache.refresh-group', {ringingGroupId, affectedDates, importJobId, reason:'import'})

           topic stats-cache.refresh-group ──▶ Stage C  app/api/queues/refresh-stats-cache/
                                 refresh_core_stats_cache / _biometrics_ / _demographics_
                                 markStatsCacheRefreshed(core|biometrics|demographics, …) ×3
```

**Why stage A stays synchronous.** Three reasons, in order of weight:

1. The unrecognised-location pre-flight (#1079/#1080) is an *interactive* abort: the group is shown
   the offending names and resolves them in `UnrecognisedLocationsReview`, then re-uploads. Pushing
   it behind a queue turns a 2-second round trip into a poll-and-wait for a result the user must act
   on immediately, for no benefit. Keeping it synchronous means **the entire #1079/#1080 UX is
   untouched by this redesign.**
2. Staging is the cheapest phase per row (batched multi-row upserts, one round trip per batch)
   against an upload already capped at 4.5 MB by the platform. It is the phase least likely to
   exhaust a budget.
3. It preserves a clean contract for the response: **a 202 means "your data is durably stored"**,
   not "your data is somewhere in a queue". That is a better promise than today's stream, which can
   die mid-flight leaving the group unsure what landed.

Documented fallback if staging ever does become the bottleneck: add a stage 0 on its own topic
carrying the raw upload via the SDK's `BufferTransport`/`StreamTransport` (the 100 MB message limit
is ten times larger than the 4.5 MB upload limit, so the bytes fit). Noted so a future implementer
does not have to re-derive it; **not** recommended now.

**Why three stages and not one.** Each boundary buys something specific:

- **Retry granularity.** A failed stats refresh must not re-run domain processing (minutes of
  upserts for nothing). A failed domain chunk must not re-run the pre-flight.
- **Budget.** Each stage gets its own `maxDuration`, and its own `retryAfterSeconds`.
- **Reuse.** Stage C is the shared primitive Question 2-of-the-ticket asks for: a group-scoped
  stats-cache refresh job with no import attached. The import pipeline is simply *one producer of
  it*. This is the whole reason bulk backfill needs no second mechanism.

**Why not finer — one message per row?** Op cost (send + notify + delete + visibility ≈ 4 ops per
row), loss of the batched multi-row upsert `DemonRecords`/`createUpserter` depend on, and 30,000-way
concurrency pointed at one Postgres instance. Row-batch granularity *inside* one job message is
correct; message-per-row is not.

### Chunking stage B across budgets

At-least-once + idempotent upserts makes this nearly free:

- Order this job's `DemonRecords` rows by `id`; process while a wall-clock budget check leaves
  headroom (the same shape as today's `TIMEOUT_MS` deadline check, with a smaller margin since
  overrun is now a retry rather than a data-loss message to the user).
- On running out of headroom, `send('import.process-domain', { importJobId, ringingGroupId })`
  again — the same payload. Re-reading from the cursor is what makes the message self-describing.
- The cursor needs one durable marker. Two options for the follow-up ticket, both small:
  `ImportJobs.last_processed_demon_record_id bigint`, or `DemonRecords.processed_at timestamptz`
  (which additionally gives per-row recovery visibility, at the cost of a write per row).
  **Recommended: `ImportJobs.last_processed_demon_record_id`** — one write per chunk instead of one
  per row, and `DemonRecords` is meant to be a verbatim staging copy, not a progress ledger.
- Because `writeEncounterRow` is upsert-based, a chunk that is redelivered after partially
  completing simply rewrites the same rows. No compensation logic.

### `ImportJobs` across the queued pipeline

| Moment | `ImportJobs` write | Helper (all exist today) |
|---|---|---|
| Pre-flight passed | insert, `status: 'in_progress'`, `started_at`, three refresh statuses `'in_progress'` | `createImportJob` |
| `DemonRecords` flushed | `affected_dates` | `recordAffectedDates` |
| Message enqueued | `status: 'queued'` *(new enum value — see below)* | new, one line on `updateImportJob` |
| Stage B starts / resumes | `status: 'in_progress'`, `last_processed_demon_record_id` | new |
| Stage B chunk boundary | `rows_processed` / `rows_successful` / `rows_failed`, recomputed from `DemonRecords` | new checkpoint helper |
| Stage B done | `status: 'succeeded'`, `finished_at`, final counts | `completeImportJob` |
| Stage B poisoned (`deliveryCount` exhausted) | `status: 'failed'`, `finished_at`, `error_message` | `failImportJob` |
| Stage C, per cache | `core_` / `biometrics_` / `demographics_stats_refresh_status` | `markStatsCacheRefreshed` |

Two schema deltas for the follow-up ticket, both deliberately minimal:

1. **Add `'queued'` to the `import_job_status` enum.** Today's four values cannot express "staged,
   durable, not yet picked up". Without it, a job lost in the queue is indistinguishable from a job
   actively being processed, which makes the stale-job query below impossible to write.
2. **Add `ImportJobs.last_processed_demon_record_id bigint`** (nullable), the stage-B cursor.

What **does not** change: `markImportJobTimedOut` and `'timed_out'`. Under the queued design a
blown budget is a retry, not an outcome, so nothing in the web path writes `'timed_out'` any more.
It stays on the enum and in the tracker because `ImportJobTracker` is shared with the CLI importer
and because historical rows carry it. Do not remove it; do not repurpose it.

**The DLQ substitute.** Vercel Queues has no built-in dead-letter queue — the docs direct you to
the SDK's `retry` callback. That callback is exactly the bridge to `ImportJobs`:

```ts
export const POST = handleCallback(processImportDomainJob, {
  retry: async (error, metadata) => {
    if (metadata.deliveryCount > 5) {
      await failImportJobFromPoisonedMessage(error, metadata); // status: 'failed'
      return { acknowledge: true };                            // stop retrying
    }
    return { afterSeconds: Math.min(300, 2 ** metadata.deliveryCount * 5) };
  }
});
```

Without this, a poisoned message retries until its TTL and the `ImportJobs` row sits at `'queued'`
forever with no explanation. With it, the group sees a failed import with the real error message.
Pair it with a `maxDeliveries` cap on the `vercel.json` trigger — the docs call out that **every
failed delivery is a billed function invocation, charged for the full `maxDuration` when it times
out**, so an uncapped poisoned message in a deployment nobody is watching is a live cost risk.

**Stale-job detection** (worth one cheap query in the import page's data fetcher, or a follow-up
admin view):

```sql
SELECT * FROM "ImportJobs"
WHERE status IN ('queued', 'in_progress')
  AND started_at < now() - interval '1 hour';
```

That query is only writable because of delta (1) above — which is the concrete justification for
adding the enum value rather than reusing `'in_progress'` for both.

---

## Progress transport: what replaces the NDJSON stream

A queued import has no open connection to stream to. Three options evaluated; all three read the
same source of truth (`ImportJobs`), which is what makes the choice cheap to revise later.

### Option 1 — poll `ImportJobs` from the browser *(recommended)*

A new server action `fetchImportJobProgress(importJobId)` in `app/actions/`, called on an interval
of ~1.5–2s while the job is non-terminal.

- **Pros.** No new infrastructure, no new dependency, no new auth surface: it is an ordinary
  `app/actions/` read through `getAuthenticatedSupabaseClient()`, so the existing
  `ringing_group_id = jwt` RLS policy on `ImportJobs` already restricts a group to its own jobs —
  there is nothing to get wrong. Identical behaviour in local dev, E2E, and production. One indexed
  primary-key read per tick. And it is **strictly better than today's stream in one respect that
  users will notice: progress survives a reload, a navigation, or a closed laptop lid.** Today,
  losing the response stream loses all visibility into a 280-second import.
- **Cons.** Granularity is bounded by how often stage B checkpoints `rows_processed` — a
  per-chunk-boundary write, not today's every-10-rows. Up to ~2s of latency on the terminal
  transition. Needs an explicit stop condition so a browser left open on a wedged job does not poll
  forever (cap at the stale-job interval, then render "this import appears to have stalled").

### Option 2 — Supabase Realtime subscription on the row

`supabase.channel(...).on('postgres_changes', { table: 'ImportJobs', filter: 'id=eq.<jobId>' })`.
Realtime is already `enabled = true` in `supabase/config.toml`.

- **Pros.** Genuinely push, sub-second, no polling loop. Same single source of truth as option 1.
- **Cons.** It would be the **first Realtime usage in the app** — no existing code subscribes to
  anything. That means a new client-side subscription lifecycle to get right (reconnect, cleanup,
  StrictMode double-mount), Realtime's own authorisation model to configure for `postgres_changes`
  against a custom-JWT client, and replication to enable for the table in production. All of that
  to buy latency on a progress bar — **it conveys no information option 1 does not**, because both
  are limited by the same checkpoint frequency.
- **Verdict.** The right *upgrade*, not the right *start*. If the latency is ever felt, the client
  hook's internals change and nothing else does.

### Option 3 — SSE endpoint that server-side-polls `ImportJobs`

`GET /api/import/[importJobId]/events`, streaming `text/event-stream`.

- **Pros.** Client code keeps roughly today's shape (read from a stream, switch on messages).
- **Cons.** Strictly worse than option 1: it is polling with an extra long-lived function
  invocation in front of it, and **it re-introduces precisely the problem queueing exists to
  remove** — a 10-minute import outlives a 300s SSE function, so the client needs reconnect logic
  anyway, at which point it is option 1 with extra steps and extra compute billed for sitting idle.
- **Verdict.** Rejected.

### Recommendation

**Option 1 (poll `ImportJobs`)**, with option 2 named as the upgrade path. Specifically:

- `app/api/import/route.ts` returns `202 { importJobId }` as plain JSON, or `409` with the
  unrecognised-location names (the one pre-flight outcome that stays synchronous).
- `app/(routes)/import/PageContent.tsx`'s existing `ImportState` union survives almost intact — it
  is already a status machine with `processing` / `complete` / `timeout` / `error` /
  `unrecognisedLocations` arms. The NDJSON reader loop is replaced by a polling hook; each polled
  `ImportJobs` row maps onto the same arms (`'queued'`/`'in_progress'` → `processing`,
  `'succeeded'` → `complete`, `'failed'` → `error`). **The rendering code barely changes.**
- `ImportMessage` and its five member types are deleted from `app/api/import/route.ts`. That
  removes the oddity of a `'use client'` component importing a type from an API route file.
- Stage B checkpoints `rows_processed` at every chunk boundary (and at a row-count interval within
  a chunk) so the polled number actually moves on a long import.

---

## Question 3 — bulk per-group backfill

### Fan-out mechanism

When a future migration adds or redefines a column on `CoreStatsCache` / `BiometricsStatsCache` /
`DemographicsStatsCache`, every existing group's cached rows need one full recompute. This is
**the same job as stage C**, with `importJobId: null`, `affectedDates: null` (full recompute, A1's
default branch) and `reason: 'backfill'`:

```ts
// the dispatcher — the ONLY backfill-specific code in the design
const { data: groups } = await supabase.from('RingingGroups').select('id');   // publicly SELECTable
for (const { id } of groups) {
  await send('stats-cache.refresh-group', {
    ringingGroupId: id, affectedDates: null, importJobId: null, reason: 'backfill'
  }, { idempotencyKey: `backfill:${migrationVersion}:${id}` });
}
```

Three things to note about that loop:

1. **`idempotencyKey` is what makes the dispatcher safe to retry.** Vercel deduplicates within
   `min(retention, 24 hours)`, so a re-run of a failed CI step, a double-click on an admin button,
   or a redelivered dispatch request cannot double-enqueue a group's refresh within a day. (Sends
   carrying an idempotency key bill at 2× — irrelevant at one send per group per migration.)
2. **Cap concurrency on the consumer group.** A full recompute for one group is heavy: five
   `core_stats` calls over that group's whole history, times three cache tables. A 50-group fan-out
   at default (unlimited) concurrency would point 50 of those at one Supabase instance
   simultaneously. Set max concurrency to a small number (start at 2, tune against observed
   duration). Note that max-concurrency push deliveries also bill at 2×, and that **the same cap
   protects the import path**, since both share the topic.
3. **Group-scoped jobs, independently retried, each recording its own outcome** — which is exactly
   what the sequential script loop cannot give you.

Because stage C already exists for the import path, **the queue-based backfill is strictly cheaper
to build than the script loop would be to build a second time.** There is no "write the loop now,
rewrite it as a queue later" cost to weigh.

### When does a sequential script loop stop being sufficient?

The honest answer is that **group count is not the forcing function.** The criteria, in the order
they actually bite:

- **(i) Automation.** A script loop writing to production requires `load-prod-write-env.sh`, which
  is human-only by explicit policy (`supabase/CLAUDE.md`: prod writes are "the explicit exception
  (human-only, denied to Claude)"). So a script loop *can never be the CI-triggered path* under the
  current prod-access model. The moment the Question 3 trigger is adopted, the loop is disqualified
  on policy grounds alone — before any performance argument. **This is the real threshold.**
- **(ii) Partial-failure recoverability.** A loop that dies at group 9 of 30 leaves a
  half-refreshed deployment with no record of which nine. The queue gives per-group retry,
  per-group `deliveryCount`, and the observability dashboard. This bites at any N > ~5, because the
  cost is "how bad is a partial failure", not "how long does it take".
- **(iii) Wall clock.** Once `groupCount × perGroupRefreshSeconds` exceeds roughly 5–10 minutes,
  "a human watches a terminal" stops being a reasonable deployment step. With single- to
  low-double-digit group counts and a per-group refresh plausibly in the 1–30s range, today's
  scale sits under this — see [open question O3](#open-questions).

**Recommendation:** build the fan-out dispatcher, not the loop — on the strength of (i) and (ii),
not (iii). Keep a `workflow_dispatch`/manual entry point to it (below) so a human can still run it
deliberately; that is the loop's only genuine advantage and it is retained.

---

## Question 3 — what triggers a bulk backfill?

With migrations now deploying automatically via the Supabase GitHub integration on merge to `main`,
a CI-chained trigger is genuinely available. It is also where the subtle failure modes live.

### How the dispatcher is reached

Independent of trigger choice, and worth settling first: **the dispatcher is an authenticated admin
route on the deployed app**, not code in the GitHub Action.

```
POST /api/admin/dispatch-stats-backfill     (shared-secret header)
```

- `@vercel/queue` is already configured and OIDC-authenticated inside a Vercel deployment; getting
  OIDC credentials into a GitHub Action to `send()` directly is extra moving parts for no gain.
- All queue code stays in the app, under the repo's own conventions and tests.
- **It resolves the deployment-pinning hazard.** Topics are partitioned by deployment ID and
  messages are delivered back to *the deployment that published them*. A dispatcher running inside
  the current production deployment therefore publishes to the deployment whose consumer code the
  migration was written for. A dispatcher publishing from CI would have no such guarantee.
- The CI step is then one `curl`, and a human can hit the same endpoint.

Secret: `STATS_BACKFILL_DISPATCH_TOKEN`, in GitHub Actions secrets and Vercel project env.

### Trigger options

**Option A — GitHub Actions on `check_run: [completed]`, filtered to the Supabase check.**

The Supabase GitHub integration applies migrations on push to `main` and reports back as a GitHub
check named **"Supabase Preview"** on the merge commit, completing shortly after the migrations
land. A workflow can therefore trigger on `check_run` completion, filter on
`check_run.name == 'Supabase Preview'` and a `main` head SHA, and act.

- **Pros.** Correctly ordered against the *migration* deploy — it fires because the migration
  succeeded, not merely because a commit was pushed. No human has to remember. No stale window.
- **Cons / hazards, in order of nastiness:**
  - **The two-deploy race.** The Supabase migration deploy and the Vercel production deploy of the
    same commit are independent and unsynchronised. The Supabase check typically completes first.
    If the dispatch fires then, the refresh runs **inside the previous deployment's consumer** —
    old code writing old-shaped rows into a just-migrated table. The workflow must therefore wait
    for *both*: the "Supabase Preview" check on the SHA, **and** the Vercel production deployment
    of the same SHA reaching `READY` and being promoted. This is the single most important finding
    of this spike, and the reason "just chain a CI step" is not a one-line job.
  - **Deciding whether this merge needs a backfill at all.** Most migrations do not touch cache
    shape; a full three-table recompute per group on every `main` merge is real database load for
    nothing. Recommended discriminator: in the workflow, `git diff --name-only` the merge against
    its first parent and dispatch only when it touches the three cache tables' or three refresh
    functions' schema files. Precise, needs no human action, and leaves `workflow_dispatch` as the
    escape hatch. (Alternative considered and rejected: a PR label — unavailable from a `check_run`
    payload without an extra API lookup, and easy to forget.)
  - `check_run: [completed]` fires for *every* check on every commit, so the filter has to be
    tight or the workflow becomes noise.
  - The workflow file must live on the default branch for the event to fire (fine here).

**Option B — manual dispatch only** (`workflow_dispatch` on the same workflow, or a human calling
the endpoint).

- **Pros.** Zero ordering hazards: a human runs it once both deploys are visibly green. Matches the
  repo's existing human-only-prod-writes posture. Cache-shape migrations are rare — a handful a
  year at most.
- **Cons.** Someone has to remember, and the stale window between merge and remembering is
  unbounded. Stale caches are *silently wrong numbers on a stats dashboard*, which is a bad failure
  mode to leave to memory.

**Option C — `on: push: { branches: [main], paths: ['supabase/migrations/**'] }`.** Simpler
trigger, but it fires *before* the migration is applied and before Vercel deploys, so it needs the
same two waits as option A **and** loses the "the migration actually succeeded" signal that makes A
worth having. Rejected.

**Option D — database-side trigger (`pg_cron` / a migration-tail `pg_net` call).** Supabase cannot
reach a private Vercel Queues topic; it would have to call option A's endpoint anyway, from a place
with worse observability and no access to the git diff needed to decide whether to fire. Rejected.

### Recommendation

**Option A, built in two increments, over the dispatch endpoint described above.**

1. **Increment 1:** the admin dispatch endpoint + a `workflow_dispatch`-only workflow. Identical
   payload path, zero ordering hazard, immediately useful, and manually testable against
   production. This is option B, shipped as the first half of option A rather than as a dead end.
2. **Increment 2:** add the `check_run` trigger and the wait-for-both-deploys gate to the same
   workflow, once increment 1 has been exercised at least once for real.

This ordering is itself a finding: the automated trigger's risk is concentrated entirely in the
ordering gate, so shipping the dispatch mechanism first — where it can be verified by a human
watching it — isolates that risk to one reviewable increment.

---

## What changes in CLAUDE.md

**Done in this PR** (the only CLAUDE.md edits this spike makes):

1. **`supabase/CLAUDE.md` → "Workflow for schema changes", step 7.** Previously: migrations deploy
   via the human-run `npm run db:migration:push`, and "There is **no** automated CI deploy of
   migrations". That is stale and contradicted the same file's "Developing against production data"
   section ("Migrations are committed and deployed on merge to main by the supabase github
   integration"). Corrected to: migrations deploy automatically via the Supabase GitHub integration
   on merge to `main`, with `npm run db:migration:push` retained as the documented human-only
   escape hatch (for a migration that needs applying out of band, or a merge whose integration run
   failed) rather than the primary path. Required by this ADR's Question 3, which only makes sense
   if the automatic deploy is the real mechanism.
2. **Root `CLAUDE.md`.** One line pointing at `docs/adr/`, so this design is discoverable to a
   future session. A design doc nobody's context ever loads is a design doc that gets re-derived.

**Deferred to the implementation tickets** (documenting conventions no code follows yet would be
stale on arrival):

3. **`app/CLAUDE.md` → a new "Queue consumers" subsection** under the existing backend-shape
   conventions, covering: the third backend shape and why it is distinct; the
   `app/api/queues/<topic-name>/route.ts` + `vercel.json` `experimentalTriggers` pairing; that a
   consumer has no cookie and mints its client with `getAuthenticatedSupabaseClientForGroup(groupId)`
   from the payload's group id; that consumer bodies are plain exported async functions with
   `handleCallback` as a thin wrapper (so the inline dispatch mode and the tests can call them);
   that handlers must be idempotent because delivery is at-least-once; that `maxDuration` still
   applies; and that every consumer needs a `retry` callback writing a terminal `ImportJobs`/outcome
   row before `{ acknowledge: true }`.
4. **`app/CLAUDE.md` → "Web import"** rewritten from "streams NDJSON progress back to the browser"
   and "aborts with a date-range summary after 280 seconds" to the enqueue-and-poll flow, keeping
   the location pre-flight description as-is (it does not change).
5. **`supabase/CLAUDE.md` → "CSV data import"** gains a note that `DemonRecords` is the queued
   domain-processing stage's unit-of-work source, and that the CLI importer deliberately stays
   fully synchronous (inline dispatch mode) rather than publishing to a topic.
6. **Root `CLAUDE.md` → "Tech stack"** adds Vercel Queues; **"Environment variables"** adds
   `STATS_BACKFILL_DISPATCH_TOKEN` and `IMPORT_DISPATCH_MODE`; **"Development environment"** notes
   that exercising the real queue locally needs `vercel link` + `vercel env pull`, and that the
   default local mode is inline.

---

## Follow-up tickets

This spike enumerates **no implementation tests**. Each follow-up ticket carries its own
USE-algorithm test plan, and the labels below.

| # | Ticket | Labels it will need |
|---|---|---|
| E1 | `lib/queue-dispatch.ts` port + inline mode; extract consumer bodies as plain async functions; `@vercel/queue` dependency | `zone:app` |
| E2 | `'queued'` enum value + `ImportJobs.last_processed_demon_record_id`; checkpoint/cursor tracker helpers | **`db-migration`**, `zone:data-layer` |
| E3 | Stage C consumer (`app/api/queues/refresh-stats-cache/`) + `vercel.json` trigger; re-point B2's inline web-path refresh at it | `zone:app` |
| E4 | Stage B consumer + chunking/re-enqueue; rewrite `POST /api/import` as producer; delete `ImportMessage` types | **`e2e-exclusive`**, `zone:app` |
| E5 | Polling progress transport: `fetchImportJobProgress` action + `PageContent.tsx` rewrite; stale-job rendering | **`e2e-exclusive`**, `zone:app` |
| E6 | Backfill dispatch endpoint + `workflow_dispatch` workflow (increment 1 of trigger option A) | `zone:app`, `zone:agentic-tooling` |
| E7 | `check_run` trigger + wait-for-both-deploys gate (increment 2) | `zone:agentic-tooling` |
| E8 | CLAUDE.md convention sections (items 3–6 above), once E1–E6 have landed | `zone:app`, `zone:data-layer` |

`e2e-exclusive` applies to E4 and E5 because `lib/demon-import.ts`, `app/api/import/`, and
`e2e/authenticated/import.spec.ts` are all in `e2e/mutating-spec-triggers.json`'s `@mutates` list.
`db-migration` applies to E2 only.

---

## Proof-of-concept: not written, and why

The ticket allowed an optional throwaway PoC to settle a specific Vercel Queues API question. None
was written. The two questions it named are answered authoritatively and unambiguously by the
current docs, with exact config keys, code shapes, and a published limits table — all quoted above:

- *Consumer invocation shape* — `handleCallback` in an App Router route handler, registered via
  `functions[path].experimentalTriggers = [{ type: 'queue/v2beta', topic }]` in `vercel.json`,
  invoked privately by Vercel's queue infrastructure with no public URL.
- *Message payload limits* — 100 MB maximum message size, metered in 4 KiB chunks; and this design
  deliberately keeps messages at ~100 bytes, so the limit never binds.

A real PoC would also require linking this repo to a Vercel project and adding `@vercel/queue` as a
dependency — account state and a production dependency, for a spike whose deliverable is a
document. Disproportionate.

**What genuinely needs empirical verification, as the first commit of E1/E3** (cheap once the
dependency is in and the project is linked, impossible before):

- **V1.** That `next dev` with `vercel env pull`-provided OIDC really does round-trip a message to a
  locally-running consumer, end to end. The docs assert it; this repo's dev setup (dotenvx,
  `.env.dev`, per-worktree ports) is unusual enough to be worth confirming before E4 depends on it.
- **V2.** Observed per-group duration of the three refresh RPCs against production-scale data,
  which sets stage C's `maxDuration`, the max-concurrency cap, and threshold criterion (iii).
- **V3.** That the `retry` callback's `{ acknowledge: true }` path really does run *after* a handler
  throw and is awaited (the `ImportJobs` terminal write depends on it), and that the max-concurrency
  setting is configurable from `vercel.json` rather than only via the dashboard.

---

## Open questions

- **O1. Which Vercel plan is this project on?** Hobby caps `maxDuration` at 300s with no extension,
  which makes stage B's chunk-and-re-enqueue mandatory rather than prudent, and caps stage C at 300s
  per group. Pro allows 800s (1800s in beta). Needs a human answer; it changes no structure in this
  design, only how aggressively stage B must chunk.
- **O2. `queue/v2beta` and `experimentalTriggers` are explicitly experimental.** The trigger type
  carries a `v2beta` in its name and the `vercel.json` key is named `experimentalTriggers`. A
  breaking rename is plausible. Mitigation: the dispatch port (E1) confines `@vercel/queue` imports
  to two consumer route files and one dispatch module, so a trigger-shape change is a small, local
  edit — but this is a real reason not to spread `send()` calls through the codebase.
- **O3. Production group count and per-group refresh duration are both unknown to this spike.** Prod
  read-only access was not exercised. Threshold criterion (iii) is therefore stated as a condition
  rather than a number; V2 above closes it.
- **O4. Does anything other than import ever need to invalidate a group's stats cache?** B2 (#957)
  confirmed there is no correction/discrepancy-fix write path today (`find_discrepencies` is
  read-only). If one is added, it becomes a third producer of the stage-C topic — which this design
  accommodates for free, but which is worth re-checking before E3 locks the payload shape.
- **O5. Should `DemonRecords` rows be pruned?** They are now a permanent verbatim copy of every row
  ever imported, and under this design they are also the domain stage's unit of work, so they cannot
  be pruned until a job is terminal. Out of scope here; flagged because the queued design makes
  `DemonRecords` load-bearing rather than merely archival.
