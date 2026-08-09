---
name: swarm
description: >-
  Keep open PRs mergeable — resolve merge conflicts and clear outstanding review feedback —
  then pick unblocked `ready` GitHub issues and implement them in parallel. Each unit of work
  runs in its own git worktree via a subagent on the model named by the ticket's label
  (fable/sonnet/opus). Biases toward tickets that unblock the most others, and never runs more
  than one exclusive-resource-labelled ticket (`db-migration` or `e2e-exclusive`, combined) at a
  time (this repo shares one local Supabase instance across worktrees). Each ticket subagent runs
  the implement-ticket skill (branch,
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
  spawn to just after; the new entry is the freshly-created worktree. Then append the entry:
  create the file with `[]` first if it doesn't exist, then
  `jq --argjson e '<entry-json>' '. + [$e]' .claude/swarm-state.json > /tmp/swarm-state.tmp && mv /tmp/swarm-state.tmp .claude/swarm-state.json`.
- **On every completion** (§4) **and on halt/drain** (Termination): remove that worker's entry —
  `jq --arg id '<agentId>' 'map(select(.agentId != $id))' .claude/swarm-state.json > /tmp/swarm-state.tmp && mv /tmp/swarm-state.tmp .claude/swarm-state.json`.

**Concurrency is capped at 4 worker subagents.** The top-level swarm orchestrator (the parent
agent running this skill) does not count toward the cap — it only selects, spawns, reports and
refills; it holds no worktree and does no ticket work. So: 1 orchestrator + up to 4 workers.
Within that cap, **at most 1 ticket carrying an exclusive-resource label may be in flight at a
time** — the exclusive-resource label set is `db-migration` and `e2e-exclusive`. Both mean the
ticket will mutate the single shared local Supabase instance (schema migrations, or the
`@mutates`-tagged E2E specs a ticket's diff will trigger per `e2e/mutating-spec-triggers.json`),
so they share **one combined counter**, not two independent caps. Tickets carrying neither label
are not affected by this extra cap.

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

## 1. Maintain open PRs — resolve conflicts + address feedback (first call on the budget)

`gh pr list --state open --json number,title,headRefName,labels,reviews,mergeable`

An open PR **needs maintenance** if either holds:
- **Merge conflicts** — `mergeable` is `CONFLICTING` (it may report `UNKNOWN` briefly while
  GitHub recomputes; re-query rather than assume).
- **Outstanding feedback** — inline review comments
  (`gh api repos/{owner}/{repo}/pulls/<n>/comments`) or review bodies (`gh pr view <n> --json
  reviews`) authored by a human, **newer than the PR's head commit** or not yet replied to.
  `CHANGES_REQUESTED` always counts. Ignore the PR's own mermaid-diff/behaviour-change bot
  comments and anything already answered.

For each PR needing maintenance (up to the budget), launch **one** background Agent that handles
both concerns for that PR:
- `subagent_type: general-purpose`; no `isolation` — the prompt tells it to **reuse the PR
  branch's existing worktree if one exists** (`git worktree list`), else `git worktree add` a
  fresh one for that branch. Never edit the main working tree.
- `model` = the linked ticket's label if resolvable, else `sonnet`.
- `description`: `"Maintain PR #<pr>"`.
- Prompt, in order:
  1. **Conflicts first** — if `CONFLICTING`, `git fetch origin` then `git merge origin/main`
     (merge, not rebase — no force-push onto a shared branch), resolve every conflict honouring
     both sides' intent, run the relevant tests to prove the merge is sound.
  2. **Then feedback** — summarise outstanding feedback, make the changes, run tests, reply to
     the reviewer via `gh pr comment <n>`.
  3. Commit (repo conventions, including the model/Claude Code trailers from `implement-ticket`)
     and push. If on inspection neither a real conflict nor genuine feedback remains, no-op and
     report that.

Append a `kind: "maintenance"` entry (see State file) for this worker right after spawning it.

If no open PR needs maintenance, skip to ticket selection with the full budget.

## 2. Select tickets (fill the remaining budget)

`gh issue list --state open --label ready --json number,title,labels,blockedBy,blocking`

Filter and rank:
- **Unblocked only** — drop any issue with an *open* entry in `blockedBy` (all-closed blockers =
  unblocked).
- **Skip in-flight** — drop issues that already have an open linked PR or an existing branch
  (`gh issue view <n> --json closedByPullRequestsReferences` / `git branch -a`).
- **Cap the exclusive-resource label set at 1 in-flight** — if a ticket carries `db-migration` or
  `e2e-exclusive`, only select it if no other ticket carrying either label is currently running
  **and** none has already been picked earlier in this same selection pass. Extra
  exclusive-resource tickets are skipped this round; they remain eligible on the next refill once
  the in-flight one completes.
- **Bias to unblockers** — among what's left, rank by the count of *open* issues in `blocking`
  (how many others this ticket unblocks), highest first; tie-break on lowest issue number.
- Take as many as the **free slots** allow (4 minus workers currently running — both tracks).

If, on a given selection pass, neither §1 nor §2 yields eligible work **and** no workers are
running, the pool is drained: report that and go idle (do not exit the loop — a later completion
or new PR can refill).

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
   exclusive-resource cap). A finished ticket often makes its PR eligible for maintenance and
   unblocks downstream tickets, so a completion usually creates fresh work. If nothing is
   eligible and no workers remain, report the pool is drained and go idle.

Track the live worker set (subagent id → what it's doing, including whether it's the in-flight
exclusive-resource ticket) across the whole run so the cap, refill, and termination logic all
have an accurate count.

## 4.5 Manual re-check (user asks to re-scan)

While idle (pool drained, or free slots held open because remaining work was blocked), the queue
can change without any worker finishing — a sibling PR merges elsewhere, a blocker closes, a new
`ready` ticket or PR appears. swarm only auto-refills on a worker **completion**, so it won't
notice these on its own. The user can force a fresh scan.

If the user issues any re-check-like command — e.g. "check again", "re-check", "rescan", "look
again", "any new work?", "refresh", "poll github" — immediately re-run selection from scratch
against live GitHub state (§1 maintenance first, then §2 tickets) **without** waiting for a
completion, and spawn workers for every newly-eligible unit up to the free slots (cap still 4;
exclusive-resource cap still 1; count workers already running). Report what the re-scan found:
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
- Resolve conflicts by merging `origin/main` into the PR branch — never rebase/force-push a
  shared branch.
- Never pick a blocked ticket; never exceed **4 concurrent worker subagents** across both tracks.
  The orchestrator itself is not a worker and does not count toward the 4.
- Never run more than **1 exclusive-resource-labelled ticket** (`db-migration` or
  `e2e-exclusive`, combined) at a time — extra ones wait for the next refill. This protects the
  single shared local Supabase instance from concurrent schema migrations and concurrent
  `@mutates`-tagged E2E runs.
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
