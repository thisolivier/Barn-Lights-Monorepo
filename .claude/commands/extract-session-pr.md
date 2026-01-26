---
description: Extract session work into a PR via git worktree isolation
allowed-tools: Read, Bash(git:*, gh:*, mkdir:*, cp:*, rm:*, cat:*, date:*, test:*, which:*)
---

<!--
This command extracts the current session's changes into a PR without
modifying the working directory, allowing other agents to continue working.

Usage: /extract-session-pr
No arguments required - operates on current working directory changes.
-->

## Step 1: Validate Environment

Verify this is a git repository and gh CLI is available:
```bash
git rev-parse --git-dir && which gh
```

If not a git repo, stop and explain the command only works in git repositories.
If gh is not found, stop and direct user to install GitHub CLI: https://cli.github.com/

## Step 2: Detect Changes

Check for changes in the working directory:
```bash
git status --porcelain
```

If output is empty, inform the user there are no changes to extract and stop.

Categorize the files:
- `M` or ` M` = modified tracked files
- `A` or ` A` = staged additions
- `D` or ` D` = deleted files
- `??` = untracked new files
- `MM` = modified and staged

## Step 3: Analyze Session Relevance

Review the conversation history and examine diffs for each changed file:
```bash
git diff HEAD -- <file>
```

Classify each file as:
1. **Session-related** - Created, modified, or discussed in this session
2. **Potentially unrelated** - Changes that do not correspond to session work

Warning indicators for unrelated changes:
- Files never discussed or touched in this session
- Changes not matching any task from the conversation
- Modifications from a different feature or bug fix

If potentially unrelated changes detected, use `AskUserQuestion` to present:
- List of session-related files with explanations
- List of potentially unrelated files with explanations
- Options: exclude unrelated files, proceed with all, or abort

Store any user-specified exclusions for Step 6.

## Step 4: Preview and Confirm

Display the files to be included (respecting exclusions), grouped by:
- Modified files
- New/untracked files
- Deleted files

Use `AskUserQuestion` to confirm the user wants to proceed.

## Step 5: Gather PR Details

Use `AskUserQuestion` to collect:
1. **PR title** - Suggest a default based on session work
2. **Base branch** - Default to `main`, allow override

Generate a PR description based on changes and session context.

## Step 6: Generate Patches

Generate patches respecting any exclusions:

For all files:
```bash
git diff HEAD > /tmp/session-pr-tracked.patch
git ls-files --others --exclude-standard
```

For selective files:
```bash
git diff HEAD -- <included-files> > /tmp/session-pr-tracked.patch
```

Store the list of untracked files to copy.

## Step 7: Create Worktree

Create an isolated worktree from the base branch:
```bash
WORKTREE_ID=$(date +%s)
WORKTREE_PATH="/tmp/session-pr-$WORKTREE_ID"
git worktree add "$WORKTREE_PATH" <base-branch> --detach
```

Store the worktree path for cleanup.

## Step 8: Create Branch

Generate a slug from the PR title (lowercase, hyphens, no special characters):
```bash
git -C "$WORKTREE_PATH" checkout -b pr/<slug>
```

## Step 9: Apply Changes

Apply the patch in the worktree:
```bash
git -C "$WORKTREE_PATH" apply /tmp/session-pr-tracked.patch
```

Copy untracked files to the worktree:
```bash
mkdir -p "$WORKTREE_PATH/$(dirname <file>)"
cp "<file>" "$WORKTREE_PATH/<file>"
```

If patch fails:
1. Clean up: `git worktree remove "$WORKTREE_PATH" --force && rm -f /tmp/session-pr-*.patch`
2. Report the error and stop

## Step 10: Commit

Stage and commit all changes in the worktree:
```bash
git -C "$WORKTREE_PATH" add -A
git -C "$WORKTREE_PATH" commit -m "$(cat <<'EOF'
<commit message from PR title>

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

## Step 11: Push

Push the branch from the worktree:
```bash
git -C "$WORKTREE_PATH" push -u origin pr/<slug>
```

If push fails, report the error (auth issues, branch exists) and offer to retry or abort.

## Step 12: Create PR

Create the pull request:
```bash
gh pr create \
  --head pr/<slug> \
  --base <base-branch> \
  --title "<PR title>" \
  --body "$(cat <<'EOF'
## Summary
<bullet points from session context>

## Test plan
<testing checklist>

Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Capture and store the PR URL.

## Step 13: Cleanup

Always clean up the worktree and temp files:
```bash
git worktree remove "$WORKTREE_PATH" --force 2>/dev/null || true
rm -f /tmp/session-pr-*.patch
```

## Step 14: Report Results

Tell the user:
- The PR URL (clickable link)
- The branch name created
- Summary of files included
- Confirmation that working directory was not modified

## Error Handling

On any failure after worktree creation, always clean up:
```bash
git worktree remove "$WORKTREE_PATH" --force 2>/dev/null || true
rm -f /tmp/session-pr-*.patch
```

## Key Constraints

- Never modify the working directory - all operations in the worktree
- Never use git stash - worktree provides isolation
- Always clean up on failure
- User decides what to include - suggestions are advisory
