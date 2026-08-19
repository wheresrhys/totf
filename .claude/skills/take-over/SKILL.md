---
name: take-over
description: >-
  Reclaim a branch that a swarm worker (or other worktree-isolated agent) is mid-way through, so
  the user can keep working on it by hand (e.g. in VS Code). Git refuses to check out a branch
  that's already checked out in another worktree — this resolves an identifier (branch name,
  issue/PR number, a raw agent id, or a paraphrase of the ticket title) to the worker doing that
  work via swarm's state file, halts that agent, stashes and removes its worktree, then checks
  the branch out (reapplying the stash) in the current working directory and merges in
  `origin/main` so the branch/PR is current. If the branch's linked PR/issue carries
  `db-migration`, automatically runs `npm run db:schema:apply` (reconciling with the shared local
  Supabase instance first if another worktree's in-progress migration collides) before pushing, so
  the push's own tests run against a schema that actually matches the code, and warns the user not
  to merge before pushing the migration to prod themselves. Works from any session, including a
  fresh one that never saw the worker spawn. Called with no identifier, instead activates this
  repo's root checkout — the root is kept permanently on `core.bare=true` so `git worktree add`
  can hand out ticket branches without "already checked out" conflicts, which also means plain
  `git status`/`checkout` refuse to run there directly; this switches it to `main` (or another
  named branch) via an explicit `--work-tree`/`--git-dir` override, stashing any dirty state
  first. Triggers: "take over ticket <n>", "take over this branch", "let me work on this myself",
  "/take-over <identifier>", "/take-over" with no argument, "activate the root", "checkout main in
  root", or git complaining a branch is already checked out elsewhere.
---

# take-over

Free a branch that's locked inside another worktree — usually a `swarm` worker's — and check it
out here instead, halting whatever was working on it and keeping any uncommitted progress. The
identifier is the skill argument (e.g. `/take-over 412`, `/take-over feature/412-species-chart`,
`/take-over "the species chart ticket"`). Called with **no argument**, skip straight to step 0
below instead — there's no branch to free, just the repo root to switch onto `main`.

## 0. No identifier: activate the root

This repo's root directory (where `.git` itself lives, distinct from anything under
`.claude/worktrees/`) is deliberately left with `core.bare=true` in its `.git/config` even
though it has a real branch checked out via `HEAD` — that's what lets `git worktree add` hand
out every ticket branch elsewhere without git refusing on "already checked out here" for
whichever branch the root happens to be sitting on. The tradeoff: plain `git status`/`checkout`/
etc run *in* that directory fail with `fatal: this operation must be run in a work tree`, so they
need an explicit override.

Confirm this is really that layout before touching anything: `git -C <root> config core.bare`
reports `true` **and** the directory contains real tracked files (e.g. `package.json`) sitting
next to `.git` — a genuine bare repo (no working files) is not this pattern; if you see that
instead, stop and tell the user rather than guessing.

1. Pick the target branch: `main` unless the user named a different one when invoking with no
   identifier (e.g. "activate root on <branch>").
2. Check dirty state with the override: `git --work-tree=<root> --git-dir=<root>/.git status
   --short`. If non-empty, stash it first — same convention as step 7 below: `git
   --work-tree=<root> --git-dir=<root>/.git stash push -u -m "take-over: root autosave
   $(date -u +%Y-%m-%dT%H:%M:%SZ)"`. Never discard it silently.
3. `git --work-tree=<root> --git-dir=<root>/.git checkout <targetBranch>`.
4. Report the branch switched to, whether it's now ahead/behind `origin/<targetBranch>` (from the
   checkout output — don't auto-pull unless asked), any stash created and left for the user to
   pop by hand, and remind them that further plain git commands in that directory still need the
   same `--work-tree`/`--git-dir` override (or `export GIT_DIR=<root>/.git
   GIT_WORK_TREE=<root>` for the session, if they want to stop repeating the flags).

Stop here — the rest of this skill (steps 1–13) is for reclaiming a branch out of a worktree,
which doesn't apply to the root.

## 1. Resolve the identifier

Call `mcp__swarm-tools__resolve_work_item` with `{identifier}`. It runs the full resolution
chain in one call: exact branch match (state file, then `git branch -a`/`git worktree list`
directly) → issue/PR number match → agent id match → title substring match → (if none hit and
the identifier reads like a paraphrase) a `gh issue list --search` lookup retried against the
same strategies → a `feature/<n>-` branch-pattern fallback for a stale/never-tracked entry. Use
`matches` and `strategyUsed` from the result:

