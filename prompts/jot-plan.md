---
description: "Create a summary plan and save to jot"
argument-hint: "<task description>"
---

# Create Summary Plan

<goal>
$@
</goal>

Create a structured plan and save it as a note in jot. Use the **jot** skill for all jot commands.

Always include frontmatter with `tags:` — use `plan` plus topic-specific tags (e.g. `tags: plan, auth, refactor`).

## Before Writing

If anything is unclear about the goal, scope, or approach — use the `questionnaire` tool to ask the user before composing the plan. Do not guess.

## Steps

### 1. Compose Plan

Analyze `<goal>` and project context. Create a structured plan:

- **Title** — short task/project name
- **Goal** — what to achieve, in 1–2 sentences
- **Context** — prerequisites, constraints, inputs
- **Steps** — numbered list of specific actions; each step should be atomic and verifiable
- **Done criteria** — how to tell the plan is complete
- **Risks / open questions** — if any

### 2. Create Note

```bash
ID=$(jot home create "Plan: <title>" | cut -f1)
```

Use the file-based update method (see jot skill) for multiline content:

```bash
CONTENT=$(cat /tmp/plan-note.md)
jot home update "$ID" markdown "$CONTENT"
```

### 3. Open Note

```bash
open "http://localhost:3210/notes/${ID}"
```
