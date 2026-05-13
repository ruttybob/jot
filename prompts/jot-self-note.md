---
description: Save a personal note, idea, or reflection to jot self-instance (port 3211)
argument-hint: "<note topic>"
---

$@

Save a personal note to the **self** instance (port 3211, data in `~/Documents/self-notes`). Use instance name `self` for all jot commands. Use the **jot** skill. Frontmatter: `tags: personal, <topic-tags>`.

**Before writing** — if unclear what to capture, use `questionnaire`. Do not guess.

## Note

Free-form — no mandatory structure. Title + body: thoughts, ideas, reflections, decisions.

## Save to jot

```bash
ID=$(jot self create "<title>" | cut -f1)
CONTENT=$(cat /tmp/personal-note.md)
jot self update "$ID" markdown "$CONTENT"
open "http://localhost:3211/notes/${ID}"
```
