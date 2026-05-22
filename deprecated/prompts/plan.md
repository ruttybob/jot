---
description: Create a summary plan and save to jot
argument-hint: "<task description>"
---

## Language

- Russian: all plan content, notes, comments, and jot entries must be written in Russian.

$@

Create a structured summary plan and save to jot. Frontmatter: `tags: plan, <topic-tags>`.

**Before writing** — if scope or approach is unclear, use `ask_user_question`. Do not guess.
If subagents are available — use them proactively for research and planning.

**Important:** Plan only. Do not start implementation, do not create files, do not write code. Save the plan to jot and stop.

## Plan structure

- **Goal** — 1-2 sentences
- **Context** — prerequisites, constraints, inputs
- **Steps** — numbered, atomic, verifiable
- **Done criteria** — how to know it's complete
- **Risks / open questions**

## Save to jot

Read the **jot** skill before executing any jot commands. The skill contains the full command reference and workflow details.
Write plan to a temp file first, then pass via `$(cat /tmp/file)`. Never inline large content directly into shell commands.

```bash
cat > /tmp/plan-note.md << 'PLAN_EOF'
<plan content here>
PLAN_EOF

ID=$(jot main create "Plan: <title>" | cut -f1)
jot main update "$ID" markdown "$(cat /tmp/plan-note.md)"
SHARE_URL=$(jot main share "$ID" comment | cut -f3)
open "$SHARE_URL"
```

Output the ID: `Plan saved to jot (ID: ${ID}).`
