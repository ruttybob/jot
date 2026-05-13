---
description: Create a summary plan and save to jot
argument-hint: "<task description>"
---

$@

Create a structured summary plan and save to jot. Use the **jot** skill for all jot commands. Frontmatter: `tags: plan, <topic-tags>`.

**Before writing** — if scope or approach is unclear, use `questionnaire`. Do not guess.

## Plan structure

- **Goal** — 1-2 sentences
- **Context** — prerequisites, constraints, inputs
- **Steps** — numbered, atomic, verifiable
- **Done criteria** — how to know it's complete
- **Risks / open questions**

## Save to jot

```bash
ID=$(jot main create "Plan: <title>" | cut -f1)
CONTENT=$(cat /tmp/plan-note.md)
jot main update "$ID" markdown "$CONTENT"
open "http://localhost:3210/notes/${ID}"
```

Output the ID: `Plan saved to jot (ID: ${ID}).`
