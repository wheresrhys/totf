---
name: take-over
description: >-
  Reclaim a branch that a swarm worker (or other worktree-isolated agent) is mid-way through, so
  the user can keep working on it by hand (e.g. in VS Code). Git refuses to check out a branch
  that's already checked out in another worktree — this resolves an identifier (branch name,
  issue/PR number, a raw agent id, or a paraphrase of the ticket title) to the worker doing that
  work via swarm's state file, halts that agent, stashes and removes its worktree, then checks
  the branch out (reapplying the stash) in the current working directory, merges in `origin/main`
  and pushes so the branch/PR is current. If the branch's linked PR/issue carries `db-migration`,
  automatically runs `npm run db:schema:apply` and warns the user not to merge before pushing the
  migration themselves. Works from any session, including a fresh one that never saw the worker
  spawn. Triggers: "take over ticket <n>", "take over this branch", "let me work on this myself",
  "/take-over <identifier>", or git complaining a branch is already checked out elsewhere.
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

## 9. Sync with `origin/main` and push

The worktree being reclaimed may have gone stale while its worker was halted mid-task (or while
this took a while to get to), and other work may have merged to `main` since. Bring the branch
current and make sure GitHub reflects that:

`git fetch origin`, then `git merge origin/main` (merge, not rebase — same convention `swarm`'s
own PR-maintenance track uses elsewhere in this repo; never force-push a shared branch). If it
merges cleanly, `git push` (`git push -u origin <branch>` if the branch has no upstream yet) so
the PR (if one exists) picks up the merge immediately rather than sitting stale until the user's
next manual push.

If the merge conflicts: stop and hand it to the user rather than resolving it on their behalf —
they took the branch over specifically to work on it by hand. Report the conflicting files
plainly and do not push. Step 10's schema-apply is skipped in this case (the working tree is
mid-conflict, not a clean state to diff from) — go straight to step 11's report and note the
unresolved merge there.

## 10. Auto-apply the schema if this is a `db-migration` branch

Resolve the branch's linked issue/PR number — from the state-file entry if step 1 found one
(`issue`/`pr` fields), else `gh pr list --head <branch> --json number --state open` as a
fallback. Check its labels: `gh pr view <n> --json labels` if a PR exists (it carries the
exclusive-resource label directly, applied by `implement-ticket` at PR-creation time), otherwise
`gh issue view <n> --json labels`.

If `db-migration` is present:
- Run `npm run db:schema:apply` right here, in the just-checked-out working directory (after step
  8's stash reapply and step 9's merge, so both any uncommitted schema edits and anything just
  merged in from `origin/main` are included in the diff).
- On success, report the generated migration file's path plus this warning, verbatim:
  > ⚠️ **Database migration — do not merge before pushing.** Inspect the generated migration, then
  > run `npm run db:migration:push` yourself. Do not merge this PR until that succeeds — merging
  > first triggers a Vercel prod deploy of code that expects a schema prod doesn't have yet.
- On failure (e.g. the shared local Supabase instance has schema drift from other work), surface
  the error plainly rather than guessing at a fix. Mention `npm run db:sync:local` as the user's
  own option to reset to a clean baseline first, but don't run it automatically — it's destructive
  (wipes the local db) and outside what this step is for.

If no `db-migration` label is found, skip this step silently.

## 11. Report

Summarise: whether the agent was halted (or why not), that the worktree was removed, that the
branch is now checked out here, any stashes created/reapplied (and any left behind, e.g. the
current-directory autosave from step 6), whether step 9's merge+push succeeded or hit conflicts,
whether step 10 ran (and its result), and — if the branch has an open PR — its URL.

## Rules

- Never remove a worktree or discard changes without stashing first — uncommitted work always
  survives a take-over.
- Ambiguous identifier resolution always gets `AskUserQuestion`; never guess between candidates.
- The current directory's pre-existing uncommitted changes (step 6) are never auto-reapplied —
  only the taken-over branch's own stash (step 4) is.
- If no agent id can be found for an existing worktree/branch, say so before proceeding — don't
  present a silent, unqualified success.
- Always merge (never rebase/force-push) `origin/main` into the reclaimed branch and push the
  result, so a stale worker-abandoned branch and its PR are brought current as part of the
  handoff. Stop and hand off to the user on conflict instead of resolving it for them.
- A `db-migration` branch always gets `npm run db:schema:apply` run automatically after the
  merge, with the "do not merge before pushing" warning in the report — never silently skip this
  for a labelled branch.
