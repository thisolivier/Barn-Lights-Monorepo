# Extract Session Work and Make PR

Extract only the unstaged changes relevant to the current conversation session and create a pull request that merges back into the current branch.

## How This Works

This skill uses a **worktree + patch approach** to safely extract session-relevant changes without affecting other agents:

1. Check if already in a worktree; if not, create a temporary worktree for isolation
2. Generate a patch file containing only the hunks from this session
3. In the worktree: create a new branch, apply the session patch
4. Commit, push, create PR
5. Clean up the worktree (if created)
6. Original working directory is never modified - other agents can continue working

**Key principle:** By working in an isolated worktree, this skill never touches the main working directory. Other agents running in parallel are unaffected. The worktree is cleaned up after the PR is created.

## Instructions

### Step 1: Analyze Unstaged Changes

Get all unstaged changes in the working directory:

```bash
git diff
git diff --name-only
git status
```

If there are no unstaged changes, inform the user and stop.

### Step 2: Correlate Changes with Session Context

Review the conversation history and the diff output together. For each hunk in the diff:
- Determine if it relates to work discussed or performed in this session
- Identify hunks that were made by other agents or before this session started
- Build a list of file paths and specific hunks that belong to this session

Present your analysis to the user, showing:
- Which files/hunks you believe belong to this session
- Which files/hunks appear to be from other work

**Ask user to confirm** which hunks should be included in the PR before proceeding.

### Step 3: Gather Required Information

Ask the user for:
1. **Branch name** - The name for the new feature branch (suggest a sensible default based on the work done)
2. **PR title** - A concise title for the pull request (suggest a default based on the changes)

Note: The PR will target the current branch (not main), so no base branch selection is needed.

### Step 4: Record Current State

```bash
# Record current branch name - this becomes the PR target
git branch --show-current

# Record the repository root path
git rev-parse --show-toplevel

# Fetch latest from remote
git fetch origin
```

Store the original branch name as `<original-branch>` and the repo root as `<repo-root>`.

### Step 5: Set Up Isolated Worktree

**Check if already in a worktree:**
```bash
git rev-parse --is-inside-work-tree
git worktree list
```

If the current directory is already a secondary worktree (not the main working directory), skip worktree creation and proceed to Step 6.

**If in the main working directory, create a temporary worktree:**

```bash
# Create a unique worktree directory
WORKTREE_PATH="/tmp/extract-pr-worktree-$(date +%s)"

# Create worktree from current branch
git worktree add "$WORKTREE_PATH" <original-branch>

# Record that we created a worktree (for cleanup later)
```

Store `<worktree-path>` and set `<created-worktree>` to true.

**Generate the session patch before switching to worktree** (while still in main directory with unstaged changes):

```bash
# Save the complete unstaged diff - this captures all current changes
git diff > /tmp/extract-pr-full-backup.patch

# Verify the patch file was created and has content
wc -l /tmp/extract-pr-full-backup.patch
```

Now change to the worktree for all subsequent operations:
```bash
cd "$WORKTREE_PATH"
```

**Important:** From this point forward, all git operations happen in the worktree. The main working directory (where other agents may be working) is untouched.

### Step 6: Assess Completeness and Consistency

Before proceeding, evaluate whether the session's changes form a complete, working feature:

**Check for these issues:**

1. **Incomplete implementation** - Does the work rely on code that was already staged or committed during this session but not yet pushed? If so, extracting only the unstaged changes would create a broken PR.

2. **Missing dependencies** - Are there function calls, imports, or references to code that exists only in staged/committed changes but not on the remote?

3. **Partial feature** - Is this a half-finished feature where critical parts are in staged commits?

4. **Cross-file dependencies** - Do the changes in one file depend on staged changes in another file?

**To check staged changes:**
```bash
git diff --cached
git diff --cached --name-only
```

**To check recent commits on current branch vs remote:**
```bash
git log origin/<original-branch>..HEAD --oneline
git diff origin/<original-branch>..HEAD
```

**If issues are found, STOP and warn the user:**

Explain the problem clearly:
- What is missing or incomplete
- Which staged/committed changes the work depends on
- Why extracting only these changes would result in broken code

**Offer next steps:**

1. **Include the staged/committed work** - Suggest expanding the PR to include necessary staged commits
2. **Complete the work first** - If the feature is genuinely incomplete, suggest finishing first
3. **Proceed anyway (not recommended)** - Allow the user to proceed if they understand the risks
4. **Abort** - Cancel the PR creation entirely

Only proceed to Step 7 after the user confirms they want to continue with a viable approach.

### Step 7: Generate Session-Only Patch

Using the full backup patch created in Step 5, extract only the session-relevant hunks.

**Option A: For files entirely from this session**

If all hunks in certain files belong to this session, extract them:
```bash
# Read the backup patch and extract sections for specific files
# Create /tmp/extract-pr-session.patch with only those file sections
```

**Option B: For files with mixed hunks (some from session, some not)**

You must manually construct the patch:

