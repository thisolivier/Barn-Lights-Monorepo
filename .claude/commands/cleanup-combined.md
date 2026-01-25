# Cleanup Combined

Combined cleanup workflow: analyze repository state and execute cleanup actions in one flow.

This command runs `/cleanup-check` followed by `/cleanup-execute`, providing a complete cleanup experience.

**Important:** The user MUST be shown and approve the specific actions before any execution occurs.

## Instructions

### Phase 1: Analysis (from cleanup-check)

#### Step 1.1: Check Prerequisites

```bash
git rev-parse --git-dir && which gh
```

#### Step 1.2: Gather Repository State

Run all state-gathering commands:

```bash
# Uncommitted changes
git status --porcelain

# Stashes with dates
git stash list --format='%gd|%s|%ci'

# Working trees
git worktree list

# Branches with tracking info
git branch -vv --no-color

# Untracked directories
git ls-files --others --directory --exclude-standard | head -20
```

#### Step 1.3: Analyze Branch Age

```bash
git for-each-ref --sort=-committerdate refs/heads/ --format='%(refname:short)|%(committerdate:relative)|%(committerdate:iso8601)|%(upstream:track)'
```

Categorize:
- **Active** (<7 days)
- **Recent** (<30 days)
- **Stale** (>30 days)
- **Ancient** (>90 days)

#### Step 1.4: Query Episodic Memory

```bash
node cli/episodic-memory search "cleanup" --limit 5 2>/dev/null || true
node cli/episodic-memory search "work in progress" --limit 5 2>/dev/null || true
node cli/episodic-memory search "WIP" --limit 3 2>/dev/null || true
```

Use any returned context to inform recommendations.

#### Step 1.5: Read Previous Cleanup Notes

```bash
cat .claude/cleanup-log.jsonl 2>/dev/null | tail -10
```

#### Step 1.6: Check GitHub PRs

```bash
# Open PRs
gh pr list --state open --json number,title,headRefName,updatedAt,isDraft --limit 10

# Recently merged (for orphaned branch detection)
gh pr list --state merged --json number,title,headRefName,mergedAt --limit 10

# Recently closed
gh pr list --state closed --json number,title,headRefName,closedAt --limit 5
```

#### Step 1.7: Identify Merged Branches

```bash
git branch --merged main | grep -v '^\*' | grep -v 'main' | grep -v 'master'
```

#### Step 1.8: Present Analysis Report

Display the full cleanup report:

```markdown
## Repository Cleanup Report

### Current State
| Metric | Count |
|--------|-------|
| Uncommitted files | N |
| Stashes | N |
| Worktrees | N |
| Open PRs | N |

### Branch Age Analysis
| Category | Count | Branches |
|----------|-------|----------|
| Active (<7d) | N | ... |
| Recent (<30d) | N | ... |
| Stale (>30d) | N | ... |
| Ancient (>90d) | N | ... |

### Merged Branches (safe to delete)
- branch1 (merged N days ago)
- branch2 (merged N days ago)

### Context
[From episodic memory and previous logs]

### Recommendations Summary
- High priority: N items
- Medium priority: N items
- Low priority: N items
```

---

### Phase 2: Present Action Plan

**CRITICAL: Before any execution, present the complete action plan to the user.**

Based on the analysis, categorize and display all planned actions:

```markdown
## Proposed Cleanup Actions

### Safe Actions (will execute automatically if approved)
These actions are reversible or only affect fully-merged content:
- [ ] `git worktree prune` - Clean orphaned worktree references
- [ ] `git branch -d feature/xyz` - Delete merged branch (merged 3 days ago)
- [ ] `git branch -d fix/abc` - Delete merged branch (merged 1 week ago)

### Actions Requiring Individual Confirmation
These actions may result in data loss and will prompt before each:
- [ ] Delete unmerged branch `experiment/foo` (90 days old, 3 commits not in main)
- [ ] Drop stash@{2}: "WIP on main" (45 days old)
- [ ] Remove worktree `/tmp/session-xyz` (branch deleted, may have uncommitted changes)

### Skipped (manual action needed)
These items won't be touched:
- Uncommitted changes in working directory (N files)
- Branch `important-wip` has unpushed commits
```

