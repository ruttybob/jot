---
description: "Save exploration results with diverse findings to jot"
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

## Exploration Strategy (Verbalized Sampling)

Research often yields multiple valid interpretations. Use Verbalized Sampling to surface diverse findings rather than converging on the first obvious answer.

### Step 1. Generate Diverse Findings

Generate 5 key findings about the topic. For each finding, provide:

```
<response>
  <text>[finding description]</text>
  <probability>[how likely this would be discovered first, 0.0–1.0]</probability>
</response>
```

Vary the angles: direct observations, second-order effects, edge cases, cross-domain parallels, and non-obvious patterns.

### Step 2. Compose Document

Structure the exploration note:

```markdown
# <topic>

## Findings

### 1. <finding title> (p=<probability>)
<description and evidence>

### 2. <finding title> (p=<probability>)
<description and evidence>

...

## Conclusions
- ...
```

### Step 3. Create Note

```bash
ID=$(jot home create "<topic>" | cut -f1)
```

Use the file-based update method (see jot skill) for multiline content:

```bash
CONTENT=$(cat /tmp/exploration-note.md)
jot home update "$ID" markdown "$CONTENT"
```

### Step 4. Open Note

```bash
open "http://localhost:3210/notes/${ID}"
```

Output the ID to the user. Say:

> "Exploration saved to jot (ID: ${ID}). The note includes 5 diverse findings with conclusions."
