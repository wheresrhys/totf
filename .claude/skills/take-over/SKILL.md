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
  fresh one that never saw the worker spawn. Triggers: "take over ticket <n>", "take over this
  branch", "let me work on this myself", "/take-over <identifier>", or git complaining a branch is
  already checked out elsewhere.
---

# take-over

Free a branch that's locked inside another worktree — usually a `swarm` worker's — and check it
out here instead, halting whatever was working on it and keeping any uncommitted progress. The
identifier is the skill argument (e.g. `/take-over 412`, `/take-over feature/412-species-chart`,
`/take-over "the species chart ticket"`).

## 1. Resolve the identifier

Read `.claude/swarm-state.json` (if missing, treat as `[]` — everything below still works via
git directly, just without an agent id to halt). Try, in order, until one produces exactly one
match:

1. **Exact branch match** — identifier equals an entry's `branch`, or an exact ref found in
   `git branch -a` / `git worktree list`.
2. **Issue/PR number match** — identifier is numeric or `#<n>`; match against `issue` or `pr`.
3. **Agent id match** — identifier matches an entry's `agentId` exactly (the user may have this
   from something swarm printed, or from elsewhere in the harness).
4. **Title substring match** — case-insensitive substring/keyword match against `title`.

If none of these hit and the identifier reads like a paraphrase (free text, not a number or
branch-shaped string), resolve it to an issue first: `gh issue list --search "<identifier>"
--state open --json number,title`, then retry steps 2–4 against that issue's number.

