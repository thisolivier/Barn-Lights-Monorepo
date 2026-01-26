---
description: Check for orphaned worktrees and stale branches
allowed-tools: Bash(git:*), Bash(gh:*)
---

Analyze the repository for cleanup opportunities. This is read-only - no modifications.

## Step 1: Gather State

Run these commands to assess current state:

```bash
# Working trees
git worktree list

# All branches with age info
git for-each-ref --sort=-committerdate refs/heads/ --format='%(refname:short)|%(committerdate:relative)'

# Branches merged into main
git branch --merged main | grep -v '^\*' | grep -v 'main' | grep -v 'master'

# Local branches not tracking remote
git branch -vv --no-color | grep -v '\[origin/' | grep -v '^\*'
```

## Step 2: Check GitHub PR Status

If gh CLI is available, check PR status for branches:

```bash
gh pr list --state merged --json headRefName --limit 20
gh pr list --state closed --json headRefName --limit 10
```

## Step 3: Identify Cleanup Candidates

From the gathered data, identify:

1. **Orphaned worktrees** - Worktrees whose branches no longer exist or are merged
2. **Merged branches** - Local branches already merged into main
3. **Stale branches** - Branches with no commits in 30+ days and no open PR
4. **Branches with merged/closed PRs** - Local branches whose PRs are done

## Step 4: Present Report

Output a simple summary:

```
## Cleanup Report

### Orphaned Worktrees
- [path] - [reason]

### Branches Safe to Delete (merged)
- [branch] - merged [when]

### Stale Branches (30+ days, no PR)
- [branch] - last commit [when]

### Branches with Closed PRs
- [branch] - PR #[n] [merged/closed]

Run /cleanup to remove these items with confirmation.
```
