---
name: next-ticket
description: >
  Finds the oldest open GitHub issue labelled 'ready' and begins implementation
  on a fresh branch. Feature-oriented: asks clarifying questions before coding.
  Multi-stack tickets (DB + UI) produce multiple PRs; only the final PR closes
  the issue. Use when the user says "next ticket", "work on next ticket", or
  "/next-ticket".
---

## What to do

### 1. Find the ticket

```sh
gh issue list --label ready --state open --limit 50 --json number,title,createdAt | \
  jq 'sort_by(.createdAt) | .[0]'
```

Pick the **oldest** open issue (lowest `createdAt`). Read it in full:

```sh
gh issue view <number>
```

### 2. Understand scope before touching any code

Read the issue body carefully. Identify:

- **Stack layers touched**: database schema / RPC functions / server actions / components / pages / tests
- **Ambiguities**: anything the issue doesn't specify (behaviour, edge cases, UI copy, error states)
- **Dependencies**: does this require a prior ticket to be merged first?

**Ask the user clarifying questions** (via `AskUserQuestion`) for anything that would materially affect the implementation approach. Feature tickets are more open-ended than test tickets — err heavily toward asking rather than assuming. Typical things to clarify:
- Exact UI layout or copy
- Whether to reuse an existing component vs. build new
- Edge-case behaviour (empty states, errors, loading)
- Whether a DB schema change is needed or if existing tables cover it
- Priority of sub-features if the issue describes multiple things

Do **not** start implementation until questions are answered (or the user says to proceed).

### 3. Derive branch name and create it

Pattern: `feature/<issue-number>-<slug>` where slug is the issue title lowercased, spaces → hyphens, punctuation dropped. Truncate slug to ~5 words.

Example: issue #87 "Add species breakdown chart to session page" → `feature/87-species-breakdown-chart`

Confirm you are NOT on `main`. Create and checkout the branch. Never work on `main`.

### 4. Determine PR strategy

If the ticket spans **multiple stack layers** (e.g. DB schema change + server action + UI component), split into multiple PRs in dependency order:

| PR | Typical scope | Closes issue? |
|----|--------------|--------------|
| 1  | DB schema / migrations / RPC functions | No |
| 2  | Server actions / data layer | No |
| 3  | UI components / pages + tests | **Yes** (`Closes #<number>`) |

Use branch names like `feature/<number>-<slug>/1-db`, `feature/<number>-<slug>/2-actions`, `feature/<number>-<slug>/3-ui`.

If the ticket is **self-contained** (UI-only change, pure refactor, etc.), one PR is fine and it closes the issue.

Agree the PR strategy with the user before starting if it's non-obvious.

### 5. Implement each increment

For each PR:

1. Follow CLAUDE.md conventions: YAGNI, DRY after 3rd use, consistency over optimal, descriptive names.
2. Write tests appropriate to the layer:
   - DB changes → DB integration tests (`supabase/__tests__/`)
   - Server actions → app tests with mocked Supabase client
   - UI → component tests or HTTP tests as appropriate
3. Run `npm run qa` before committing. Fix any failures.
4. Commit using conventional commits (`feat:`, `fix:`, `refactor:`, etc.).
5. Push and open a PR against `main` (or the previous increment's branch if chaining).
6. Include in each PR body:
   - What this increment covers
   - Link to the GitHub issue
   - `Closes #<number>` **only in the final PR**

### 6. Keep the issue open until the final PR

Do **not** add `Closes #<number>` to any PR except the last one in a multi-PR sequence. The issue tracks the whole feature — it stays open until all increments are merged.

## Constraints

- Never work on `main`
- Keep `CLAUDE.md` up to date if changes affect documented conventions
- Follow the data-fetching conventions in CLAUDE.md: server actions only, `getAuthenticatedSupabaseClient()`, `catchSupabaseErrors()`
- DB schema changes go in `supabase/schema/`; generate migrations with `npm run db:schema:apply`; never hand-write migrations
- New DB types: run `npm run db:types` after schema changes; never edit `types/supabase.types.ts` by hand
- RLS policies must be considered for any new table or query — check issue #149 for current isolation status
