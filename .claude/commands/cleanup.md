---
description: Clean up orphaned worktrees and stale branches
allowed-tools: Bash(git:*), Bash(gh:*)
argument-hint: [--dry-run]
---

Clean up orphaned worktrees and stale branches from the repository.

If $ARGUMENTS contains "--dry-run", only show what would be cleaned without executing.

## Step 1: Identify Cleanup Targets

Gather current state:

```bash
git worktree list
git branch --merged main | grep -v '^\*' | grep -v 'main' | grep -v 'master'
git for-each-ref --sort=-committerdate refs/heads/ --format='%(refname:short)|%(committerdate:relative)'
```

Check for unstaged files in the current branch that may need tidying:

```bash
git status --porcelain
```

If there are unstaged changes, note them for the user in the cleanup plan.

Check GitHub for closed PRs:

```bash
gh pr list --state merged --json headRefName --limit 20 2>/dev/null || echo "gh unavailable"
gh pr list --state closed --json headRefName --limit 10 2>/dev/null || true
```

## Step 2: Categorize Items

**Safe to remove (merged into main):**
- Branches from `git branch --merged main`
- Worktrees for those branches

**Requires confirmation (not merged):**
- Worktrees for deleted branches
- Stale branches (30+ days) with closed PRs
- Branches not tracking any remote

## Step 3: Present Plan

Show the user what will be cleaned:

```
## Cleanup Plan

### Unstaged Changes (tidy these first?)
- [list any unstaged files from git status]

### Will Remove Automatically
- [merged branches]
- [orphaned worktree references via git worktree prune]

### Requires Your Approval
- [unmerged items with reason]
```

If --dry-run was specified, stop here.

## Step 4: Get Approval

Ask the user to confirm before proceeding. Options:
1. Clean all (safe + confirmed items)
2. Clean safe items only
3. Cancel

## Step 5: Execute Cleanup

**Safe operations (no confirmation needed):**

```bash
git worktree prune
git branch -d <merged-branch>  # -d is safe, only deletes if merged
```

**Operations requiring confirmation:**

For each unmerged branch the user approved:
```bash
git branch -D <branch>
```

For each worktree with potential changes:
```bash
git worktree remove <path> --force
```

## Step 6: Report Results

Show what was cleaned:

```
## Cleanup Complete

Removed:
- N branches deleted
- N worktrees removed

Skipped:
- [items user declined or that failed]
```

## Safety Rules

- Never delete the current branch
- Never delete main/master
- Use `git branch -d` (safe) for merged branches
- Use `git branch -D` (force) only with explicit user approval
- Always run `git worktree prune` before removing worktrees
