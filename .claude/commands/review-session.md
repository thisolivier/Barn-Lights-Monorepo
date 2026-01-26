---
description: Analyze current session for tool usage, efficiency, and user corrections
allowed-tools: Read, Write, Glob
---

Analyze this session's tool, command, and skill usage. Evaluate success and provide improvement recommendations.

## Step 1: Gather Session Context

Review the full conversation history and identify:

1. **Tools used** - All invocations (Bash, Read, Write, Edit, Grep, Glob, Task, WebFetch, etc.)
2. **Skills invoked** - Any `/skill-name` commands executed
3. **Agent delegations** - Task tool calls to subagents
4. **User questions asked** - AskUserQuestion tool usage

For each usage, note:
- Intent
- Outcome (success, failure, partial)
- Number of attempts needed
- Any errors or retries

## Step 2: Identify Patterns

Analyze for these pattern types:

**User Corrections (PRIMARY SIGNAL):**
- User said "no, I meant..." or "actually..."
- User rephrased or repeated a request
- User provided additional context after seeing initial results
- User pointed out something missed
- User modified or adjusted output/approach
- Any indication first attempt did not meet expectations

**Inefficiencies:**
- Multiple reads of same file that could have been batched
- Searches too broad or too narrow
- Repeated similar searches indicating unclear requirements
- Bash used where specialized tools better (e.g., `cat` instead of Read)

**Errors:**
- Tool failures and root causes
- Retry loops indicating misunderstanding
- Permission or sandbox issues
- Incorrect file paths or patterns

**Successes:**
- Effective agent delegation for complex tasks
- Efficient search strategies
- Appropriate tool selection
- Requests completed without user correction

## Step 3: Evaluate Each Major Task

For each task or request, assess:

| Metric | Rating Options |
|--------|----------------|
| Task Completion | Fully / Partially (gaps) / Not completed (why) |
| Efficiency | Direct / Moderate exploration / Significant trial-and-error |
| Tool Appropriateness | Optimal / Some suboptimal / Significant misuse |
| Error Recovery | Clean / Some struggling / Unresolved |

## Step 4: Generate Recommendations

Prepare recommendations in these categories:

- **Immediate Improvements** - Better tool choices, search strategies, how to anticipate user corrections
- **Process Improvements** - Patterns to adopt, effective tool combinations, when to delegate
- **Learning Points** - New capabilities discovered, edge cases encountered, configuration adjustments

## Step 5: Present Report

Structure the report:

**Session Review Summary**
- Primary tasks addressed
- Overall success assessment

**Tool Usage Analysis**
- Table: Tool | Count | Success Rate | Notes
- Efficiency score: Excellent / Good / Moderate / Needs Improvement

**User Corrections Required**
For each correction:
- What was attempted
- What user had to clarify or correct
- How this could have been anticipated

**Other Issues**
For each issue:
- What happened
- Impact on session
- Recommended alternative

**Successful Patterns**
For each pattern:
- Why it worked well
- When to use again

**Recommendations**
- For future sessions
- Tool selection guidance
- Configuration suggestions

## Step 6: Offer Follow-up

Ask the user if they want to:
1. Deep dive on a specific area
2. Export recommendations to `.claude/session-reviews/` with timestamped filename
3. No further action
