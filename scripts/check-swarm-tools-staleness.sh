#!/bin/sh
set -e

# Every git worktree of this repo shares one common .git dir, so a branch cut before an infra
# fix lands on .claude/mcp/swarm-tools keeps re-running the unpatched code (and re-corrupting the
# shared .claude/swarm-state.json) every time its test suite runs through this hook — see issue
# #485. Auto-merge origin/main before running tests when the branch is behind on that path.

CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$CURRENT_BRANCH" = "main" ]; then
	exit 0
fi

MERGE_BASE=$(git merge-base HEAD origin/main)
STALE=$(git diff --name-only "$MERGE_BASE" origin/main -- .claude/mcp/swarm-tools/)

if [ -z "$STALE" ]; then
	exit 0
fi

echo "check-swarm-tools-staleness: branch is behind origin/main on .claude/mcp/swarm-tools/** — auto-merging origin/main before running tests"

if ! git merge origin/main -m "Merge origin/main: pick up swarm-tools fixes before push"; then
	git merge --abort
	echo "check-swarm-tools-staleness: auto-merge failed (conflicts) — resolve manually with 'git merge origin/main' and retry push" >&2
	exit 1
fi

echo "check-swarm-tools-staleness: merged origin/main successfully"
