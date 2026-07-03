---
name: implement-next-test-ticket
description: >
  Finds the next open test ticket (label: tests, parent issue #253) in the
  planned sequence and begins implementation on a fresh branch. Use when the
  user says "implement next test ticket", "work on next test ticket", or
  "/implement-next-test-ticket".
---

## What to do

1. Run `gh issue list --label tests --state open --limit 20 --json number,title,body` to find open test tickets.

2. The test tickets are numbered tests/1 through tests/9 (GitHub issues #254–#262). Exclude the parent issue #253. Pick the **lowest-numbered open issue** from that set (i.e. the one whose title starts with "tests/1:", then "tests/2:", etc.).

3. Read that issue's body in full (`gh issue view <number>`) to understand what needs to be done.

4. Derive a branch name from the issue title. Pattern: `tests/<N>-<slug>` where slug is the part after "tests/N: " lowercased and hyphenated. Examples:
   - "tests/1: Component decomposition" → `tests/1-component-decomposition`
   - "tests/2: Canonical test fixtures + seed script" → `tests/2-canonical-test-fixtures`

5. Confirm you are NOT on `main`. If you are, create and checkout the new branch. Never work directly on `main`.

6. Read the parent issue #253 (`gh issue view 253`) for broader plan context before starting.

7. Implement the ticket fully, following the plan. At the end:
   - Run `npm run qa` to verify no regressions
   - Commit using conventional commits (`test:` type for test additions, `refactor:` for component decomposition)
   - Push the branch and open a PR against `main`, referencing the issue number in the PR body
   - Close the GitHub issue by including `Closes #<number>` in the PR description

## Constraints

- Follow CLAUDE.md: small shippable increments, YAGNI, DRY only at 3rd use, consistency over optimal
- Never work on `main`
- Keep `CLAUDE.md` up to date if the changes affect documented conventions
- For the seed/fixtures ticket: the seed script must work end-to-end before any snapshot JSON is committed
- For component decomposition: no behaviour changes, `npm run qa` must pass before and after
