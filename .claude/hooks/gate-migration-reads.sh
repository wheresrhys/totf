#!/bin/sh
# PreToolUse hook (Read|Grep) — supabase/migrations/ holds 79+ historical
# migrations (~944KB) that are pure noise for almost every task, so they're
# excluded from default context. The migration(s) actually touched by the
# current branch (committed diff against main, or still-uncommitted) stay
# readable automatically — that's the migration a schema-change ticket just
# generated. Anything else is denied (not asked: ticket-workflow subagents
# run non-interactively and can't answer an "ask" prompt) with a reason that
# tells the agent how to get explicit user sign-off instead.

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name')
CWD=$(echo "$INPUT" | jq -r '.cwd // empty')

TARGET=""
case "$TOOL_NAME" in
	Read)
		TARGET=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
		;;
	Grep)
		TARGET=$(echo "$INPUT" | jq -r '.tool_input.path // empty')
		;;
esac

case "$TARGET" in
	*supabase/migrations*) ;;
	*) exit 0 ;;
esac

ROOT=$(git -C "${CWD:-.}" rev-parse --show-toplevel 2>/dev/null) || exit 0
REL=${TARGET#"$ROOT"/}

BASE=$(git -C "$ROOT" merge-base origin/main HEAD 2>/dev/null || git -C "$ROOT" merge-base main HEAD 2>/dev/null || echo "")
CHANGED=""
[ -n "$BASE" ] && CHANGED=$(git -C "$ROOT" diff --name-only "$BASE"...HEAD -- supabase/migrations/ 2>/dev/null)
UNCOMMITTED=$(git -C "$ROOT" status --porcelain -- supabase/migrations/ 2>/dev/null | awk '{print $NF}')

if printf '%s\n%s\n' "$CHANGED" "$UNCOMMITTED" | grep -qxF "$REL"; then
	echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow"}}'
	exit 0
fi

REASON="supabase/migrations/ holds 79+ historical migrations (~944KB) excluded from default context to save tokens — only the migration(s) the current branch actually touches are readable automatically. '$REL' isn't part of this branch. If you genuinely need it (e.g. to understand a past decision this ticket must account for), tell the user which file and why, and ask them to confirm before reading it."

jq -n --arg reason "$REASON" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$reason}}'
