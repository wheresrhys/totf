---
name: implement-ticket
description: >-
  Implements a specific GitHub issue by number, from scoping through to PR(s). Multi-stack
  tickets (DB + UI) produce multiple PRs; only the final PR closes the issue. Runs relevant
  tests, opens PR(s) with "Closes #<n>", and posts behaviour-change diagrams via the
  mermaid-diff skill. Model- and tree-agnostic — it does not pick a model or manage
  parallelism (that's /swarm's job), so it works standalone on one ticket. Triggers:
  "implement ticket", "/implement-ticket <n>", "implement issue #<n>", or when a subagent
  is delegated a ticket to implement.
---

# implement-ticket

Implement ONE ticket, identified by issue number, in the current working tree. Does not create
worktrees, pick a model, or manage parallelism — `swarm` owns that. Runs fine standalone; the
ticket number is provided as the argument (e.g. `/implement-ticket 312`).

## Precheck

Confirm GitHub Issues are enabled: run `gh issue list` once. If it errors with issues disabled,
stop and tell the user to enable them (`gh repo edit --enable-issues`) before continuing.

## Interactive vs subagent mode

- **Interactive (main thread, user present):** switch to plan mode first, ask the user
  clarifying questions, and implement only once the user has confirmed they are entirely happy
  with the plan.
- **Subagent (no user access):** do not block on questions. Make reasonable assumptions and
  record every assumption in the PR description. If an ambiguity would materially change the
  approach, stop and report back to the caller instead of guessing.

## Steps

### 1. Read the ticket in full

```sh
gh issue view <number> --comments
```

If the ticket has a parent issue, read the parent too (including comments) — parents of tracking
sequences carry shared design decisions, sentence copy, and plan links that the child bodies
assume:

```sh
gh issue view <parent-number> --comments
```

### 2. Understand scope before touching any code

Read the issue body carefully. Identify:

- **Stack layers touched**: database schema / RPC functions / server actions / components /
  pages / tests
- **Ambiguities**: anything the issue doesn't specify (behaviour, edge cases, UI copy, error
  states)
- **Dependencies**: does this require a prior ticket to be merged first? If a hard dependency is
  unmerged, stop and report rather than building on top of it.

In interactive mode, ask the user clarifying questions (via `AskUserQuestion`) for anything that
would materially affect the implementation approach — exact UI layout or copy, reuse vs build
new, edge-case behaviour, whether a DB schema change is needed, priority of sub-features. In
subagent mode, apply the assumption rules above.

### 3. Derive branch name and create it

If the ticket specifies a branch name, use it. Otherwise call
`mcp__swarm-tools__derive_branch_name` with `{issueNumber, title}` (add `chainSuffix` — e.g.
`"1-db"` — for a multi-PR chain per step 4 below) to get `feature/<issue-number>-<slug>`. If it
reports `collision: true`, don't silently reuse the colliding ref — ask/report instead.

Branch from up-to-date `main` unless the ticket says otherwise. Confirm you are NOT on `main`.
Never work on `main`.

### 4. Determine PR strategy

If the ticket spans **multiple stack layers** (e.g. DB schema change + server action + UI
component), split into multiple PRs in dependency order:

| PR | Typical scope | Closes issue? |
|----|--------------|--------------|
| 1  | DB schema / migrations / RPC functions | No |
| 2  | Server actions / data layer | No |
| 3  | UI components / pages + tests | **Yes** (`Closes #<number>`) |

Use branch names like `feature/<number>-<slug>/1-db`, `feature/<number>-<slug>/2-actions`,
`feature/<number>-<slug>/3-ui`.

If the ticket is **self-contained** (UI-only change, pure refactor, one layer of a pre-split
sequence, etc.), one PR is fine and it closes the issue.

In interactive mode, agree the PR strategy with the user before starting if it's non-obvious.

### 5. Implement each increment

For each PR:

1. Follow CLAUDE.md conventions: YAGNI, DRY after 3rd use, consistency over optimal, descriptive
   names.
2. Write tests appropriate to the layer:
   - DB changes → DB integration tests (`supabase/__tests__/`) — use random or
     ticket/branch-specific identifiers (ring numbers, group names, session/location names) for
     any rows the test creates, so concurrent worktree runs against the shared local Supabase
     instance never collide.
   - Server actions → app tests with mocked Supabase client
   - UI → component tests or HTTP tests as appropriate
   - If the ticket enumerates test titles, implement those exactly.
3. Run `npm run qa` before committing. **Do NOT open a PR while tests fail** — fix the code, or
   in subagent mode stop and report back to the caller rather than guessing.
4. Commit using conventional commits (`feat:`, `fix:`, `refactor:`, etc.), with trailer
   `Co-Authored-By: Claude <model> <noreply@anthropic.com>` where `<model>` is the model actually
   executing this ticket (e.g. `Sonnet 5`, `Opus 4.8`, `Fable 5`) — not a fixed model name.
