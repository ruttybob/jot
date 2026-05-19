---
description: Explain a concept, code, or architecture — save clear write-up to jot
argument-hint: "<topic or path to explain>"
---

$@

Explain the given topic and save a clear, structured write-up to jot. Frontmatter: `tags: explain, <topic-tags>`.

**Before writing** — if the question is ambiguous, use `questionnaire`. Do not guess.
If subagents are available — use them proactively: `web-search` for internet research, `code-search` for docs/codebase lookup, `scout` for fast recon. Delegate freely to parallelise.

## Approach

Determine context automatically:
- **External topic** (concept, technology, pattern) — research via web/docs, synthesise from multiple sources.
- **Code/architecture** (file path, module, system) — read source, trace data flow, map dependencies.
- **Mixed** — combine both: explain external concept applied to concrete codebase.

Target audience: a developer who is smart but unfamiliar with this specific topic. Clarity over completeness.

## Note structure

```markdown
# <topic>

## TL;DR
One paragraph — what this is and why it matters.

## Explanation
<structured explanation — use headings, diagrams, code examples as needed>

## Key takeaways
- ...

## Further reading
- <links, files, docs>
```

## Save to jot

Read the **jot** skill before executing any jot commands. The skill contains the full command reference and workflow details.
Write note to a temp file first, then pass via `$(cat /tmp/file)`. Never inline large content directly into shell commands.

```bash
cat > /tmp/explain-note.md << 'EOF'
<note content here>
EOF

ID=$(jot self create "Explain: <title>" | cut -f1)
jot self update "$ID" markdown "$(cat /tmp/explain-note.md)"
SHARE_URL=$(jot self share "$ID" comment | cut -f3)
open "$SHARE_URL"
```
