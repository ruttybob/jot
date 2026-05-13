---
description: Modernize & refactor plan with diagnostic perspectives — save to jot
argument-hint: "<codebase or target>"
---

$@

Analyze the codebase, create a modernization plan, save to jot. Use the **jot** skill. Frontmatter: `tags: plan, refactor, modernize, <topic-tags>`.

**Before writing** — if scope or constraints are unclear, use `questionnaire`. Do not guess.

## Rules

- Preserve behavior unless functional change is explicitly requested
- Break work into small, reviewable passes
- Keep public APIs stable
- Separate migrations (framework, dependency, API breaks) into standalone tasks
- For broad work — propose docs, specs, and parity checks before implementation

## Process

### Explore
Identify: dead code, duplicated logic, oversized modules, stale abstractions, legacy patterns.

### Diagnose (Verbalized Sampling)

Generate 5 problem diagnoses from different angles. Include at least 1-2 low-probability (p<0.10) — these surface non-obvious but high-impact issues.

```
<response>
  <text>[problem + root cause + recommended fix]</text>
  <probability>[0.0–1.0]</probability>
</response>
```

### Plan structure

- **Current state** — pain points
- **Problem diagnoses** — 5 perspectives with probabilities
- **Passes** — numbered, each with: objective, current behavior, structural improvement, validation check
- **Migration items** — separate tasks for framework/dependency/API changes
- **Prerequisites** — docs, specs, parity checks to create first

## Save to jot

```bash
ID=$(jot main create "Refactor: <title>" | cut -f1)
CONTENT=$(cat /tmp/refactor-plan.md)
jot main update "$ID" markdown "$CONTENT"
SHARE_URL=$(jot main share "$ID" comment | cut -f3)
open "$SHARE_URL"
```