5. Push and open a PR against `main` (or the previous increment's branch if chaining). Include
   the trailer `🤖 Generated with [Claude Code](https://claude.com/claude-code)` in the PR body.
   If the issue carries `db-migration` and/or `e2e-exclusive` (the exclusive-resource label set —
   see CLAUDE.md > Ticket workflow), apply the same label(s) to the PR with `--label`. This lets
   `swarm` read exclusive-resource status directly off `gh pr list --json labels` when deciding
   whether to spawn PR-maintenance work, instead of resolving each PR back to its linked issue.
6. Include in each PR body:
   - If the issue carries `db-migration`: a warning block **at the top**, above everything else:
     > ⚠️ **Database migration — do not merge before pushing.** This PR's schema change must be
     > deployed to prod (`npm run db:migration:push`, run via the `take-over` skill) before this
     > PR is merged. Merging first triggers a Vercel prod deploy of code that expects a schema
     > prod doesn't have yet.
   - If the schema change requires backfilling existing rows to fit the new shape (declarative
     sync only ever emits DDL, never DML, so this can't be generated): hand-write the backfill,
     appended to the end of the generated migration file — after all generated DDL, never
     interleaved with or replacing it — preceded by a literal marker comment line
     `-- Hand-authored data migration (backfill only — appended after schema-apply)`. Write it
     against the schema's *final* constrained shape (the generated DDL already has its
     NOT NULL/CHECK/widened constraints applied in one shot — declarative sync never stages a
     relaxed intermediate shape), not the old drop/relax/reapply dance. Mirror the same DML
     verbatim into a DB integration test as a durable second copy — `supabase/migrations/` is
     gitignored, so a torn-down worktree loses the hand-written file otherwise, and it must be
     reconstructable from this test. Then paste **only the marker-to-EOF block** (not the whole
     migration file) into the PR body under a `## Prod-ready migration SQL` heading:
     `<summary>Data migration — append to the end of the regenerated DDL migration before pushing
     to prod</summary>` followed by a fenced ```sql``` block. This exact marker text and anchor
     format is machine-parsed by `mcp__swarm-tools__resolve_migration_dml` (used by `take-over`)
     — do not vary it.
   - What this increment covers
   - Link to the GitHub issue
   - Any assumptions made (subagent mode)
   - `Closes #<number>` **only in the final PR** — and only if this ticket is the last of its
     parent's sequence when the parent tracks the whole feature; otherwise close the child
     ticket, never the parent.

   For a `db-migration` PR, repeat the same warning verbatim in the result handed back to the
   caller (interactive user or `swarm` orchestrator) — it must surface in `swarm`'s §4 completion
   report, not just sit in the PR body where it's easy to miss.

### 6. Keep the issue open until the final PR

Do **not** add `Closes #<number>` to any PR except the last one in a multi-PR sequence. The issue
tracks the whole piece of work — it stays open until all increments are merged.

### 7. Add behaviour-change diagrams to each PR

Once a PR is open, invoke the **`mermaid-diff`** skill for it (pass the PR number). Since you
have just implemented the change, it draws on this session's context — the code you wrote and
the decisions you made — rather than a cold GitHub read, so the diagrams reflect what actually
shipped. It posts the Mermaid behaviour-change diagram(s) as a PR comment. Do this per PR in a
multi-PR sequence.

## Rules

- One issue per run. Never work on `main`.
- No PR on red tests — fix or report back, never push a failing PR.
- `Closes #<number>` only on the final PR of a sequence; the tracked issue stays open until then.
- mermaid-diff runs once per PR, right after that PR opens — not from a cold GitHub read later.
- A `db-migration` PR always carries the top-of-body "do not merge before pushing" warning, and
  the same warning is always repeated in the result handed back to the caller.
- Commit trailer names the model actually doing the work; PR body carries the Claude Code
  trailer.
- DB integration tests must isolate the rows they write (random/ticket-specific identifiers) —
  tickets can run concurrently in separate worktrees against the same local Supabase instance.
- Keep `CLAUDE.md` up to date if changes affect documented conventions.
- Follow the data-fetching conventions in CLAUDE.md: server actions only,
  `getAuthenticatedSupabaseClient()`, `catchSupabaseErrors()`.
- DB schema changes go in `supabase/schema/`; generate migrations with `npm run db:schema:apply`;
  never hand-write DDL. The one exception is backfill DML (declarative sync can't emit it) —
  hand-write it appended after the generated DDL per the convention in step 5, point 6 above.
- New DB types: run `npm run db:types` after schema changes; never edit
  `types/supabase.types.ts` by hand.
- RLS policies must be considered for any new table or query — check issue #149 for current
  isolation status.