**If the state file still has no match** (never tracked, or its entry was already cleared) but
the identifier clearly names a real ticket: derive the expected branch pattern from
`implement-ticket`'s convention (`feature/<n>-<slug>`) and look for it directly in `git branch
-a` / `git worktree list`. This covers hand-run `implement-ticket` work and stale state entries.
There will be no agent id to halt in this case — see step 3.

**Multiple matches** (an ambiguous paraphrase, or a number that coincidentally matches more than
one entry) → `AskUserQuestion` listing each candidate's title, branch, and kind, and stop until
the user picks one.

**No match anywhere** → report that plainly and stop; don't guess.

## 2. Guard: already there?

If the resolved worktree path is the current directory, there's nothing to relocate — just do
step 3 (halt) and stop; report that the user is already sitting in that worktree.

## 3. Halt the agent

If an `agentId` was found: `TaskStop <agentId>`, then remove that entry from
`.claude/swarm-state.json` (same `jq` pattern swarm uses). Report success even if `TaskStop`
reports "not found" — that just means it had already finished.

If no `agentId` was found for a worktree/branch that clearly exists (untracked or stale entry):
tell the user plainly that nothing could be positively stopped — it was either never run through
swarm, or its tracking entry is gone — and that if something is still actively writing to that
worktree, this won't stop it. This is the one point worth a beat of hesitation; continue once
acknowledged, but don't silently plough through it.

## 4. Preserve the worktree's uncommitted work

`git -C <worktreePath> status --porcelain`. If dirty:
`git -C <worktreePath> stash push -u -m "take-over: <branch> $(date -u +%Y-%m-%dT%H:%M:%SZ)"`.
Note the stash ref (`git -C <worktreePath> stash list` — it'll be the top entry) so step 8 can
reapply exactly this one, not whatever else happens to be on top of the stash stack by then.

## 5. Free the branch

`git worktree remove <worktreePath>`. If git still refuses (leftover files it won't clean up on
its own), surface the exact error to the user rather than force-removing — don't guess whether
those leftovers are safe to lose.

## 6. Protect the current directory's own state

`git status --porcelain` in the current directory. If dirty, stash it too (`-u`, clearly named,
e.g. `"take-over: pre-checkout autosave $(date -u +%Y-%m-%dT%H:%M:%SZ)"`) before switching
branches — never discard uncommitted work silently. This stash has nothing to do with the branch
being taken over: report it and leave it stashed for the user to recover later by hand
(`git stash list` / `git stash pop`); do not touch it again in this run.

## 7. Checkout

`git fetch origin`, then `git checkout <branch>`.

## 8. Reapply the worktree's stash

If step 4 created a stash, reapply it now: `git stash pop <that stash ref>`. Report cleanly if it
applies with no conflicts; if it doesn't, say so and leave the stash in place rather than forcing
it — the user can resolve and pop it manually.

## 9. Sync with `origin/main`

The worktree being reclaimed may have gone stale while its worker was halted mid-task (or while
this took a while to get to), and other work may have merged to `main` since. Bring the branch
current before anything else:

`git fetch origin`, then `git merge origin/main` (merge, not rebase — same convention `swarm`'s
own PR-maintenance track uses elsewhere in this repo; never force-push a shared branch). Don't
push yet — that happens in step 11, after step 10's schema-apply has had a chance to run. Pushing
first would trigger the pre-push hook's test suite against a working directory whose schema might
not match the code yet, on a `db-migration` branch — exactly backwards.

If the merge conflicts: stop and hand it to the user rather than resolving it on their behalf —
they took the branch over specifically to work on it by hand. Report the conflicting files
plainly. Steps 10 and 11 are skipped in this case (the working tree is mid-conflict, not a clean
state to diff from or push) — go straight to step 12's report and note the unresolved merge there.

## 10. Auto-apply the schema if this is a `db-migration` branch

Resolve the branch's linked issue/PR number — from the state-file entry if step 1 found one
(`issue`/`pr` fields), else `gh pr list --head <branch> --json number --state open` as a
fallback. Check its labels: `gh pr view <n> --json labels` if a PR exists (it carries the
exclusive-resource label directly, applied by `implement-ticket` at PR-creation time), otherwise
`gh issue view <n> --json labels`.

If `db-migration` is present, run `npm run db:schema:apply` right here (after step 8's stash
reapply and step 9's merge, so both any uncommitted schema edits and anything just merged in from
`origin/main` are included in the diff). Two possible outcomes:

- **Applies cleanly** — report the generated migration file's path plus this warning, verbatim:
  > ⚠️ **Database migration — do not merge before pushing.** Inspect the generated migration, then
  > run `npm run db:migration:push` yourself. Do not merge this PR until that succeeds — merging
  > first triggers a Vercel prod deploy of code that expects a schema prod doesn't have yet.
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
  5. `npm run db:types` (regenerate types; report if this produces a diff — it shouldn't if the
     branch's committed types already match).
  6. `npm run db:seed:e2e` to restore E2E fixture data, then `git checkout -- test-fixtures/` to
     discard the snapshot files it regenerates as a side effect (a known quirk of that script —
     restoring them is routine, not optional).
  7. Report that the reconciliation ran, why, and that local Postgres now reflects prod plus only
     this branch's change. Then proceed with the same "applies cleanly" warning above.

If no `db-migration` label is found, skip this step silently.

## 11. Push

`git push` (`git push -u origin <branch>` if the branch has no upstream yet) — now that step 10
has ensured (for a `db-migration` branch) the local schema matches what the code expects, so the
pre-push hook's tests run against a consistent environment instead of failing on a stale schema.

## 12. Report

Summarise: whether the agent was halted (or why not), that the worktree was removed, that the
branch is now checked out here, any stashes created/reapplied (and any left behind, e.g. the
current-directory autosave from step 6), whether step 9's merge succeeded or hit conflicts,
whether step 10 ran (including whether the reconciliation path fired, and why), whether step 11's
push succeeded, and — if the branch has an open PR — its URL.

## Rules

- Never remove a worktree or discard changes without stashing first — uncommitted work always
  survives a take-over.
- Ambiguous identifier resolution always gets `AskUserQuestion`; never guess between candidates.
- The current directory's pre-existing uncommitted changes (step 6) are never auto-reapplied —
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
  go-ahead before running the reset-and-reapply reconciliation in step 10 — it's local-only,
  throwaway state, but still someone else's in-progress work, so it's not a standing
  auto-authorization to wipe it every time this comes up.
