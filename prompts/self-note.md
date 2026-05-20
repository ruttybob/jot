---
description: Save a personal note, idea, or reflection to jot self-instance
argument-hint: "<note topic>"
---

$@

Save a personal note to the **self** instance. Use instance name `self` for all jot commands. Frontmatter: `tags: personal, <topic-tags>`.

**Before writing** — if unclear what to capture, use `ask_user_question`. Do not guess.
If subagents are available — use them proactively for research and context gathering.

## Note

Free-form — no mandatory structure. Title + body: thoughts, ideas, reflections, decisions.

## Save to jot

Read the **jot** skill before executing any jot commands. The skill contains the full command reference and workflow details.
Write note to a temp file first, then pass via `$(cat /tmp/file)`. Never inline large content directly into shell commands.

```bash
cat > /tmp/personal-note.md << 'EOF'
<note content here>
EOF

ID=$(jot self create "<title>" | cut -f1)
jot self update "$ID" markdown "$(cat /tmp/personal-note.md)"
open "http://localhost:3211/notes/${ID}"
```
