---
name: swarm
description: >-
  Keep open PRs mergeable — resolve merge conflicts and clear outstanding review feedback —
  then pick unblocked `ready` GitHub issues and implement them in parallel. Each unit of work
  runs in its own git worktree via a subagent on the model named by the ticket's label
  (fable/sonnet/opus). Biases toward tickets that unblock the most others, and runs any
  exclusive-resource-labelled unit of work (`db-migration` or `e2e-exclusive`) completely solo —
  no other worker runs concurrently with it (this repo shares one local Supabase instance across
  worktrees). Each ticket subagent runs the implement-ticket skill (branch,
  commits, tests, PR with "Closes #<n>", mermaid-diff). Runs as a continuously-refilling pool
  of up to 4 worker subagents (the orchestrator doesn't count): each completion triggers a
  re-select + respawn until no eligible work remains; while idle, a "check again" command forces
  a fresh GitHub re-scan for newly-available work. A stop command prompts the user to confirm
  halt-all vs drain. Tracks every live worker in a gitignored local state file
  (`.claude/swarm-state.json`) so the `take-over` skill can find and halt the right agent even
  from a fresh session. Orchestration only — PR maintenance, selection, worktree isolation, model
  routing, parallelism, refill, termination, teardown. Triggers: "swarm", "/swarm", "pick up
  ready tickets", "work the ready queue".
---

# swarm

Two kinds of concurrent work, one subagent + worktree each: (a) **maintain open PRs** — resolve
merge conflicts and address outstanding feedback so they can merge — then (b) **implement
`ready` tickets**. This skill orchestrates; per-ticket work is delegated to the
[`implement-ticket`](../implement-ticket/SKILL.md) skill.

## Precheck

Confirm GitHub Issues are enabled: run `gh issue list` once. If it errors with issues disabled,
stop and tell the user to enable them (`gh repo edit --enable-issues`) before continuing.

## State file (`.claude/swarm-state.json`)

Every live worker gets one entry here — this is how the `take-over` skill finds and halts the
right agent from a session that never saw it spawn (there's no tool to list running background
agents; this file is the only durable record). Gitignored, machine-local, never committed.

Entry shape:
```json
{
  "kind": "ticket",
  "issue": 412,
  "pr": null,
  "branch": "feature/412-add-species-chart",
  "title": "Add species breakdown chart to session page",
  "worktreePath": "/abs/path/.claude/worktrees/...",
  "agentId": "<id returned when spawning>",
  "model": "sonnet",
  "startedAt": "<ISO timestamp>"
}
```
(`kind` is `"ticket"` for §3 workers or `"maintenance"` for §1 workers; use `pr` instead of/alongside
`issue` for maintenance workers, and `title` is the ticket title or PR title, whichever is known.)

- **On every spawn** (§1 and §3): after the Agent tool call returns an id, find the worktree path
  — if not already given back by the spawn result, diff `git worktree list` from just before the
  spawn to just after; the new entry is the freshly-created worktree. Then append the entry via
  `mcp__swarm-tools__swarm_state_append` (fields as in the shape above). Never hand-write this
  file with `jq` — the tool holds a filesystem lock so concurrent worktrees never lose an update
  to each other.
- **On every completion** (§4) **and on halt/drain** (Termination): remove that worker's entry via
  `mcp__swarm-tools__swarm_state_remove` with `agentId`.

**Concurrency is capped at 4 worker subagents.** The top-level swarm orchestrator (the parent
agent running this skill) does not count toward the cap — it only selects, spawns, reports and
refills; it holds no worktree and does no ticket work. So: 1 orchestrator + up to 4 workers.

**Exclusive-resource work runs solo, not just capped at 1 of its own kind.** The exclusive-resource
label set is `db-migration` and `e2e-exclusive` — both mean the work will mutate the single shared
local Supabase instance (schema migrations, or the `@mutates`-tagged E2E specs a diff will trigger
per `e2e/mutating-spec-triggers.json`). This spans **both tracks**, §1 maintenance and §2 tickets —
a `db-migration` PR being maintained and a `db-migration` ticket being implemented contend for the
same shared instance just as much as two tickets would. One rule, no per-track counters:
- Before spawning **any** worker, check whether an exclusive-resource-labelled worker is currently
  running (either track). If so, spawn nothing else this round.
- Before spawning an **exclusive-resource-labelled** worker, additionally require that *no* worker
  of any kind is currently running — it starts a solo run, it doesn't join one already in
  progress.

Read the label directly off whichever object you already have: `gh pr list`'s `labels` field for
a PR (maintenance work — `implement-ticket` applies the issue's exclusive-resource label(s) to its
PR at creation, so this doesn't require resolving back to the issue) and the issue's `labels`
field for a ticket (§2). Work carrying neither label is unaffected by this rule, except that it
must itself wait while an exclusive-resource worker is running.

PR maintenance goes first — merging open PRs unblocks downstream tickets — so allocate free
slots to PRs needing maintenance first, then fill the remainder with tickets.

**This is a continuously-refilling pool, not a one-shot batch.** The orchestrator keeps up to 4
slots busy: every time a worker subagent finishes, immediately re-run selection (§1 maintenance
first, then §2 tickets) and spawn a replacement for each newly-freed slot, up to the cap. Keep
refilling until there is genuinely no eligible work left (no PR needs maintenance and no
unblocked, not-in-flight `ready` ticket remains) — then go idle and report the pool is drained.
A new completion, a freshly-`ready`/-conflicting PR, or a **manual re-check** command from the
user (see §4.5) later re-triggers a refill. The user can stop the loop at any time — see
**Termination**.

## 0. Plan the batch (one call covers §1 and §2's selection)

`mcp__swarm-tools__swarm_plan_batch` with `freeSlots` = 4 minus currently-running workers takes
care of the `gh pr list`/`gh api comments`/`gh pr view reviews`/`gh issue list --label
ready`/`closedByPullRequestsReferences`/`git branch -a` calls and all the eligibility/ranking
reasoning below in one round trip — including the solo-run rule (an exclusive-resource PR or
ticket only gets selected if nothing else is running or already picked this pass, and once
picked, nothing else is). Use its `prsNeedingMaintenance` for §1 and `ticketsToImplement` for §2
directly — both are already filtered, ranked, and truncated to `freeSlots`. `soloRunActive` /
`soloRunLabel` tell you whether a solo run is already in progress; `drained` tells you whether
there was genuinely nothing eligible (regardless of slots) and no workers running.

## 1. Maintain open PRs — resolve conflicts + address feedback (first call on the budget)

A PR appears in `prsNeedingMaintenance` because it either has merge conflicts (`mergeable` was
`CONFLICTING`) or outstanding feedback (a human review/comment, `CHANGES_REQUESTED`, or anything
newer than the head commit and not yet replied to — the tool ignores the PR's own
mermaid-diff/behaviour-change comments and bot authors). Its `reason` field says which
(`conflict` | `feedback` | `conflict+feedback`).

For each PR needing maintenance (up to the budget), launch **one** background Agent that handles
both concerns for that PR:
- `subagent_type: general-purpose`; no `isolation` — the prompt tells it to **reuse the PR
  branch's existing worktree if one exists** (`git worktree list`), else `git worktree add` a
  fresh one for that branch. Never edit the main working tree.
- `model` = the candidate's `model` field (already resolved from the linked ticket's label, or
  `sonnet` if unresolvable).
- `description`: `"Maintain PR #<pr>"`.
- Prompt, in order:
  1. **Sync first, always** — regardless of `mergeable` status, `git fetch origin` then
     `git merge origin/main` (merge, not rebase — no force-push onto a shared branch) before any
     other step. GitHub's `mergeable` check only catches textual conflicts, not staleness on
     unrelated files, so this runs even for `reason: "feedback"` PRs. If the merge produces
     conflicts — whether GitHub already flagged `CONFLICTING` or the fetch surfaces one GitHub's
     cache hadn't caught yet — resolve every conflict honouring both sides' intent, and run the
     relevant tests to prove the merge is sound.
  2. **Then feedback** — on top of the now-current branch, summarise outstanding feedback, make
     the changes, run tests, reply to the reviewer via `gh pr comment <n>`.
  3. Commit (repo conventions, including the model/Claude Code trailers from `implement-ticket`)
     and push. If on inspection neither a real conflict nor genuine feedback remains, no-op and
     report that.

Append a `kind: "maintenance"` entry (see State file) for this worker right after spawning it.

If no open PR needs maintenance, skip to ticket selection with the full budget.

## 2. Select tickets (fill the remaining budget)

`swarm_plan_batch`'s `ticketsToImplement` is already unblocked (no open `blockedBy` entry),
not in-flight (no existing branch or open linked PR), solo-run-filtered, ranked by `blockingCount`
descending then issue number ascending, and truncated to the free slots left after §1's
allocation — use it directly.

If `drained` is `true`, neither §1 nor §2 found eligible work and no workers are running: report
that and go idle (do not exit the loop — a later completion or new PR can refill).

## 3. Spawn one worktree subagent per ticket

For each selected issue, launch an Agent (default background, so they run in parallel):
- `subagent_type: general-purpose`
- `isolation: "worktree"` — isolated git worktree per ticket, so parallel branches never collide.
- `model` = the ticket's model label — `opus` | `sonnet` | `fable` (exactly the label). Don't
  substitute.
- `description`: `"Implement #<n>"`.
- Prompt: **first `git fetch origin` and create the ticket branch off `origin/main`** (the
  worktree is cut from local `main`, which may be stale relative to origin — basing on
  `origin/main` picks up already-merged sibling tickets), then run the `implement-ticket` skill
  for issue `<n>` and return its result (PR number + URL + test status).

Append a `kind: "ticket"` entry (see State file) for this worker right after spawning it.

The subagent owns branch/commits/tests/PR/mermaid-diff via `implement-ticket`, including the
test-isolation rule for any DB integration tests it writes. swarm does not duplicate that
logic — it only pins the branch base to `origin/main` and enforces the exclusive-resource cap so
parallel worktrees don't build on a stale checkout or collide on the shared local Supabase
instance.

## 4. On each completion: report, then refill

Every time a worker subagent finishes (completions arrive as notifications, usually one at a
time):
1. **Record** its worktree path for teardown, remove its entry from the state file (see State
   file), and note whether it succeeded or needs the user.
2. **Report** that unit:
   - **Maintained PRs**: PR → conflicts resolved? → feedback addressed (+ reviewer reply URL) →
     commit pushed → now mergeable? (or "no-op, nothing outstanding").
   - **Tickets**: issue → branch → PR URL → test status → whether mermaid-diff posted.
   - Flag anything that failed tests, still conflicts after the merge, couldn't open a PR, or
     couldn't push so the user can intervene.
3. **Refill** — unless termination has been requested (see below), immediately re-run selection
   (§1 then §2) for the now-free slot(s) and spawn replacements up to the cap (respecting the
   solo-run rule). A finished ticket often makes its PR eligible for maintenance and unblocks
   downstream tickets, so a completion usually creates fresh work. If nothing is eligible and no
   workers remain, report the pool is drained and go idle.

Track the live worker set (subagent id → what it's doing, including whether it's the in-flight
exclusive-resource worker) across the whole run — both tracks — so the solo-run rule, refill, and
termination logic all know accurately whether an exclusive-resource worker is currently running.

## 4.5 Manual re-check (user asks to re-scan)

While idle (pool drained, or free slots held open because remaining work was blocked), the queue
can change without any worker finishing — a sibling PR merges elsewhere, a blocker closes, a new
`ready` ticket or PR appears. swarm only auto-refills on a worker **completion**, so it won't
notice these on its own. The user can force a fresh scan.

If the user issues any re-check-like command — e.g. "check again", "re-check", "rescan", "look
again", "any new work?", "refresh", "poll github" — immediately re-run selection from scratch
against live GitHub state (§1 maintenance first, then §2 tickets) **without** waiting for a
completion, and spawn workers for every newly-eligible unit up to the free slots (cap still 4;
solo-run rule still applies; count workers already running). Report what the re-scan found:
- If new work is eligible, spawn it and report each unit started (as in §4 step 2).
- If nothing new is eligible, say so plainly (e.g. "re-checked — still N blocked, M in-flight,
  nothing newly available") and stay idle.

A manual re-check never stops or disturbs workers already running; it only fills idle slots.

## Termination (user asks to stop)

If the user issues any stop-like command to the **orchestrator** — e.g. "stop swarming", "stop",
"exit", "halt", "cancel", "abort", "that's enough" — do **not** guess. First stop refilling
(launch no new workers), then **ask the user to confirm which they mean**, via `AskUserQuestion`
with these two options:
- **Halt all now** — immediately stop every running worker subagent (`TaskStop` each live worker
  id), abandoning in-flight work. Use for an urgent full stop.
- **Drain** — stop starting new work, but let the workers already running finish and report
  normally. No new refills after this.

Then do exactly what they pick:
- *Halt all now* → `TaskStop` every tracked live worker, remove each from the state file, confirm
  each is stopped, report what was abandoned (branch/worktree state may be partial), and exit the
  loop.
- *Drain* → keep the refill suppressed, await the running workers' completions, report each as it
  lands (§4 steps 1–2 only, no refill — completions already remove their own state-file entry),
  and exit the loop once the pool empties.

Either way, leave worktrees in place for teardown unless the user also asks to clean up.

## 5. Teardown (after the user is done)

The branch is pushed and the PR holds the work, so the local worktree is only needed for review.
Do NOT tear down automatically — wait until the user says they're done (or the PRs are merged).
Then, per worktree created:
- `git worktree remove <path>` (`--force` only if it has leftovers the user accepts losing).
- `git worktree prune` to clear stale entries.
Confirm each removal; report anything skipped (e.g. a worktree with unpushed changes).

## Rules
- Open-PR maintenance (conflicts + feedback) is handled first; ready tickets fill the remaining
  budget. One subagent per PR does both concerns for that PR.
- Every maintenance worker unconditionally `git fetch origin` + `git merge origin/main` first,
  regardless of `mergeable` status — GitHub's check misses staleness on unrelated files, so a
  feedback-only PR would otherwise never pick up infra fixes since its worktree was cut. Resolve
  any resulting conflicts by merging `origin/main` into the PR branch — never rebase/force-push a
  shared branch.
- Never pick a blocked ticket; never exceed **4 concurrent worker subagents** across both tracks.
  The orchestrator itself is not a worker and does not count toward the 4.
- **Exclusive-resource work (`db-migration` or `e2e-exclusive`) runs completely solo** — across
  both tracks, not just within §2. Don't spawn it alongside any other worker, and don't spawn any
  other worker while it's running. A `db-migration`/`e2e-exclusive` PR being maintained (§1) is the
  same hazard as a ticket of either label being implemented (§2); check the PR's own `labels` for
  maintenance work (carried over from the issue by `implement-ticket`) and the issue's `labels`
  for ticket work. Blocked units wait for the next refill. This protects the single shared local
  Supabase instance from concurrent schema migrations and concurrent `@mutates`-tagged E2E runs.
- Keep the pool full: on every worker completion, refill freed slots (maintenance first, then
  tickets) until no eligible work remains — then go idle, don't exit.
- On any re-check-like command from the user ("check again", "rescan", "any new work?"), re-run
  selection against live GitHub immediately — without waiting for a completion — and fill idle
  slots with newly-eligible work; report if the scan found nothing. Never disturbs running
  workers.
- On any stop-like command from the user, suppress refilling immediately, then confirm via
  `AskUserQuestion` whether to **halt all now** (`TaskStop` every live worker) or **drain** (let
  running workers finish), and do exactly that. Never assume which.
- Each subagent runs the model the ticket label dictates (feedback PRs: the linked ticket's
  label, else `sonnet`).
- One worktree per unit of work; parallel branches must never share a working tree. Ticket work
  cuts a fresh isolated worktree; feedback work reuses the PR branch's existing worktree or adds
  one for that branch.
- Every ticket branch is based on freshly-fetched `origin/main`, never on the local checkout.
- Per-ticket work goes through `implement-ticket` — don't reinvent it here, including its
  DB-test-isolation rule.
- Keep `.claude/swarm-state.json` in sync with the live worker set on every spawn, completion,
  and halt — it's the only durable record of which agent id is working which branch, and
  `take-over` depends on it being current.
