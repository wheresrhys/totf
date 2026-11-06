# Agentic tooling — Claude context

Scoped doc for `.claude/` (skills, MCP server, hooks, settings). See the root
[`CLAUDE.md`](../CLAUDE.md) for app overview, tech stack, and cross-zone shared code; its
["Repo zones"](../CLAUDE.md#repo-zones) table lists every other zone and its scoped doc
([`supabase/CLAUDE.md`](../supabase/CLAUDE.md), [`app/CLAUDE.md`](../app/CLAUDE.md), and one per
`modules/<name>/`).

## Ticket workflow

Tickets are created with the `flesh-out-ticket` skill (single task) or `ticketify` skill (a task
list, or a single large task it decomposes first, one issue per task, reusing `flesh-out-ticket`
per ticket) and implemented
with the `implement-ticket` skill. `swarm` picks up open `ready` tickets and open PRs needing
maintenance and runs them in parallel, one git worktree + subagent per unit of work.

When creating a ticket, add exactly one model label reflecting implementation complexity — the
subagent implementing it runs on that model:

- `sonnet` — small, precisely specified, low-risk changes
- `opus` — fiddly or multi-constraint work (complex SQL, seed-data churn, interacting rules)
- `fable` — complex or foundational work that sets patterns others build on

This repo has a single shared local Supabase instance, so any ticket that will mutate it gets an
**exclusive-resource label**, and `swarm` runs any exclusive-resource-labelled unit of work
completely solo — no other worker (maintenance or ticket) runs concurrently with it — since
concurrent worktrees doing either kind of mutation would otherwise collide:
- `db-migration` — touches `supabase/schema/` (schema migrations or DB integration tests). See
  `supabase/CLAUDE.md`'s "Workflow for schema changes" for the migration-generation step this
  label exists to protect.
- `e2e-exclusive` — touches a path listed in `e2e/mutating-spec-triggers.json` (an E2E spec
  tagged `@mutates`). See `supabase/CLAUDE.md`'s "E2E `@mutates` / exclusive-resource mechanics"
  for the full selection/trigger logic this label plugs into.

Every ticket also gets one or more **zone labels**, drawn from the canonical zone table in the root
[`CLAUDE.md`](../CLAUDE.md#repo-zones) — never a list restated here (multi-label only when the
ticket genuinely spans more than one zone). A ticket whose work is confined to a single
`modules/<name>/` directory gets that module's own `zone:modules/<name>` label rather than the
broader `zone:app`/`zone:supabase` label of whatever consumes it; see the "narrowest zone wins"
rule alongside that table. `flesh-out-ticket` and `ticketify` always add these at creation;
`implement-ticket` reads a single-zone label back off the issue to scope its own investigation to
that zone's subtree by default, and `swarm` passes the same instruction into a ticket worker's
spawn prompt when `swarm_plan_batch` surfaces exactly one `zone:*` label for it — a default that
narrows context loaded for a single-zone task, not a hard boundary either skill enforces. Module
zone labels are treated exactly like top-level ones throughout: a lone `zone:modules/ui-kit`
scopes a worker to `modules/ui-kit/` the same way a lone `zone:app` scopes it to `app/`.

### MCP tools for skills

The ticket-workflow skills above call a project-local MCP server (`.claude/mcp/swarm-tools/`,
registered in `.mcp.json`) instead of hand-rolling `jq`/`gh api`/anchor-text-parsing pipelines,
wherever a pattern is multi-step, state-mutating, or repeats across skills. Tools land
incrementally; current inventory:

| Tool | Purpose |
|---|---|
| `swarm_tools_ping` | Health check — confirms the server is reachable |
| `swarm_state_append` / `_remove` / `_list` | Read/mutate `.claude/swarm-state.json` (locked, atomic — never hand-write it) |
| `swarm_state_release_db_lock` | Let an exclusive-resource worker release the shared-local-Postgres lock early (by `agentId`), once its migration/`@mutates` work is applied and verified and only push/PR steps remain — other non-exclusive tickets can then start, while a *new* exclusive-resource worker still waits for it to finish. One-way |
| `swarm_plan_batch` | Pre-filtered, pre-ranked PR-maintenance + ready-ticket lists for `swarm` |
| `swarm_triage_pr` | One PR's full maintenance picture: conflict status plus the *content* of every outstanding review, inline-comment thread and top-level issue comment, filtered through the same bot/mermaid-diff/`swarm-worker-reply`-marker/head-commit-date rules `swarm_plan_batch` uses for its yes/no decision, plus the same `reason` vocabulary (`conflict` \| `feedback` \| `conflict+feedback` \| `none`). Saves a maintenance worker re-deriving all of it from raw `gh api` responses. Not gated on the `<!-- swarm-created-pr -->` marker — naming a PR here is the user-directed path that gate exempts |
| `derive_branch_name` | Ticket branch naming (wraps `lib/slugify.ts`) + collision check |
| `create_ticket` | `gh issue create` with labels + sub-issue linking, no shell-escaping/tempfile dance |
| `link_ticket_dependencies` | Apply GitHub blocked-by links to an issue (one comma-joined `gh issue edit --add-blocked-by` call) — ticketify's dependency wiring |
| `ensure_local_migrations_applied` | Catch a worktree's shared local Postgres up to the committed `supabase/migrations/` before DB-dependent work — fast-paths off a locked `.claude/swarm-migration-state.json` marker, only running `npx supabase migration up --local` when the marker is behind (#863). Called by `swarm` on every worktree spawn. |
| `ensure_worktree_env` | Copy `.env.dev` from the main checkout root into a worktree, no-clobber — `.env.dev` is gitignored so a freshly created worktree never has it, causing `npm run qa`/the pre-push hook to fail with `SUPABASE_JWT_ROLE environment variable is not set`. Called by `swarm` on every worktree spawn, replacing what used to be manual `cp` prose a worker could skip or botch. |

Use these tools for anything that touches `.claude/swarm-state.json`, creates a GitHub issue,
derives a branch name, or extracts backfill DML — never reimplement the `jq`/glob/anchor-text
equivalent in Bash. Raw `git`/`gh` Bash calls remain fine for simple one-off reads (`gh issue
view <n> --comments`, `git fetch`, `git merge origin/main`) that aren't multi-step or
state-mutating.

## Hooks

`.claude/hooks/gate-migration-reads.sh` — a `PreToolUse` hook (wired in `.claude/settings.json`)
that denies `Read`/`Grep` on `supabase/migrations/*.sql` files outside the current branch's diff.
See `supabase/CLAUDE.md`'s "Workflow for schema changes" for why (79+ historical migrations are
pure noise for almost any single task) and what it means for schema-change tickets in practice.
