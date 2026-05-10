---
description: "Save discussion summary to jot"
argument-hint: "<discussion topic>"
---

# Save Discussion Summary

<goal>
$@
</goal>

Summarize the discussion and save it as a note in jot. Use the **jot** skill for all jot commands.

Always include frontmatter with `tags:` — use `discussion` plus topic-specific tags (e.g. `tags: discussion, architecture, api`).

## Before Writing

If anything is unclear about the discussion context or what to capture — use the `questionnaire` tool to ask the user before composing the summary. Do not guess.

## Steps

### 1. Compose Summary

Analyze `<goal>` and discussion context. Create a brief document:

- **Topic** — what was discussed
- **Key decisions** — what was agreed on, bullet points
- **Next steps** — what to do next (if any)
- **Open questions** — what remains unresolved (if any)

### 2. Create Note

```bash
ID=$(jot home create "Discussion: <topic>" | cut -f1)
jot home update "$ID" markdown "---\ntags: discussion, <topics>\n---\n\n# Topic\n\n## Decisions\n- ..."
```

### 3. Open Note

```bash
open "http://localhost:3210/notes/${ID}"
```
