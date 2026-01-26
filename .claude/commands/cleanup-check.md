# Cleanup Check

Analyze the repository state and surface cleanup opportunities. This is a read-only analysis that recommends actions without executing them.

## Instructions

### Step 1: Check Prerequisites

Verify git and gh CLI are available:

```bash
git rev-parse --git-dir && which gh
```

If git fails, stop. If gh fails, note that GitHub context will be unavailable but continue.

### Step 2: Gather Repository State

Run these commands to assess the current state:

**Uncommitted changes:**
```bash
git status --porcelain
```

**Stashed changes:**
```bash
git stash list
```

**Working trees:**
```bash
git worktree list
```

**Branches with unpushed commits:**
```bash
git branch -vv --no-color | grep -E '\[.*: ahead' || echo "None"
```

**Local branches not on remote:**
```bash
git branch -vv --no-color | grep -v '\[origin/' | grep -v '^\*' || echo "None"
```

**Untracked directories that might be temp/build artifacts:**
```bash
git ls-files --others --directory --exclude-standard | head -20
```

### Step 3: Analyze Branch Age

For each local branch, determine its age:

```bash
git for-each-ref --sort=-committerdate refs/heads/ --format='%(refname:short)|%(committerdate:relative)|%(committerdate:iso8601)'
```

Categorize branches by age:
- **Active** - Commits within last 7 days
- **Recent** - Commits within last 30 days
- **Stale** - Commits older than 30 days
- **Ancient** - Commits older than 90 days

### Step 4: Query Episodic Memory (if available)

Search episodic memory for recent work context:

```bash
node cli/episodic-memory search "cleanup" --limit 5 2>/dev/null || echo "Episodic memory not available"
node cli/episodic-memory search "work in progress" --limit 5 2>/dev/null || true
node cli/episodic-memory search "TODO" --limit 5 2>/dev/null || true
```

If episodic memory returns results, include relevant context about:
- Recent work that may still be in progress
- Notes about branches or features being developed
- Any cleanup-related decisions from previous sessions

### Step 5: Read Previous Cleanup Notes

Check for existing cleanup log to understand ongoing work context:

```bash
cat .claude/cleanup-log.jsonl 2>/dev/null | tail -10
```

Parse the JSON lines and summarize:
- When was the last cleanup check?
- What was noted as work-in-progress?
- Any patterns in uncommitted work?

### Step 6: Check GitHub PRs

Gather context about work in flight:

**Your open PRs:**
```bash
gh pr list --author @me --state open --json number,title,headRefName,updatedAt,isDraft --limit 10
```

**PRs from this repo's branches:**
```bash
gh pr list --state open --json number,title,headRefName,updatedAt --limit 10
```

**Recently merged PRs (last 7 days):**
```bash
gh pr list --state merged --json number,title,headRefName,mergedAt --limit 5
```

**Recently closed PRs (might have stale branches):**
```bash
gh pr list --state closed --json number,title,headRefName,closedAt --limit 5
```

### Step 7: Cross-Reference State

Analyze the gathered information to identify:

1. **Orphaned branches** - Local branches whose PRs have been merged or closed
2. **Stale worktrees** - Worktrees for branches that no longer exist or are merged
3. **Forgotten stashes** - Stashes that are old or related to merged work
4. **Uncommitted work alignment** - Do uncommitted changes relate to any open PR?
5. **Branch age concerns** - Ancient branches that might be abandoned

### Step 8: Generate Cleanup Recommendations

Categorize findings into:

**High Priority (blocking/risky):**
- Uncommitted changes that could be lost
- Worktrees in /tmp that may be cleaned up by system
- Unpushed commits on important branches

**Medium Priority (housekeeping):**
- Merged branches that can be deleted
- Old stashes that can be dropped
- Worktrees for completed work
- Stale branches (>30 days) with no associated PR

**Low Priority (optional):**
- Untracked files/directories that might be artifacts
- Local-only branches that might be experiments
- Ancient branches (>90 days)

### Step 9: Present Report

Structure the output as:

```markdown
## Repository Cleanup Report

### Current State Summary
| Metric | Count | Details |
|--------|-------|---------|
| Uncommitted files | N | M modified, U untracked |
| Stashes | N | oldest: X days ago |
| Worktrees | N | excluding main |
| Unpushed branches | N | |
| Open PRs | N | |

### Branch Age Analysis
| Age Category | Count | Branches |
|--------------|-------|----------|
| Active (<7d) | N | branch1, branch2 |
| Recent (<30d) | N | branch3 |
| Stale (>30d) | N | branch4, branch5 |
| Ancient (>90d) | N | branch6 |

### Context from Previous Sessions
[Summary of relevant notes from cleanup-log.jsonl]

### Context from Episodic Memory
[Summary of relevant work-in-progress from episodic memory, if available]

### Uncommitted Changes
[List files with their status]
[Note if changes appear related to any open PR]

### Cleanup Recommendations

#### High Priority
1. **[Action]** - [Reason]
   - Command: `[command to execute]`
   - Risk: [what could go wrong]

#### Medium Priority
1. **[Action]** - [Reason]
   - Command: `[command to execute]`

#### Low Priority
1. **[Action]** - [Reason]

### Open PRs Reference
| PR | Branch | Status | Age | Updated |
|----|--------|--------|-----|---------|
| #N | branch | draft/ready | Xd | date |

### Stale Branches Detail
| Branch | Last Commit | Age | PR Status |
|--------|-------------|-----|-----------|
| name | date | Xd | merged/closed/none |
```

### Step 10: Record Check in Log

Append a log entry to `.claude/cleanup-log.jsonl`:

```bash
mkdir -p .claude
```

Create a JSON entry with:
```json
{
  "timestamp": "[ISO timestamp]",
  "type": "check",
  "uncommitted_count": N,
  "stashes": N,
  "worktrees": N,
  "open_prs": N,
  "stale_branches": N,
  "ancient_branches": N,
  "recommendations": {
    "high": N,
    "medium": N,
    "low": N
  }
}
```

```bash
echo '[JSON entry]' >> .claude/cleanup-log.jsonl
```

### Step 11: Offer Next Steps

Inform the user they can run `/cleanup-execute` to act on these recommendations, or `/cleanup-combined` to run both check and execute in sequence.

## Error Handling

**If gh CLI not authenticated:**
Skip GitHub steps but continue with local analysis. Note that PR context is unavailable.

**If no remote configured:**
Skip remote-related checks and note this in the report.

**If episodic memory unavailable:**
Continue without it - it's optional context enrichment.

**If cleanup-log.jsonl is corrupted:**
Back it up and start fresh:
```bash
mv .claude/cleanup-log.jsonl .claude/cleanup-log.jsonl.bak 2>/dev/null || true
```

## Key Principles

- **Read-only** - This command only analyzes and reports; it never modifies state
- **Context-rich** - Pull from multiple sources (git, GitHub, episodic memory, logs)
- **Actionable output** - Every recommendation includes the specific command to run
- **Age-aware** - Branch age is a key signal for identifying stale work
