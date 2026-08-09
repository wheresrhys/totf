---
name: tasks-to-tickets
description: >-
  Turn a whole list of sketched tasks (pasted as an argument, or read from a named GitHub
  tracking issue's body) into a set of GitHub issues, one per task, by reusing the
  flesh-out-ticket skill for each. First reviews the whole task list conversationally, surfacing
  clarifications/improvements and writing accepted ones back to the source (the tracking issue's
  body, if that's where it came from), before drafting. Enumerates commits and tests, picks a
  model label (fable/sonnet/opus) + `ready`, tags `db-migration` where a task touches
  `supabase/schema/`, and expresses inter-task dependencies as GitHub native "blocked by" links.
  When run under a named tracking issue, each created ticket is filed as its GitHub sub-issue.
  Drafting is parallelised across subagents, but the flesh-out-ticket confirmation gate still
  fires for every ticket in the main thread. Triggers: "tasks to tickets", "create tickets for
  all these tasks", "/tasks-to-tickets", "turn this task list into issues".
---

# tasks-to-tickets

Turn a list of tasks into GitHub issues — one issue per task — by reusing the
[`flesh-out-ticket`](../flesh-out-ticket/SKILL.md) skill for each. This skill orchestrates;
`flesh-out-ticket` owns how a single ticket is fleshed out, confirmed, labelled and created.

## Precheck
Confirm GitHub Issues are enabled: run `gh issue list` once. If it errors with issues disabled,
stop and tell the user to enable them (`gh repo edit --enable-issues`) before continuing.

## Workflow

### 1. Review the whole list (conversational)
Run this **once, up front**, before any drafting. It is distinct from both the scope-selection
step (§2) and the per-ticket confirmation gate (§4).

- Read the full task source: the skill argument if pasted, otherwise a named GitHub tracking
  issue's body (this repo has no `tasks.md` — tracking issues with sub-issues, e.g. #408 with
  children #409–#418, are the planning convention). Parse into an ordered list of items — treat
  each bullet/line as one task.
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
  - If the source was a pasted argument (no tracking issue), apply the accepted edits to the
    working copy used for drafting only, and tell the user no GitHub issue was touched.
- Use the **updated** list as the input to every step below.

### 2. Scope selection
- Present the reviewed list back to the user (one-line summary per task) and let them trim or
  confirm which tasks are in scope. This is scope selection — it is NOT the per-ticket
  confirmation gate (that comes later, per ticket).

### 3. Draft each ticket (parallelise)
For each in-scope task, produce a draft using `flesh-out-ticket` steps 1–5 (flesh out, stack-layer
identification, small-commit breakdown, USE test enumeration, model-label choice). Do NOT create
issues yet.

When there are more than ~3 tasks, fan out to `general-purpose` subagents to draft concurrently:
- Give each subagent exactly ONE task to draft, **plus the full parsed task list for reference**
  so it can identify dependencies on other tasks.
- Instruct each subagent to **draft only**: it MUST NOT create any GitHub issue and MUST NOT try
  to confirm with the user (subagents cannot prompt the user). It returns a structured draft:
  - `title` — the fleshed title.
  - `body` — the fleshed markdown (context/scope/acceptance/out-of-scope/reuse + stack layers
    touched + commit breakdown + test enumeration).
  - `touchesDbSchema` — whether it touches `supabase/schema/` (drives the `db-migration` label).
  - `modelLabel` + one-line justification (`fable`|`sonnet`|`opus`).
  - `dependsOn` — the other tasks (identified by summary) this task is blocked by.

### 4. Confirm each ticket — HARD GATE, propagated from flesh-out-ticket
Back in the **main thread**, order the drafts in dependency order (blockers before the tickets
they block). For each draft, run `flesh-out-ticket` step 6's confirmation gate: present the full
ticket + proposed model label, then AskUserQuestion offering **Confirm & create / Edit / Change
model label**. Loop on edits until the user confirms.

This gate is mandatory for every ticket. Parallel drafting in step 3 must never bypass it — the
user confirms and can give feedback on each WIP ticket individually.

### 5. Create issues
On each confirmation, run `flesh-out-ticket` step 7: ensure the model label, `ready`, and (if
`touchesDbSchema`) `db-migration` labels exist (create if missing), write the body to a
scratchpad temp file, then:
`gh issue create --title "..." --body-file <tmpfile> --label <model> --label ready [--label db-migration]`.
If this run is scoped under a tracking issue, link each created issue as its sub-issue (same
mechanism as `flesh-out-ticket` step 7.3). Record the mapping `task → issue number`.

### 6. Wire up dependencies (second pass)
Once every confirmed issue exists (so all issue numbers are known), resolve each ticket's
`dependsOn` tasks to their issue numbers and apply the GitHub "blocked by" links:
`gh issue edit <issue#> --add-blocked-by <blockerIssue#>[,<blockerIssue#>...]`
(A second pass is used so creation order and missing-number problems don't arise. This is
orthogonal to sub-issue membership — `blocked-by` sequences siblings, sub-issue links them to
the parent.)

### 7. Report
Summarise: each created issue URL, its labels, its sub-issue parent (if any), and its blocked-by
links.

## Rules
- The whole-list review (§1) runs once at the start, before any drafting. Only user-accepted
  changes are written back; when the source is a tracking issue, its body is edited in place.
- One issue per task. Reuse `flesh-out-ticket` for the per-ticket work — do not reinvent its
  fleshing, confirmation gate, labelling, or creation logic.
- Every issue: one model label (`fable`|`sonnet`|`opus`) + `ready`, plus `db-migration` when it
  touches `supabase/schema/`, plus any blocked-by links and (when scoped under a tracking issue)
  sub-issue membership.
- The per-ticket confirmation gate is non-negotiable and runs in the main thread, even when
  drafting was parallelised.
