---
description: Structured multi-perspective discussion with Verbalized Sampling — save to jot
argument-hint: "<discussion topic>"
---

$@

Run a multi-perspective discussion and save to jot. Use the **jot** skill. Frontmatter: `tags: discussion, <topic-tags>`.

**Before writing** — if context is unclear, use `questionnaire`. Do not guess.

## Verbalized Sampling

Generate 5 distinct perspectives to avoid mode collapse. Vary angles: mainstream, contrarian, practical, strategic, unconventional. Keep probabilities below 0.30.

```
<response>
  <text>[viewpoint summary]</text>
  <probability>[0.0–1.0]</probability>
</response>
```

For each perspective — evidence, blind spots, interactions with others.

## Note structure

```markdown
# Discussion: <topic>

## Perspectives
### 1. <title> (p=<probability>)
<summary + analysis>

### 2. <title> (p=<probability>)
...

## Synthesis
- **Decisions:** ...
- **Open questions:** ...
- **Next steps:** ...
```

## Save to jot

```bash
ID=$(jot main create "Discussion: <topic>" | cut -f1)
CONTENT=$(cat /tmp/discussion-note.md)
jot main update "$ID" markdown "$CONTENT"
open "http://localhost:3210/notes/${ID}"
```
