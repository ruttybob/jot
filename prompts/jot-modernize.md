---
description: "Modernize and refactor plan, saved to jot"
argument-hint: "<codebase or target>"
---

# Modernize & Refactor Plan

<goal>
$@
</goal>

Analyze the codebase and create a modernization / refactoring plan, saved as a note in jot. Use the **jot** skill for all jot commands.

Always include frontmatter with `tags:` — use `plan, refactor, modernize` plus topic-specific tags (e.g. `tags: plan, refactor, modernize, legacy-cleanup`).

## Before Writing

If anything is unclear about the scope, constraints, or which parts of the codebase to focus on — use the `questionnaire` tool to ask the user before composing the plan. Do not guess.

## Requirements

- Preserve behavior unless the user explicitly asks for a functional change.
- Start by identifying dead code, duplicated paths, oversized modules, stale abstractions, and legacy patterns that are slowing changes down.
- For each proposed pass, name the current behavior, the structural improvement, and the validation check that should prove behavior stayed stable.
- Break the work into small reviewable refactor passes such as deleting dead code, simplifying control flow, extracting helpers, or replacing outdated patterns with the repo's current conventions.
- Keep public APIs stable unless a change is required by the refactor.
- Call out any framework migration, dependency upgrade, API change, or architecture move that should be split into a separate migration task.
- If the work is broad, propose the docs, specs, and parity checks we should create before implementation.

## Steps

### 1. Explore Codebase

Explore the target codebase to understand its structure, patterns, and problem areas. Identify:

- Dead code and unused files
- Duplicated logic
- Oversized modules / god objects
- Stale abstractions
- Legacy patterns that deviate from current conventions

### 2. Diagnose Problems (Verbalized Sampling)

Refactoring diagnosis benefits from multiple viewpoints — the most obvious problem isn't always the most impactful. Generate 5 problem diagnoses:

```
<response>
  <text>[problem area + root cause + recommended fix]</text>
  <probability>[how immediately visible this problem is, 0.0–1.0]</probability>
</response>
```

Vary perspectives: obvious surface issues, architectural drift, hidden coupling, testing gaps, and second-order effects of legacy patterns.

Include at least 1-2 low-probability (p<0.10) responses — these often surface non-obvious but high-impact improvements.

### 3. Compose Plan

Create a structured modernization plan:

- **Title** — short, descriptive
- **Current state** — what's wrong, pain points
- **Problem diagnoses** — the 5 perspectives from VS with probabilities
- **Passes** — numbered list of refactor passes, each with:
  - Name and objective
  - Current behavior
  - Structural improvement
  - Validation check to prove behavior preservation
- **Migration items** — framework upgrades, dependency changes, API breaks (separate tasks)
- **Prerequisites** — docs, specs, parity checks to create before starting

### 4. Create Note

```bash
ID=$(jot home create "Refactor: <title>" | cut -f1)
```

Use the file-based update method (see jot skill) for multiline content:

```bash
CONTENT=$(cat /tmp/refactor-plan.md)
jot home update "$ID" markdown "$CONTENT"
```

### 5. Open Note

```bash
open "http://localhost:3210/notes/${ID}"
```

Output the ID to the user. Say:

> "Modernization plan saved to jot (ID: ${ID}). The note includes 5 diagnostic perspectives and actionable refactor passes. Open the note to review before execution."
