# Extract Session Work and Make PR

Extract the current session's work into a PR using git worktree isolation, without touching the working directory so other agents can continue working undisturbed.

## Instructions

### Step 1: Detect Changes

Run git status to see all changes in the working directory:

```bash
git status --porcelain
```

If there are no changes (output is empty), inform the user and stop.

Parse the output to categorize files:
- `M` or ` M` = modified tracked files
- `A` or ` A` = added files (staged)
- `D` or ` D` = deleted files
- `??` = untracked files (new files not yet in git)
- `MM` = modified and staged

### Step 2: Analyze Session Relevance

Review the conversation history and compare it against the detected changes. For each changed file, determine:

1. **Clearly session-related** - Files you created, modified, or discussed in this session
2. **Potentially unrelated** - Files with changes that don't correspond to any work in this session

**To analyze, examine the diffs:**
```bash
git diff HEAD -- <file>
```

**Warning indicators for unrelated changes:**
- Files you never discussed or touched in this session
- Changes that don't match any task or request from the conversation
- Modifications that appear to be from a different feature or bug fix
- Code patterns or styles inconsistent with this session's work

**If you detect potentially unrelated changes, WARN the user:**

Present a clear breakdown:
- List files that ARE related to this session (with brief explanation)
- List files that appear UNRELATED (with explanation of why)
- Show the specific hunks/changes that seem out of place

**Suggest approaches for splitting the code:**

1. **Exclude unrelated files** - Proceed with only session-related files. Provide the list of files to exclude and offer to create the PR without them.

2. **Create separate PRs** - If there are two distinct sets of changes, suggest creating two separate PRs (user would need to run the command twice, once for each set).

3. **Proceed with all changes** - If the user confirms all changes are intentional, continue with everything.

4. **Abort and investigate** - If the situation is unclear, abort so the user can manually review.

Use `AskUserQuestion` to let the user choose how to proceed. If they choose to exclude files, store the exclusion list for use in Step 5.

### Step 3: Show Preview and Confirm

Display the list of changed files to the user (excluding any files the user chose to exclude in Step 2), grouped by type:
- Modified files
- New/untracked files
- Deleted files

Use `AskUserQuestion` to ask the user to confirm they want to create a PR with these changes.

### Step 4: Gather PR Details

Use `AskUserQuestion` to collect:
1. **PR title** - Suggest a default based on the work done in this session
2. **Base branch** - Default to `main`, but allow user to specify another branch

Generate a PR description based on the changes and session context.

### Step 5: Generate Patches

Generate patches for the changes to include (respecting any exclusions from Step 2):

**If no files were excluded:**
```bash
# For tracked file changes (both staged and unstaged)
git diff HEAD > /tmp/session-pr-tracked.patch

# List untracked files for later copying
git ls-files --others --exclude-standard
```

**If files were excluded:**
```bash
# Generate patch for only the included tracked files
git diff HEAD -- <file1> <file2> ... > /tmp/session-pr-tracked.patch

# Filter untracked files to only those being included
git ls-files --others --exclude-standard | grep -E '^(file1|file2|...)$'
```

Store the list of untracked files to include - these will need to be copied directly to the worktree.

### Step 6: Create Temporary Worktree

```bash
# Generate unique worktree path
WORKTREE_ID=$(date +%s)
WORKTREE_PATH="/tmp/session-pr-$WORKTREE_ID"

# Create worktree from base branch in detached HEAD state
git worktree add "$WORKTREE_PATH" <base-branch> --detach
```

Store the worktree path for later cleanup.

### Step 7: Create Branch in Worktree

Generate a branch name slug from the PR title (lowercase, hyphens, no special chars):

```bash
git -C "$WORKTREE_PATH" checkout -b pr/<slug>
```

### Step 8: Apply Changes in Worktree

**Apply the patch for tracked files:**
```bash
git -C "$WORKTREE_PATH" apply /tmp/session-pr-tracked.patch
```

**Copy untracked files:**
For each untracked file from Step 5, copy it from the working directory to the worktree:
```bash
# Create parent directories if needed
mkdir -p "$WORKTREE_PATH/$(dirname <file>)"
cp "<file>" "$WORKTREE_PATH/<file>"
```

**Handle deleted files:**
If any files were deleted, they should already be handled by the patch. Verify with:
```bash
git -C "$WORKTREE_PATH" status
```

**If patch fails to apply:**
1. Remove the worktree: `git worktree remove "$WORKTREE_PATH" --force`
2. Clean up temp files: `rm -f /tmp/session-pr-*.patch`
3. Report the error to the user and stop

### Step 9: Commit in Worktree

```bash
git -C "$WORKTREE_PATH" add -A
git -C "$WORKTREE_PATH" commit -m "$(cat <<'EOF'
<commit message based on PR title>

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

### Step 10: Push from Worktree

```bash
git -C "$WORKTREE_PATH" push -u origin pr/<slug>
```

**If push fails:**
- Check for authentication issues
- Check if branch already exists on remote
- Report error and offer to retry or abort

### Step 11: Create Pull Request

```bash
gh pr create --repo $(git remote get-url origin | sed 's/.*github.com[:/]\(.*\)\.git/\1/') \
  --head pr/<slug> \
  --base <base-branch> \
  --title "<PR title>" \
  --body "$(cat <<'EOF'
## Summary
<bullet points describing the changes>

## Test plan
<testing checklist>

Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Store the PR URL from the output.

### Step 12: Cleanup

Always clean up, whether successful or not:

```bash
# Remove the worktree
git worktree remove "$WORKTREE_PATH" --force

# Clean up temp files
rm -f /tmp/session-pr-*.patch
```

### Step 13: Report Results

Tell the user:
- The PR URL (as a clickable link)
- The branch name created
- Summary of files included
- Confirmation that the working directory was not modified

## Error Handling

**If not a git repo:**
```bash
git rev-parse --git-dir
```
If this fails, inform user this command only works in git repositories.

**If GitHub CLI not available:**
```bash
which gh
```
If not found, tell user to install GitHub CLI: https://cli.github.com/

**If patches fail to apply:**
- Clean up worktree immediately
- Show the error message
- Suggest the user check for conflicts with the base branch

**Always cleanup on failure:**
Any error after worktree creation must trigger cleanup:
```bash
git worktree remove "$WORKTREE_PATH" --force 2>/dev/null || true
rm -f /tmp/session-pr-*.patch
```

## Key Principles

- **Working directory untouched** - All operations happen in the temporary worktree
- **Clean abort on failure** - Always remove worktree and temp files if something goes wrong
- **No stashing** - Never use git stash; worktree provides complete isolation
- **Session relevance warning** - Warn user about changes that appear unrelated to the current session, with options to exclude them
- **User decides** - The user always has final say on what to include; suggestions are advisory only
