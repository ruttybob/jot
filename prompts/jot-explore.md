---
description: Save exploration/research results with diverse findings to jot
argument-hint: "<exploration topic>"
---

$@

Capture research findings and save to jot. Use the **jot** skill. Frontmatter: `tags: exploration, <topic-tags>`.

**Before writing** — if scope is unclear, use `questionnaire`. Do not guess.

## Verbalized Sampling

Generate 5 diverse findings — not just the first obvious answer. Vary angles: direct observations, second-order effects, edge cases, cross-domain parallels, non-obvious patterns.

```
<response>
  <text>[finding description]</text>
  <probability>[0.0–1.0]</probability>
</response>
```

## Note structure

```markdown
# <topic>

## Findings
### 1. <title> (p=<probability>)
<description + evidence>

### 2. <title> (p=<probability>)
...

## Conclusions
- ...
```

## Save to jot

```bash
ID=$(jot main create "<topic>" | cut -f1)
CONTENT=$(cat /tmp/exploration-note.md)
jot main update "$ID" markdown "$CONTENT"
open "http://localhost:3210/notes/${ID}"
```
