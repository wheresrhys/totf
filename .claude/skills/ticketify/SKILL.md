---
name: ticketify
description: >-
  Turn one or more tasks into GitHub issues — one issue per task — by reusing the
  flesh-out-ticket skill for each. Accepts two input shapes: an already-itemized list of tasks
  (pasted as an argument, or read from a named GitHub tracking issue's body), or a single large
  task description with no item boundaries, which is decomposed into commit-sized tasks first.
  First reviews the whole task list conversationally, surfacing clarifications/improvements and
  writing accepted ones back to the source (the tracking issue's body, if that's where it came
  from), before drafting. Before any full drafting, produces a fast coarse per-ticket size
  estimate (likely files touched, rough LOC, flagged if over this repo's <400 LOC heuristic) so
  the user can drill into or resize any ticket while it's still cheap to change. Enumerates
  commits and tests, picks a model label (fable/sonnet/opus) + `ready`, tags `db-migration` where
  a task touches `supabase/schema/`, `e2e-exclusive` where it touches a path in
  `e2e/mutating-spec-triggers.json`, and one or more `zone:*` labels per `CLAUDE.md`'s "Repo
  zones", and expresses inter-task dependencies as GitHub native
  "blocked by" links. When run under a named tracking issue, each created ticket is filed as its
  GitHub sub-issue. Drafting and creation are both parallelised across subagents — each subagent
  creates its own ticket directly and reports back a one-line receipt (issue number + URL); there
  is no per-ticket full-markdown confirmation gate in the main thread (the upfront whole-list
  review and sizing plan are the human checkpoints instead). Triggers: "ticketify", "/ticketify",
  "ticketify this", "break this task down into tickets", "create tickets for all these tasks",
  "turn this task list into issues".
---

# ticketify

Turn one or more tasks into GitHub issues — one issue per task — by reusing the
[`flesh-out-ticket`](../flesh-out-ticket/SKILL.md) skill for each. This skill orchestrates;
`flesh-out-ticket` owns how a single ticket is fleshed out, confirmed, labelled and created.

## Precheck
Confirm GitHub Issues are enabled: run `gh issue list` once. If it errors with issues disabled,
stop and tell the user to enable them (`gh repo edit --enable-issues`) before continuing.

## Workflow

### 0. Determine input shape
The argument (or a named tracking issue's body) is either already an itemized list, or a single
large task with no item boundaries. Handle each differently:

- **Already a list** (multiple bullets/numbered lines/clearly-separated items — including a
  tracking issue whose body is already itemized, e.g. #408 with children #409–#418): proceed
  straight to step 1 unchanged.
- **A single large task**: draft a proposed decomposition into discrete, commit-sized tasks
  before doing anything else. Apply this repo's usual small-shippable-increment sizing (`CLAUDE.md`:
  dedicated branch per increment, <400 LOC heuristic, incremental thinking driving the breakdown).
  Treat this draft breakdown as the input list and feed it straight into step 1's conversational
  review below — do not run a separate approval pass for the decomposition itself; let the user
  merge/split/amend it as part of that same review.
- **Genuinely ambiguous** which mode applies: ask the user rather than guess.

### 1. Review the whole list (conversational)
Run this **once, up front**, before any drafting. It is distinct from both the scope-selection
step (§2) and the per-ticket creation receipt (§5).

- Read the full task source: the skill argument if pasted (or step 0's proposed decomposition),
  otherwise a named GitHub tracking issue's body. Parse into an ordered list of items — treat each
  bullet/line as one task.
- Review the list **as a whole** and raise, in prose, anything worth the user's input before
  drafting. Grep/read the repo (`README.md`, `CLAUDE.md`, `app/`, `supabase/`) before asserting
  gaps. Look for:
  - **Ambiguities / open questions** already noted in the text.
  - **Gaps** — missing tasks or acceptance detail implied by documented conventions or existing
    patterns.
  - **Ordering / dependency** problems (a task that needs another to land first).
  - **Merge / split** candidates (items too big for one <400 LOC ticket, or trivially small
    duplicates).
  - **Inconsistencies** with repo conventions in `CLAUDE.md`.
- Discuss **conversationally**: propose each point and let the user accept / reject / amend. This
  is a genuine dialogue, not a one-shot AskUserQuestion.
- For every **accepted** improvement, edit the source:
  - If the source was a tracking issue, apply the accepted edits and update the issue body:
    `gh issue edit <parent> --body-file <updated-body-file>`.
  - If the source was a pasted argument or step 0's decomposition (no tracking issue), apply the
    accepted edits to the working copy used for drafting only, and tell the user no GitHub issue
    was touched.
- Use the **updated** list as the input to every step below.

### 2. Scope selection
- Present the reviewed list back to the user (one-line summary per task) and let them trim or
  confirm which tasks are in scope. This is scope selection — tickets are created straight after
  drafting (§4), with only a lightweight receipt (§5) afterward, not a further approval step.

### 3. High-level sizing plan (before detailed drafting)
Before fleshing any ticket in full, give the user a fast, coarse size estimate per in-scope task
so oversized tickets get caught before the cost of full drafting (§4) is spent on them.

- For each in-scope task, without running `flesh-out-ticket`'s full fleshing, produce a rough
  estimate: likely files touched (paths/dirs, from a quick grep/read of the areas the task's
  description implies) and a rough LOC range. Flag any task whose estimate clearly exceeds this
  repo's <400 LOC heuristic (`CLAUDE.md`).
- Present the whole set as a single table: task # | one-line summary | est. files touched |
  est. LOC | flag (over-heuristic?).
- Discuss conversationally, same as §1: the user can ask to drill into any one task (a short
  paragraph of what it would touch and why — still short of a full ticket draft) or give feedback
  (split, merge, trim scope, accept as-is) on any task, especially ones flagged oversized.
- Loop until the user is satisfied with the plan. Apply any accepted split/merge/trim to the
  working task list before proceeding to §4.

### 4. Draft and create each ticket (parallelise)
For each in-scope task, produce a draft using `flesh-out-ticket` steps 1–5 (flesh out, stack-layer
identification, small-commit breakdown, USE test enumeration, model-label choice), then create the
issue immediately — there is no per-ticket confirmation gate before creation in this workflow (see
Rules for why this deliberately diverges from `flesh-out-ticket`'s standalone default).

When there are more than ~3 tasks, fan out to `general-purpose` subagents to draft **and create**
concurrently:
- Give each subagent exactly ONE task to draft, **plus the full parsed task list for reference**
  (so it can identify dependencies on other tasks) and the `parentIssue` number if this run is
  scoped under a tracking issue.
- Instruct each subagent to draft the ticket (title/body/labels/model-label per
  `flesh-out-ticket` steps 1–5, including step 2's zone identification), then call
  `mcp__swarm-tools__create_ticket` itself with `title`,
  `body`, `modelLabel`, `extraLabels` (`db-migration` if it touches `supabase/schema/`,
  `e2e-exclusive` if it touches a path in `e2e/mutating-spec-triggers.json`), `zoneLabels` (one or
  more of `zone:app`/`zone:data-layer`/`zone:agentic-tooling` — never empty), and `parentIssue` if
  given (the tool links the sub-issue itself). Do NOT pass `blockedBy` yet — sibling issue numbers
  aren't known at draft time; that's wired up in §6.
- Each subagent returns **only** these compact fields — no full body, no narrative wrapper, no
  meta-commentary:
  - `title` — the fleshed title.
  - `issueNumber` and `issueUrl` — from `create_ticket`'s response.
  - `dependsOn` — the other tasks (identified by summary) this task is blocked by.

### 5. Receipt — lightweight checkpoint
As each subagent's ticket lands, print one line in the main thread: `#<issueNumber> <title> —
<issueUrl>`. This is a visibility checkpoint, not a pre-creation approval — the ticket already
exists by the time the user sees it. If the user wants to change a ticket's content after seeing
its receipt, that's a normal follow-up `gh issue edit`, outside this workflow.

### 6. Wire up dependencies (incremental)
Maintain a running `task summary → issueNumber` map, updated as each subagent returns. As soon as
a ticket's `dependsOn` summaries are all present in the map, call
`mcp__swarm-tools__link_ticket_dependencies` with `{issueNumber, blockedBy}` immediately (the tool
runs the single comma-joined `gh issue edit --add-blocked-by` call) — don't wait for every ticket
to land first. After the last subagent returns, do one final pass over any tickets whose
`dependsOn` wasn't fully resolvable yet to catch stragglers. (This is orthogonal to sub-issue
membership — `blocked-by` sequences siblings, sub-issue links them to the parent.)

### 7. Report
Summarise: each created issue URL, its labels, its sub-issue parent (if any), and its blocked-by
links.

## Rules
- Step 0 always runs first — decide list-vs-single-task before anything else, and never silently
  treat a single large task as if it were already itemized.
- The whole-list review (§1) runs once at the start, before any drafting. Only user-accepted
  changes are written back; when the source is a tracking issue, its body is edited in place.
- The sizing plan (§3) runs after scope selection and before any full drafting; it gives a rough
  per-ticket size estimate and lets the user drill into or resize any ticket before the cost of
  full fleshing is spent.
- One issue per task. Reuse `flesh-out-ticket`'s fleshing and labelling logic for the per-ticket
  work — do not reinvent it. Unlike a standalone `flesh-out-ticket` run, ticketify does NOT reuse
  its confirmation gate: creation happens immediately after drafting, with no per-ticket
  pre-creation approval step. This is a deliberate trade — the full-markdown gate reprinted every
  ticket's body in the main thread, which dominated this skill's token cost for batches of more
  than a couple of tasks. The whole-list review (§1) and sizing plan (§3) already give the user
  two upfront checkpoints over the same content before any ticket is created, so a third
  per-ticket repeat of the same review was judged redundant; §5's one-line receipt is the
  remaining visibility (not approval) step.
- Every issue: one model label (`fable`|`sonnet`|`opus`) + `ready`, plus `db-migration` when it
  touches `supabase/schema/` and/or `e2e-exclusive` when it touches a path in
  `e2e/mutating-spec-triggers.json`, plus one or more `zone:*` labels (never zero), plus any
  blocked-by links and (when scoped under a tracking issue) sub-issue membership.
- Dependency links (§6) are applied incrementally as issue numbers become known, not in a single
  batch after every ticket exists — `link_ticket_dependencies` only ever needs one issue's own
  `blockedBy` list, never a global view of all created tickets.
