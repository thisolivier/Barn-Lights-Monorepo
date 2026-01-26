# Review Session

Analyze the current session for tool, command, and skill usage. Evaluate how successful each usage was and provide recommendations for optimizations and improvements.

## Instructions

### Step 1: Gather Session Context

Review the full conversation history to identify:
1. **Tools used** - All tool invocations (Bash, Read, Write, Edit, Grep, Glob, Task, WebFetch, etc.)
2. **Skills invoked** - Any `/skill-name` commands that were executed
3. **Agent delegations** - Any Task tool calls to subagents (Explore, Plan, Bash, etc.)
4. **User questions asked** - Uses of AskUserQuestion tool

For each tool/skill usage, note:
- What was the intent
- What was the outcome (success, failure, partial)
- How many attempts were needed
- Any errors or retries

### Step 2: Identify Patterns and Issues

Analyze the gathered data for:

**Inefficiency Patterns:**
- Multiple read operations on the same file that could have been batched
- Glob/Grep searches that were too broad or too narrow
- Repeated similar searches indicating unclear initial requirements
- Bash commands used where specialized tools would be better (e.g., `cat` instead of Read)

**User Correction Patterns (Key Smell):**
- User had to provide clarifying instructions after initial attempt
- User corrected the approach or tool choice
- User pointed out missed requirements or context
- User had to repeat or rephrase their request
- User provided feedback indicating dissatisfaction with results
- User manually fixed or adjusted output

**Error Patterns:**
- Tool failures and their root causes
- Retry loops that indicate misunderstanding
- Permission issues or sandbox restrictions encountered
- Incorrect file paths or glob patterns

**Suboptimal Tool Choices:**
- Using Bash for file operations instead of Read/Write/Edit
- Direct searches instead of delegating to Explore agent for complex queries
- Over-reliance on a single approach when alternatives exist

**Successful Patterns:**
- Good use of agent delegation for complex tasks
- Efficient search strategies that found results quickly
- Appropriate tool selection for the task
- Completing requests without requiring user correction or clarification

### Step 3: Evaluate Success Metrics

For each major task or request in the session, assess:

1. **Task Completion** - Was the goal achieved?
   - Fully completed
   - Partially completed (with what gaps)
   - Not completed (why)

2. **Efficiency** - How direct was the path to completion?
   - Direct (minimal wasted effort)
   - Moderate (some exploration needed)
   - Indirect (significant trial and error)

3. **Tool Appropriateness** - Were the right tools used?
   - Optimal choices throughout
   - Some suboptimal choices
   - Significant tool misuse

4. **Error Recovery** - How were problems handled?
   - Clean recovery from errors
   - Some struggling with issues
   - Unresolved problems remain

### Step 4: Generate Recommendations

Based on the analysis, prepare recommendations in these categories:

**Immediate Improvements:**
- Specific tool choices that would have been better
- Better search strategies for similar future queries
- How user corrections could have been anticipated

**Process Improvements:**
- Patterns to adopt for future sessions
- Tool combinations that work well together
- When to delegate to specialized agents

**Learning Points:**
- New tool capabilities discovered
- Edge cases or limitations encountered
- Configuration or permission adjustments that might help

### Step 5: Present Report to User

Structure the report as follows:

```markdown
## Session Review Summary

### Overview
- Session duration context (based on conversation length)
- Primary tasks addressed
- Overall success assessment

### Tool Usage Analysis

#### Tools Used
| Tool | Count | Success Rate | Notes |
|------|-------|--------------|-------|
| ... | ... | ... | ... |

#### Efficiency Score
[Rate the session efficiency: Excellent / Good / Moderate / Needs Improvement]

### User Corrections Required
[List instances where user feedback or instruction was needed to correct course]

1. **Correction description**
   - What was attempted
   - What the user had to clarify or correct
   - How this could have been anticipated

### Other Issues

1. **Issue description**
   - What happened
   - Impact on session
   - Recommended alternative

### Successful Patterns

1. **Pattern description**
   - Why it worked well
   - When to use this approach again

### Recommendations

#### For Future Sessions
- [Specific actionable recommendations]

#### Tool Selection Guide
- [When to use which tools based on this session's learnings]

#### Configuration Suggestions
- [Any settings or permissions that might improve workflow]
```

### Step 6: Offer Follow-up Actions

Use `AskUserQuestion` to offer:

1. **Deep dive on specific area** - Analyze a particular tool or task in more detail
2. **Export recommendations** - Save the recommendations to a file for reference
3. **No further action** - End the review

If the user wants to export, write the recommendations to `.claude/session-reviews/` with a timestamped filename.

## Analysis Guidelines

**What counts as a tool "failure":**
- Explicit error messages returned
- Results that didn't match what was sought (requiring retry)
- Timeouts or permission denials

**What counts as "inefficient":**
- More than 2 attempts to accomplish the same sub-task
- Using general tools when specialized ones exist

**What counts as "user correction needed" (primary smell):**
- User says "no, I meant..." or "actually..."
- User rephrases or repeats a request
- User provides additional context after seeing initial results
- User points out something that was missed
- User modifies or adjusts the output/approach
- Any indication the first attempt didn't meet expectations

**What to highlight as "good":**
- Effective use of Task tool for delegation
- Quick path from request to solution
- Good error recovery
- Tasks completed without user correction or additional instruction

## Key Principles

- **User corrections are the primary signal** - Any instance where the user had to provide feedback, clarification, or correction indicates an improvement opportunity
- **Constructive feedback** - Focus on improvements, not criticism
- **Actionable recommendations** - Every suggestion should be something the user can apply
- **Context-aware** - Consider that some "inefficiencies" may have been necessary exploration
- **Honest assessment** - Provide accurate evaluation even if the session had significant issues
- **Learning-focused** - Frame findings as opportunities for improvement
