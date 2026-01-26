# Cleanup Execute

Execute cleanup actions on the repository. This command should typically be run after `/cleanup-check` to understand what needs cleaning.

## Instructions

### Step 1: Verify Context

Check if a recent cleanup check was performed:

```bash
tail -1 .claude/cleanup-log.jsonl 2>/dev/null
```

If the last entry is a "check" type from within the last hour, use its findings. Otherwise, warn the user that running `/cleanup-check` first is recommended, but allow proceeding if they confirm.

### Step 2: Re-gather Current State

Even with recent check data, re-gather live state to ensure accuracy:

**Uncommitted changes:**
```bash
git status --porcelain
```

**Stashed changes with dates:**
```bash
git stash list --format='%gd|%s|%ci'
```

**Working trees:**
```bash
git worktree list
```

**Branch age data:**
```bash
git for-each-ref --sort=-committerdate refs/heads/ --format='%(refname:short)|%(committerdate:relative)|%(upstream:track)'
```

**Merged branches (safe to delete):**
```bash
git branch --merged main | grep -v '^\*' | grep -v 'main' | grep -v 'master'
```

### Step 3: Identify Safe Cleanup Actions

Categorize actions by safety level:

**Safe (auto-confirmable):**
- Delete branches that are merged into main
- Prune worktree references (`git worktree prune`)
- Remove worktrees for merged/deleted branches

**Requires Confirmation:**
- Delete unmerged local branches
- Drop stashes
- Remove worktrees with uncommitted changes

**Never Auto-execute:**
- Any command affecting uncommitted changes in main worktree
- Force deletes (`git branch -D`)
- `git clean` commands
- `git reset` commands

### Step 4: Present Action Plan

Show the user what will be done:

```markdown
## Cleanup Actions

### Safe Actions (will execute automatically)
1. Prune orphaned worktree references
2. Delete merged branch: `feature/xyz` (merged 3 days ago)
3. Delete merged branch: `fix/abc` (merged 1 week ago)

### Actions Requiring Confirmation
1. Delete unmerged branch: `experiment/foo` (90 days old, no PR)
2. Drop stash: `stash@{2}` - "WIP on main" (45 days old)
3. Remove worktree: `/tmp/session-pr-xxx` (branch deleted)

### Skipped (manual action needed)
1. Uncommitted changes in working directory - commit or stash first
2. Branch `important-wip` has unpushed commits - push or confirm abandon
```

### Step 5: Get User Approval

Use `AskUserQuestion` to ask:

1. **Execute all safe + confirmed actions** - Run safe actions automatically, confirm each risky action
2. **Execute only safe actions** - Skip anything requiring confirmation
3. **Interactive mode** - Confirm each action individually
4. **Abort** - Don't execute anything

### Step 6: Execute Safe Actions

Run these without individual confirmation:

**Prune worktree references:**
```bash
git worktree prune
```

**Delete merged branches:**
```bash
git branch -d <branch-name>
```

Note: `-d` (lowercase) only deletes if merged, so this is safe.

### Step 7: Execute Confirmed Actions

For each action requiring confirmation (if user chose to include them):

**Delete unmerged branch:**
```bash
# Show what would be lost
git log main..<branch> --oneline

# If user confirms
git branch -D <branch-name>
```

**Drop stash:**
```bash
# Show stash contents
git stash show -p stash@{N}

# If user confirms
git stash drop stash@{N}
```

**Remove worktree:**
```bash
# Check for uncommitted changes
git -C <worktree-path> status --porcelain

# If clean or user confirms
git worktree remove <worktree-path> --force
```

### Step 8: Handle Failures

If any action fails:
- Log the failure
- Show the error to the user
- Continue with remaining actions (don't abort entirely)
- Summarize failures at the end

### Step 9: Record Results

Append execution results to `.claude/cleanup-log.jsonl`:

```json
{
  "timestamp": "[ISO timestamp]",
  "type": "execute",
  "actions_planned": N,
  "actions_executed": N,
  "actions_skipped": N,
  "actions_failed": N,
  "details": {
    "branches_deleted": ["branch1", "branch2"],
    "stashes_dropped": [0, 2],
    "worktrees_removed": ["/tmp/xyz"],
    "failures": ["error message if any"]
  },
  "notes": "[user-provided or auto-generated summary]"
}
```

### Step 10: Present Summary

```markdown
## Cleanup Complete

### Actions Taken
- Deleted N merged branches
- Dropped N stashes
- Removed N worktrees
- Pruned worktree references

### Skipped
- N actions skipped by user choice
- N actions skipped due to safety concerns

### Failures
- [Any failures with error messages]

### Current State
[Run `git status --short` and show result]

### Remaining Recommendations
[List any high-priority items that weren't addressed]
```

### Step 11: Offer Follow-up

Use `AskUserQuestion` to offer:

1. **Run cleanup check again** - Verify everything is clean
2. **Add notes about remaining items** - Record why certain items were skipped
3. **Done** - End the cleanup session

## Safety Rules

**NEVER execute without explicit confirmation:**
- `git branch -D` (force delete)
- `git stash drop` (without showing contents first)
- `git clean -fd` or similar
- `git reset --hard`
- Any command that could lose uncommitted work

**ALWAYS show before deleting:**
- Branch: show `git log main..<branch> --oneline`
- Stash: show `git stash show -p stash@{N}`
- Worktree: show `git -C <path> status`

**Abort conditions:**
- If uncommitted changes exist in main worktree and user tries to run risky commands
- If a branch has unpushed commits and no remote tracking

## Error Handling

**Branch delete fails:**
```
error: The branch 'x' is not fully merged.
```
This means `-d` correctly refused. Offer `-D` with explicit warning.

**Worktree remove fails:**
```
fatal: '<path>' contains modified or untracked files
```
Show the files, ask user if they want to force remove.

**Stash drop fails:**
Stash index may have shifted. Re-list stashes and retry.

## Key Principles

- **Explicit consent** - User must approve before any destructive action
- **Show before delete** - Always display what will be lost
- **Fail safely** - Errors in one action don't stop others
- **Audit trail** - Log everything for future reference
- **Recoverable focus** - Prefer actions that can be undone (merged branches can be recreated from main)
