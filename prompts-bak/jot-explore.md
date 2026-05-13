---
description: "Save exploration results to jot"
argument-hint: "<exploration topic>"
---

# Save Exploration Document

<goal>
$@
</goal>

Capture research / analysis results as a note in jot. Use the **jot** skill for all jot commands.

Always include frontmatter with `tags:` — use `exploration` plus topic-specific tags (e.g. `tags: exploration, postgres, indexing`).

## Before Writing

If anything is unclear about the exploration scope or expected output — use the `questionnaire` tool to ask the user before composing the document. Do not guess.

## Steps

### 1. Compose Document

Analyze `<goal>` and the work done. Create a document:

- **Topic** — what was explored
- **Findings** — key discoveries, free form
- **Conclusions** — what was determined

### 2. Create Note

```bash
ID=$(jot home create "<topic>" | cut -f1)
jot home update "$ID" markdown "---\ntags: exploration, <topics>\n---\n\n# Topic\n\n## Findings\n...\n\n## Conclusions\n..."
```

### 3. Open Note

```bash
open "http://localhost:3210/notes/${ID}"
```
