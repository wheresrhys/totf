---
name: next-ticket
description: >
  Finds the oldest open GitHub issue labelled 'ready' (descending into ready
  child tickets of tracking issues), reads its model label (sonnet/opus/fable),
  and spawns a subagent on that model to implement it via the implement-ticket
  skill. Use when the user says "next ticket", "work on next ticket", or
  "/next-ticket".
---

## What to do

This skill only **chooses** the ticket and model, then delegates. The implementation workflow (scoping, branching, PR strategy, tests) lives in the `implement-ticket` skill.

### 1. Find the ticket

```sh
gh issue list --label ready --state open --limit 50 --json number,title,createdAt | \
  jq 'sort_by(.createdAt) | .[0]'
```

Pick the **oldest** open issue (lowest `createdAt`).

Then check whether it has open child (sub-)issues labelled `ready`:

```sh
gh api repos/{owner}/{repo}/issues/<number>/sub_issues \
  --jq '[.[] | select(.state == "open" and (.labels | map(.name) | contains(["ready"])))] | .[0].number'
```

If it does, the parent issue is a tracking issue: **pick the first such child instead** (sub-issues are returned in their planned order). Recurse — if that child also has ready children, descend again. The parent stays open until all children are done.

### 2. Read the model label

```sh
gh issue view <number> --json labels --jq '[.labels[].name] | map(select(. == "sonnet" or . == "opus" or . == "fable")) | .[0]'
```

- Exactly one of `sonnet` / `opus` / `fable` → use it as the subagent model.
- No model label (or several) → default to `sonnet` and tell the user which ticket lacked a label so they can fix it.

### 3. Spawn the implementation subagent

Use the Agent tool with:

- `subagent_type`: `general-purpose`
- `model`: the label from step 2
- `prompt`: instruct the subagent to invoke the Skill tool with `skill: implement-ticket` and `args: <ticket number>`, follow that skill completely, and finish with a report of: branch names, PR URLs, test results, and any assumptions it made.

Tell the user which ticket and model were chosen before spawning.

### 4. Relay the result

The subagent's final message is not shown to the user — relay its report (PR links, test outcomes, assumptions, anything left undone). For follow-up work on the same ticket, continue the same subagent via SendMessage rather than spawning a fresh one.
