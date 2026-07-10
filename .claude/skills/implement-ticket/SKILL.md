---
name: implement-ticket
description: >
  Implements a specific GitHub issue by number, from scoping through to PR(s).
  Multi-stack tickets (DB + UI) produce multiple PRs; only the final PR closes
  the issue. Use when the user says "/implement-ticket <number>" or "implement
  ticket <number>", or when a subagent is delegated a ticket to implement.
---

The ticket number is provided as the argument (e.g. `/implement-ticket 312`).

## Interactive vs subagent mode

- **Interactive (main thread, user present):** switch to plan mode first, ask the user clarifying questions, and implement only once the user has confirmed they are entirely happy with the plan.
- **Subagent (no user access):** do not block on questions. Make reasonable assumptions and record every assumption in the PR description. If an ambiguity would materially change the approach, stop and report back to the caller instead of guessing.

## What to do

### 1. Read the ticket in full

```sh
gh issue view <number> --comments
```

If the ticket has a parent issue, read the parent too (including comments) — parents of tracking sequences carry shared design decisions, sentence copy, and plan links that the child bodies assume:

```sh
gh issue view <parent-number> --comments
```

### 2. Understand scope before touching any code

Read the issue body carefully. Identify:

- **Stack layers touched**: database schema / RPC functions / server actions / components / pages / tests
- **Ambiguities**: anything the issue doesn't specify (behaviour, edge cases, UI copy, error states)
- **Dependencies**: does this require a prior ticket to be merged first? If a hard dependency is unmerged, stop and report rather than building on top of it.

In interactive mode, ask the user clarifying questions (via `AskUserQuestion`) for anything that would materially affect the implementation approach — exact UI layout or copy, reuse vs build new, edge-case behaviour, whether a DB schema change is needed, priority of sub-features. In subagent mode, apply the assumption rules above.

### 3. Derive branch name and create it

If the ticket specifies a branch name, use it. Otherwise: `feature/<issue-number>-<slug>` where slug is the issue title lowercased, spaces → hyphens, punctuation dropped, truncated to ~5 words.

Example: issue #87 "Add species breakdown chart to session page" → `feature/87-species-breakdown-chart`

Branch from up-to-date `main` unless the ticket says otherwise. Confirm you are NOT on `main`. Never work on `main`.

### 4. Determine PR strategy

If the ticket spans **multiple stack layers** (e.g. DB schema change + server action + UI component), split into multiple PRs in dependency order:

| PR | Typical scope | Closes issue? |
|----|--------------|--------------|
| 1  | DB schema / migrations / RPC functions | No |
| 2  | Server actions / data layer | No |
| 3  | UI components / pages + tests | **Yes** (`Closes #<number>`) |

Use branch names like `feature/<number>-<slug>/1-db`, `feature/<number>-<slug>/2-actions`, `feature/<number>-<slug>/3-ui`.

If the ticket is **self-contained** (UI-only change, pure refactor, one layer of a pre-split sequence, etc.), one PR is fine and it closes the issue.

In interactive mode, agree the PR strategy with the user before starting if it's non-obvious.

### 5. Implement each increment

For each PR:

1. Follow CLAUDE.md conventions: YAGNI, DRY after 3rd use, consistency over optimal, descriptive names.
2. Write tests appropriate to the layer:
   - DB changes → DB integration tests (`supabase/__tests__/`)
   - Server actions → app tests with mocked Supabase client
   - UI → component tests or HTTP tests as appropriate
   - If the ticket enumerates test titles, implement those exactly.
3. Run `npm run qa` before committing. Fix any failures.
4. Commit using conventional commits (`feat:`, `fix:`, `refactor:`, etc.).
5. Push and open a PR against `main` (or the previous increment's branch if chaining).
6. Include in each PR body:
   - What this increment covers
   - Link to the GitHub issue
   - Any assumptions made (subagent mode)
   - `Closes #<number>` **only in the final PR** — and only if this ticket is the last of its parent's sequence when the parent tracks the whole feature; otherwise close the child ticket, never the parent.

### 6. Keep the issue open until the final PR

Do **not** add `Closes #<number>` to any PR except the last one in a multi-PR sequence. The issue tracks the whole piece of work — it stays open until all increments are merged.

## Constraints

- Never work on `main`
- Keep `CLAUDE.md` up to date if changes affect documented conventions
- Follow the data-fetching conventions in CLAUDE.md: server actions only, `getAuthenticatedSupabaseClient()`, `catchSupabaseErrors()`
- DB schema changes go in `supabase/schema/`; generate migrations with `npm run db:schema:apply`; never hand-write migrations
- New DB types: run `npm run db:types` after schema changes; never edit `types/supabase.types.ts` by hand
- RLS policies must be considered for any new table or query — check issue #149 for current isolation status
