---
name: flesh-out-ticket
description: >-
  Turn ONE sketched task into a precise, commit-sized, test-enumerated ticket and file it as a
  labelled GitHub issue. Fleshes out scope/acceptance criteria, breaks the work into small
  commits, enumerates describe blocks and test titles (USE algorithm), identifies which stack
  layers it touches (tagging `db-migration` if it touches `supabase/schema/`, or `e2e-exclusive`
  if it touches a path listed in `e2e/mutating-spec-triggers.json`), picks the
  cheapest Claude model that can do it accurately (fable/sonnet/opus label), ALWAYS asks for
  confirmation, then runs `gh issue create` with the model label plus `ready`. Can optionally
  file the ticket as a GitHub sub-issue of a named tracking issue. Operates on a single task
  only — it never walks a whole task list (that's ticketify's job). Triggers: "flesh out
  ticket", "flesh out this task", "/flesh-out-ticket", turning a sketched task into a GitHub
  issue.
---

# flesh-out-ticket

Take a **single** task description and turn it into a precise GitHub issue. Work on one task
only — never iterate a whole task list or process multiple tasks in one run. If the user hands
you a whole list, ask which single task to act on (or point them at `ticketify`).

## Precheck

Confirm GitHub Issues are enabled: run `gh issue list` once. If it errors with issues disabled,
stop and tell the user to enable them (`gh repo edit --enable-issues`) before continuing.

## Input

The task text arrives as the skill argument (pasted prose), or as a named section of an existing
GitHub tracking issue's body the user references (e.g. "flesh out the second bullet of #408") —
this repo has no `tasks.md`; tracking issues with sub-issues (e.g. #408 with children #409–#418)
are the planning convention. If no task text is given, ask the user to paste the one task, then
stop until they do.

If the task came from a named tracking issue, remember its number — after creation (step 6) the
new issue is linked as a **sub-issue** of it.

## Workflow

### 1. Flesh out the ticket
Draft a structured ticket in markdown:
- **Title** — concise, imperative (e.g. "Add species breakdown chart to session page").
- **Context** — why this is needed; link the originating tracking issue or requirement.
- **Scope & acceptance criteria** — bullets, each testable/observable.
- **Out of scope** — what this ticket deliberately does not do.
- **Dependencies** — other tickets/work that must land first.
- **Reuse** — name existing repo files/patterns to build on (grep/read the repo before asserting
  something exists). Follow conventions in `CLAUDE.md` (YAGNI, DRY after 3rd use, descriptive
  names, existing data-fetching/model/action/component conventions).

### 2. Identify stack layers touched
Using the same categories `implement-ticket` scopes against: database schema / RPC functions /
server actions / components / pages / tests. Note this in the ticket body — it drives both the
PR-splitting decision `implement-ticket` will make later and the label in step 4.

### 3. Break into small commits
Ordered list of shippable subtasks. Each aims for <400 LOC (per `CLAUDE.md`). One line each:
what changes and why. If the whole ticket is one small commit, say so.

### 4. Enumerate tests (USE algorithm)
Apply the USE algorithm from `CLAUDE.md`: Usual (typical happy-path cases), Structure (one test
per param/variant/branch of the component's shape), Edge (boundaries, empties, ties, errors).

List concrete `describe` blocks and individual test titles. Validator modules → unit tests;
complex subsystems → integration/BDD tests from the caller's point of view. If the ticket has no
runtime surface (pure docs/config), write "No tests" plus a one-line reason.

### 5. Choose the model label
Pick the **cheapest** Claude model that can complete the ticket **accurately**, per this repo's
existing rubric (CLAUDE.md > Creating GitHub tickets):
- **`sonnet`** — small, precisely specified, low-risk changes.
- **`opus`** — fiddly or multi-constraint work (complex SQL, seed-data churn, interacting rules).
- **`fable`** — complex or foundational work that sets patterns others build on.

State the chosen label and a one-line justification.

### 6. Confirm (HARD GATE — never skip)
1. Print the **complete** drafted ticket (title + sections 1–4, verbatim, exactly as it will be
   filed) as its own normal chat message. Never summarize, paraphrase, or squash it — the user
   must see the actual ticket text, not a description of it.
2. Only after that full text is visible, call **AskUserQuestion** with a short decision-only
   question ("Confirm & create / Edit / Change model label") plus the proposed model label and
   justification. The AskUserQuestion question text is for the decision prompt only — it must
   never carry the ticket content itself (that field truncates/compresses long text, which is
   exactly what must not happen to the ticket).
- Do NOT create the issue until the user explicitly confirms.
- On Edit or Change label, revise, re-print the full updated ticket, and re-present, looping until
  confirmed.

### 7. Create the GitHub issue
Only after confirmation:
1. Ensure labels exist. Run `gh label list`. `ready`/`opus`/`sonnet`/`fable` already exist in
   this repo. These two are the **exclusive-resource label set** — `swarm` caps at most 1
   ticket carrying *either* in flight at a time, since both mean the ticket will mutate the
   single shared local Supabase instance. Create whichever is missing and needed:
   - If the ticket touches `supabase/schema/` (step 2) and `db-migration` is missing:
     `gh label create db-migration --color b60205 --description "Touches supabase/schema/ — swarm runs at most one exclusive-resource ticket at a time"`
   - If the ticket touches a path listed in `e2e/mutating-spec-triggers.json` (step 2) and
     `e2e-exclusive` is missing:
     `gh label create e2e-exclusive --color b60205 --description "Touches a @mutates E2E spec's trigger path — swarm runs at most one exclusive-resource ticket at a time"`
2. Write the fleshed markdown (sections 1–4) to a temp file in the scratchpad and create the
   issue from it (avoids shell-escaping problems):
   `gh issue create --title "<title>" --body-file <tmpfile> --label <model> --label ready`
   — add `--label db-migration` and/or `--label e2e-exclusive` too if step 2 flagged either.
3. If the task came from a named tracking issue (see Input), link the new issue as its
   sub-issue: `gh api repos/{owner}/{repo}/issues/<parent>/sub_issues -f sub_issue_id=<new-issue-node-id>`
   (resolve the new issue's node id via `gh issue view <new-number> --json id` first).
4. Report the created issue URL back to the user.

## Rules
- Single task per run. Never batch — that's `ticketify`.
- Every issue gets exactly two labels (model + `ready`), plus `db-migration` when it touches
  `supabase/schema/` and/or `e2e-exclusive` when it touches a path in
  `e2e/mutating-spec-triggers.json`.
- Confirmation gate in step 6 is mandatory — no issue without an explicit yes.
- Sub-issue linking only happens when the task's source was a named tracking issue.
