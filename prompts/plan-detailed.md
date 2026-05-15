---
description: Detailed implementation plan with copy-paste code, commands, and TDD steps — save to jot
argument-hint: "<path-to-summary-plan.md>"
---

$@

Write a detailed implementation plan — the implementer has zero codebase context. Expand the summary plan into copy-paste-ready tasks. Use the **jot** skill. Frontmatter: `tags: plan/detailed, <topic-tags>`. If expanding a parent plan, add `parent-plan: <parent-id>`.

**Before writing** — if anything is unclear, use `ask_user_question`. Do not write a plan with ambiguities.
If subagents are available — use them proactively for codebase exploration and parallel task analysis.

## Task sizing

Each task = 2-5 minutes of focused work. One action per step.

- ❌ "Build authentication system" (50 lines, 5 files)
- ✅ "Create User model with email field" (10 lines, 1 file)

## Plan template

````markdown
# [Feature] Implementation Plan

**Status:** ⏳ Not implemented
**Goal:** [One sentence]
**Architecture:** [2-3 sentences]
**Tech Stack:** [Key technologies]
**Source plan:** [path]

---

### Task 1: [Name]

**Objective:** What this accomplishes
**Files:** Create/Modify/Test — exact paths

**Step 1: Write failing test**
```lang
def test_behavior():
    result = function(input)
    assert result == expected
```

**Step 2: Verify failure**
Run: `pytest tests/path/test.py::test_behavior -v`
Expected: FAIL

**Step 3: Minimal implementation**
```lang
def function(input):
    return expected
```

**Step 4: Verify pass**
Run: `pytest tests/path/test.py::test_behavior -v`
Expected: PASS

**Step 5: Commit**
```bash
git add tests/path/test.py src/path/file.py
git commit -m "feat: specific behavior"
```

---
[next tasks]
````

## Workflow

1. Read summary plan + explore codebase
2. Design approach (architecture, files, dependencies, testing)
3. Write tasks in order: setup → core (TDD) → edge cases → integration → cleanup
4. Add exact paths, complete code, exact commands, expected output

**Checklist before saving:**
- [ ] Tasks sequential, logical
- [ ] Each task bite-sized (2-5 min)
- [ ] File paths exact
- [ ] Code complete (copy-pasteable)
- [ ] Commands with expected output
- [ ] No missing context

## Save to jot

**Before saving — check for existing plan.** Search jot for a note with the same topic. If found, **update** it instead of creating a new one.

```bash
# 1. Search for existing plan by topic keywords
EXISTING=$(jot main search "<topic keywords>" | head -5)

# 2. If a matching plan found (title contains topic):
#    Update existing note
ID="<existing-id>"
jot main update "$ID" title "Plan/Detailed: <title>"
jot main update "$ID" markdown "$(cat /tmp/plan-detailed.md)"

# 3. If no match found:
#    Create new note
ID=$(jot main create "Plan/Detailed: <title>" | cut -f1)
jot main update "$ID" markdown "$(cat /tmp/plan-detailed.md)"

# 4. Share & open
SHARE_URL=$(jot main share "$ID" comment | cut -f3)
open "$SHARE_URL"
```

Output the ID: `Detailed plan saved to jot (ID: ${ID}, updated/create).`