**Multiple matches** (an ambiguous paraphrase, or a number that coincidentally matches more than
one entry) → `AskUserQuestion` listing each candidate's title, branch, and kind, and stop until
the user picks one.

**No match anywhere** (`matches` is empty) → report that plainly and stop; don't guess.

**A match with no `agentId`** (state-file/git/gh-search sources other than an exact state-file
hit) means there's nothing to halt in step 3 — this covers hand-run `implement-ticket` work and
stale state entries.

## 2. Guard: already there?

If the resolved worktree path is the current directory, there's nothing to relocate — just do
step 3 (halt) and stop; report that the user is already sitting in that worktree.

## 3. Halt the agent

If an `agentId` was found: `TaskStop <agentId>`, then remove that entry via
`mcp__swarm-tools__swarm_state_remove` with that `agentId`. Report success even if `TaskStop`
reports "not found" — that just means it had already finished.

If no `agentId` was found for a worktree/branch that clearly exists (untracked or stale entry):
tell the user plainly that nothing could be positively stopped — it was either never run through
swarm, or its tracking entry is gone — and that if something is still actively writing to that
worktree, this won't stop it. This is the one point worth a beat of hesitation; continue once
acknowledged, but don't silently plough through it.

## 4. Preserve the worktree's uncommitted work