1. Use the Read tool to examine `/tmp/extract-pr-full-backup.patch`
2. Create a new file `/tmp/extract-pr-session.patch` containing only the hunks identified as belonging to this session
3. Ensure the patch file has correct format:
   - Each file section starts with `diff --git a/path b/path`
   - Followed by `--- a/path` and `+++ b/path`
   - Then `@@ ... @@` hunk headers with correct line numbers
   - Then the actual changes with `+`, `-`, and ` ` prefixes

**Verify the session patch (in the worktree):**
```bash
# Check the patch applies cleanly (dry run)
git apply --check /tmp/extract-pr-session.patch
```

If the patch doesn't apply cleanly, you may need to adjust hunk context or line numbers.

### Step 8: Create Branch and Apply Patch

**In the worktree**, the working directory is already clean (matches the committed state).

```bash
# Check if remote branch already exists
git ls-remote --heads origin <branch-name>
```

**If the remote branch already exists:**
- Inform the user that a branch with this name exists on the remote
- Ask if they want to: (a) choose a different name, (b) delete the remote branch and proceed, or (c) abort
- Only proceed after user confirmation

```bash
# Create new branch in the worktree
git checkout -b <branch-name>

# Apply only the session-relevant changes
git apply /tmp/extract-pr-session.patch
```

If the apply fails:
1. Check the error message for which hunks failed
2. You may need to apply hunks manually using the Edit tool
3. Refer to the session patch content for what changes to make

### Step 9: Run Tests

Run tests for packages affected by the changes. **All paths are relative to the worktree:**

```bash
# For renderer package changes (in worktree):
cd <worktree-path>/packages/renderer && npm test

# For sender package changes (in worktree):
cd <worktree-path>/packages/sender && npm test
```

Determine which packages were affected by the file paths of the applied changes.

If tests fail:
1. Report the failures to the user
2. Ask if they want to fix the issues before proceeding
3. If fixing, make corrections and re-run tests
4. If user wants to abort, see "Recovery from Failed Steps" below

### Step 10: Commit and Push

```bash
git add <list of changed files>
git commit -m "$(cat <<'EOF'
<commit message based on work done>

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"

# Push the new branch
git push -u origin <branch-name>
```

**If push fails:**
- Check if the branch already exists on remote: `git ls-remote --heads origin <branch-name>`
- If authentication fails, ask user to verify their git credentials
- If network error, suggest retrying: `git push -u origin <branch-name>`

### Step 11: Create Pull Request

Create the PR targeting the original branch (not main):

```bash
gh pr create --base <original-branch> --title "<PR title>" --body "$(cat <<'EOF'
## Summary
<bullet points describing the changes>

## Test plan
<testing checklist based on changes made>

Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Store the PR URL from the output.

**If PR creation fails:**
- Check if a PR already exists for this branch: `gh pr list --head <branch-name>`
- Verify the base branch exists on remote: `git ls-remote --heads origin <original-branch>`
- If gh auth issues, suggest: `gh auth status` and `gh auth login`

### Step 12: Clean Up Worktree

**If a worktree was created** (`<created-worktree>` is true):

```bash
# Return to the original repository directory
cd <repo-root>

# Remove the worktree
git worktree remove <worktree-path> --force

# Clean up temporary patch files
rm -f /tmp/extract-pr-full-backup.patch /tmp/extract-pr-session.patch
```

**If already in a worktree** (no worktree was created), just clean up patch files:
```bash
rm -f /tmp/extract-pr-full-backup.patch /tmp/extract-pr-session.patch
```

### Step 13: Report Results

Provide the user with:
- The PR URL
- The feature branch name created
- The target branch (original branch) the PR will merge into
- A summary of the hunks/changes included in the PR
- Test results summary
- Confirmation that the worktree was cleaned up (if created)
- Reminder that the main working directory was never modified

## Recovery from Failed Steps

If any step fails partway through:

**If in the worktree and need to abort:**
```bash
# Return to original repository
cd <repo-root>

# Remove the worktree (force if needed)
git worktree remove <worktree-path> --force

# Delete the local feature branch if it was created
git branch -D <branch-name>

# If branch was pushed, delete remote branch (optional)
git push origin --delete <branch-name>

# Clean up patch files
rm -f /tmp/extract-pr-full-backup.patch /tmp/extract-pr-session.patch
```

**If PR was created but something is wrong:**
- The PR can be closed via: `gh pr close <pr-number>`
- Or the user can close it manually in the GitHub UI

**General recovery:**
- The main working directory is **never modified** - all original unstaged changes remain intact
- The worktree is isolated - any problems there don't affect the main directory
- Worst case: remove the worktree with `git worktree remove <path> --force`

## Important Notes

- **Worktree isolation** - All work happens in a temporary worktree, leaving the main directory untouched
- **Parallel agent safety** - Other agents can continue working in the main directory without conflicts
- **Worktree cleanup required** - The worktree is always removed after PR creation
- **Never use `git stash`** - This skill uses worktrees and patches for isolation
- **Session context determines relevance** - Use the conversation history to identify which hunks belong to this session
- **Hunk-level precision** - Only include the specific diff hunks from this session, not entire files
- **PR targets the current branch** - The PR merges the feature branch back into the branch you started on, not main
- **Test verification** - Run tests in the worktree before creating the PR
- **Skip worktree if already in one** - If already in a secondary worktree, skip creation to avoid nesting