**Show specific details for each action:**
- For branch deletions: list the commits that would be lost (`git log main..<branch> --oneline`)
- For stashes: show a summary of changes (`git stash show stash@{N}`)
- For worktrees: show their status (`git -C <path> status --short`)

### Phase 2.5: Get User Approval

Use `AskUserQuestion` to confirm:

1. **Execute all actions** - Run safe actions automatically, confirm each risky action individually
2. **Execute safe actions only** - Only delete merged branches and prune worktrees
3. **Add notes and exit** - Record observations without taking action
4. **Exit without action** - Stop here

If user chooses to exit, record the check in the log and stop.

---

### Phase 3: Execution (from cleanup-execute)

#### Step 3.1: Categorize Actions

**Safe (auto-execute):**
- `git worktree prune`
- `git branch -d <merged-branch>` for each merged branch

**Requires Confirmation:**
- Delete unmerged stale/ancient branches
- Drop old stashes
- Remove worktrees with potential uncommitted work

#### Step 3.2: Execute Safe Actions

```bash
# Prune worktree references
git worktree prune

# Delete merged branches (one at a time, log each)
git branch -d <branch>
```

#### Step 3.3: Execute Confirmed Actions

For each action requiring confirmation, use `AskUserQuestion`:

**Branch deletion:**
```markdown
Delete branch `experiment/old-idea`?
- Last commit: 95 days ago
- Commits not in main: 3
- No associated PR found

[Show commits with: git log main..experiment/old-idea --oneline]
```

Options:
1. Delete this branch
2. Skip this branch
3. Skip all remaining confirmations

**Stash deletion:**
```markdown
Drop stash@{2}?
- Created: 45 days ago
- Message: "WIP on feature-x"

[Show contents summary]
```

#### Step 3.4: Record Results

Log to `.claude/cleanup-log.jsonl`:

```json
{
  "timestamp": "[ISO]",
  "type": "cleanup",
  "phase": "combined",
  "analysis": {
    "uncommitted": N,
    "stashes": N,
    "stale_branches": N,
    "ancient_branches": N
  },
  "execution": {
    "branches_deleted": ["list"],
    "stashes_dropped": [N],
    "worktrees_removed": ["list"],
    "skipped": N,
    "failed": N
  },
  "notes": "[summary]"
}
```

#### Step 3.5: Present Final Summary

```markdown
## Cleanup Complete

### Actions Taken
- Pruned worktree references
- Deleted N branches: branch1, branch2, ...
- Dropped N stashes
- Removed N worktrees

### Skipped
- N items skipped by user choice
- Uncommitted changes preserved

### Repository State After Cleanup
[git status --short output]

### Remaining Items
[Any high-priority items not addressed]
```

---

## Quick Mode

If the user invokes with `--quick` or says "quick cleanup":
- Skip episodic memory queries
- Skip GitHub PR checks
- Only perform safe actions (merged branches, worktree prune)
- Don't ask for confirmations on safe actions
- Still log results

---

## Safety Guarantees

This combined command inherits all safety rules:

1. **Never loses uncommitted work** - Won't touch working directory changes
2. **Never force-deletes without consent** - `git branch -D` requires explicit approval
3. **Shows before deleting** - Always displays what will be lost
4. **Logged** - Every action is recorded in cleanup-log.jsonl
5. **Interruptible** - User can exit at the decision point

---

## Error Handling

- GitHub unavailable: Continue with local-only analysis
- Episodic memory unavailable: Continue without context enrichment
- Branch delete fails: Log and continue with other actions
- Any critical failure: Stop, show error, ensure state is consistent

## Key Principles

- **Complete workflow** - From analysis to action in one command
- **User in control** - Clear decision point between analysis and execution
- **Context-aware** - Uses all available sources (git, GitHub, episodic memory, logs)
- **Safe by default** - Aggressive cleanup requires explicit opt-in
- **Traceable** - Full audit trail in cleanup-log.jsonl