`git -C <worktreePath> status --porcelain`. If dirty:
`git -C <worktreePath> stash push -u -m "take-over: <branch> $(date -u +%Y-%m-%dT%H:%M:%SZ)"`.
Note the stash ref (`git -C <worktreePath> stash list` — it'll be the top entry) so step 9 can
reapply exactly this one, not whatever else happens to be on top of the stash stack by then.

## 5. Preserve any hand-authored data-migration DML before the worktree is torn down

Some `db-migration` branches hand-append backfill DML onto their generated migration file — a
convention documented in `implement-ticket` (step 5, point 6): declarative schema sync only ever
emits DDL, so a schema change that needs existing rows migrated to fit the new shape gets that
backfill written by hand and appended after the generated DDL, marked with a literal comment line
`-- Hand-authored data migration (backfill only — appended after schema-apply)`. That file exists
only in this worktree's gitignored `supabase/migrations/` — never committed, and step 4's stash
does **not** capture it (`git stash push -u` skips gitignored files; that needs `-a`, which isn't
used here). Step 6 below removes the worktree entirely, so this is the last chance to read it.

Call `mcp__swarm-tools__resolve_migration_dml` with `{branch, worktreePath, prNumber}` (pass
`prNumber` if step 1 already resolved it — the tool checks the PR body's "Prod-ready migration
SQL" section first, then falls back to the local migration file's marker line) and hold the
result for step 11 (don't defer this — the local file won't exist after step 6).

- **`source: "none"`** — nothing to preserve here. Continue to step 6.
- **`source: "pr-body"` or `"local-file"`** — state plainly that hand-authored DML was found and
  which source it came from; step 11 already prioritizes `pr-body` over `local-file` when both
  exist (the PR body is guaranteed complete and reflects what was actually tested and pushed;
  the local copy may be stale relative to whatever `db:schema:apply` regenerates after step 10's
  merge).

## 6. Free the branch

`git worktree remove <worktreePath>`. If git still refuses (leftover files it won't clean up on
its own), surface the exact error to the user rather than force-removing — don't guess whether
those leftovers are safe to lose.

## 7. Protect the current directory's own state

`git status --porcelain` in the current directory. If dirty, stash it too (`-u`, clearly named,
e.g. `"take-over: pre-checkout autosave $(date -u +%Y-%m-%dT%H:%M:%SZ)"`) before switching
branches — never discard uncommitted work silently. This stash has nothing to do with the branch
being taken over: report it and leave it stashed for the user to recover later by hand
(`git stash list` / `git stash pop`); do not touch it again in this run.

## 8. Checkout

`git fetch origin`, then `git checkout <branch>`.

## 9. Reapply the worktree's stash

If step 4 created a stash, reapply it now: `git stash pop <that stash ref>`. Report cleanly if it
applies with no conflicts; if it doesn't, say so and leave the stash in place rather than forcing
it — the user can resolve and pop it manually.

## 10. Sync with `origin/main`

The worktree being reclaimed may have gone stale while its worker was halted mid-task (or while
this took a while to get to), and other work may have merged to `main` since. Bring the branch
current before anything else:

`git fetch origin`, then `git merge origin/main` (merge, not rebase — same convention `swarm`'s
own PR-maintenance track uses elsewhere in this repo; never force-push a shared branch). Don't
push yet — that happens in step 12, after step 11's schema-apply has had a chance to run. Pushing
first would trigger the pre-push hook's test suite against a working directory whose schema might
not match the code yet, on a `db-migration` branch — exactly backwards.

If the merge conflicts: stop and hand it to the user rather than resolving it on their behalf —
they took the branch over specifically to work on it by hand. Report the conflicting files
plainly. Steps 11 and 12 are skipped in this case (the working tree is mid-conflict, not a clean
state to diff from or push) — go straight to step 13's report and note the unresolved merge there.
If step 5 found hand-authored DML, say explicitly in that report that it's sitting unreattached in
`/tmp/take-over-<branch>-hand-authored-migration.sql`, pending the user resolving the conflict and
re-running `db:schema:apply` by hand.

## 11. Auto-apply the schema if this is a `db-migration` branch

Resolve the branch's linked issue/PR number — from the state-file entry if step 1 found one
(`issue`/`pr` fields), else `gh pr list --head <branch> --json number --state open` as a
fallback. If a PR exists, fetch its labels **and body together in one call** —
`gh pr view <n> --json labels,body` (it carries the exclusive-resource label directly, applied by
`implement-ticket` at PR-creation time; the body may carry the "Prod-ready migration SQL" section
used below). If no PR exists yet, `gh issue view <n> --json labels` for the label only.

If `db-migration` is not present, skip this whole step silently.

If `db-migration` is present, run `npm run db:schema:apply` right here (after step 9's stash
reapply and step 10's merge, so both any uncommitted schema edits and anything just merged in from
`origin/main` are included in the diff). This always regenerates a **DDL-only** file — declarative
schema sync can never emit data-migration DML. Two possible outcomes:

- **Applies cleanly** — go to "Reattach hand-authored DML" below before reporting.
- **Fails with a migration-history mismatch** ("remote migration versions not found in local
  migrations directory" or similar) — this means another worktree has, at some point, applied its
  own in-progress migration to the same shared local Postgres instance, and that file only exists
  in *that* worktree's own gitignored `supabase/migrations/` (never shared between worktrees).
  **Stop and explain this to the user** — name the other branch/worktree if identifiable (`git
  worktree list` plus checking each worktree's `supabase/migrations/` for the missing timestamp),
  and propose the reconciliation below, since it's destructive to local Postgres state (wipes
  local dev/E2E fixture data and any other worktree's in-progress local schema along with it).
  This is local-only, throwaway state, not prod or anything git-tracked, but it's still someone
  else's in-progress work getting wiped, so get an explicit go-ahead before running it rather than
  assuming it every time. Once confirmed:
  1. Move this branch's freshly-generated migration file out of `supabase/migrations/`
     temporarily (e.g. to a scratch directory) — it must not be replayed by the reset below.
  2. `npm run db:schema:pull` — syncs the local migrations directory with what's actually applied
     to prod (also confirms whether prod itself has drifted; "No schema changes found" is the
     expected, benign outcome).
  3. `npx supabase db reset` — wipes the local Postgres and replays only the now-prod-matching
     migrations directory.
  4. Move this branch's migration file back into `supabase/migrations/`, then
     `npx supabase migration up --local` to apply just that one on top of the clean baseline.
  5. Go to "Reattach hand-authored DML" below.
  6. `npm run db:types` (regenerate types; report if this produces a diff — it shouldn't if the
     branch's committed types already match).
  7. `npm run db:seed:e2e` to restore E2E fixture data, then `git checkout -- test-fixtures/` to
     discard the snapshot files it regenerates as a side effect (a known quirk of that script —
     restoring them is routine, not optional).
  8. Report that the reconciliation ran, why, and that local Postgres now reflects prod plus only
     this branch's change. Then proceed with the appropriate warning below.

### Reattach hand-authored DML

Skip this sub-step (nothing to do) if step 5's `resolve_migration_dml` result was `source:
"none"` — this is the common case for a pure-schema `db-migration` branch.

Otherwise, **append** the result's `sql` to the end of the freshly-generated migration file
(blank line separator), leaving the generated DDL untouched. The tool already prioritized
`pr-body` over `local-file` when both existed, so no further precedence logic is needed here —
just note in the report which `source` it came from (a `local-file` source is an untested
fallback, since it wasn't necessarily current as of this run's merge in step 10 — flag that
clearly).

If step 5 returned `source: "none"` but a PR/issue exists, its body or title may still hint a
backfill was intended even though no copy could be found (e.g. the implementer forgot the
section, or hasn't gotten that far yet) — say so plainly rather than silently reporting a clean
DDL-only warning; don't guess at the SQL yourself.

Report the generated migration file's path plus one of these two warnings, verbatim:

- If DML was appended (cases 1 or 2 above):
  > ⚠️ **Database migration — do not merge before pushing.** This migration has hand-authored
  > data-migration DML appended, sourced from <PR #<n>'s "Prod-ready migration SQL" section | this
  > worktree's own local copy — verify it by hand before trusting it>. Inspect the full file, then
  > run `npm run db:migration:push` yourself. Do not merge this PR until that succeeds — merging
  > first triggers a Vercel prod deploy of code that expects a schema prod doesn't have yet.
- Otherwise (plain DDL, nothing to reattach):
  > ⚠️ **Database migration — do not merge before pushing.** Inspect the generated migration, then
  > run `npm run db:migration:push` yourself. Do not merge this PR until that succeeds — merging
  > first triggers a Vercel prod deploy of code that expects a schema prod doesn't have yet.

If no `db-migration` label is found, skip this step silently.

## 12. Push

`git push` (`git push -u origin <branch>` if the branch has no upstream yet) — now that step 11
has ensured (for a `db-migration` branch) the local schema matches what the code expects, so the
pre-push hook's tests run against a consistent environment instead of failing on a stale schema.

## 13. Report

Summarise: whether the agent was halted (or why not), that the worktree was removed, that the
branch is now checked out here, any stashes created/reapplied (and any left behind, e.g. the
current-directory autosave from step 7), whether step 10's merge succeeded or hit conflicts,
whether step 11 ran (including whether the reconciliation path fired, whether hand-authored DML
was found by step 5 and appended by step 11, and why), whether step 12's push succeeded, and — if
the branch has an open PR — its URL.

## Rules

- Never remove a worktree or discard changes without stashing first — uncommitted work always
  survives a take-over.
- Ambiguous identifier resolution always gets `AskUserQuestion`; never guess between candidates.
- The current directory's pre-existing uncommitted changes (step 7) are never auto-reapplied —
  only the taken-over branch's own stash (step 4) is.
- If no agent id can be found for an existing worktree/branch, say so before proceeding — don't
  present a silent, unqualified success.
- Always merge (never rebase/force-push) `origin/main` into the reclaimed branch, so a stale
  worker-abandoned branch and its PR are brought current as part of the handoff. Stop and hand off
  to the user on conflict instead of resolving it for them, and don't push in that case.
- **Schema-apply always runs before push, never after**, for a `db-migration` branch — the push
  triggers pre-push tests that need the schema already applied locally, so applying it first isn't
  an optimisation, it's required for the push to have a chance of passing.
- A `db-migration` branch always gets `npm run db:schema:apply` run automatically, with the "do
  not merge before pushing" warning in the report — never silently skip this for a labelled
  branch. If it fails on a migration-history mismatch (another worktree's in-progress migration
  already applied to the shared local instance), explain what's happening and get the user's
  go-ahead before running the reset-and-reapply reconciliation in step 11 — it's local-only,
  throwaway state, but still someone else's in-progress work, so it's not a standing
  auto-authorization to wipe it every time this comes up.
- **Hand-authored data-migration DML is never silently dropped.** Step 5 captures it from the
  worktree before teardown (the only local copy, since `supabase/migrations/` is gitignored and
  `git worktree remove` destroys anything not captured first); step 11 prefers the branch's own PR
  body ("Prod-ready migration SQL" section) over that local capture when both exist, since the PR
  body is guaranteed complete and reflects what was actually tested and pushed. It is always
  **appended** after the freshly-generated DDL, never used to replace or interleave with it.
