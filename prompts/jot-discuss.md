---
description: "Run a structured discussion, save perspectives to jot"
argument-hint: "<discussion topic>"
---

# Structured Discussion

<goal>
$@
</goal>

Run a multi-perspective discussion on the topic and save it as a note in jot. Use the **jot** skill for all jot commands.

Always include frontmatter with `tags:` — use `discussion` plus topic-specific tags (e.g. `tags: discussion, architecture, api`).

## Before Writing

If anything is unclear about the discussion context or what to capture — use the `questionnaire` tool to ask the user before composing the summary. Do not guess.

## Discussion Strategy (Verbalized Sampling)

Discussions are open-ended — multiple equally valid perspectives exist. Use Verbalized Sampling to avoid mode collapse and explore diverse viewpoints.

### Step 1. Generate Perspectives

Generate 5 distinct perspectives on the topic. For each perspective, provide:

```
<response>
  <text>[viewpoint summary]</text>
  <probability>[how common this angle is, 0.0–1.0]</probability>
</response>
```

Each perspective should represent a genuinely different angle — not variations of the same idea. Prioritize diversity: a mainstream view, a contrarian take, a practical concern, a long-term strategic angle, an unconventional insight.

Keep probabilities below 0.30 per response to stay in the diverse tail of the distribution.

### Step 2. Explore & Synthesize

For each perspective:
- What evidence supports it?
- What are the blind spots?
- How does it interact with other perspectives?

Then synthesize:
- **Key decisions** — what was agreed on across perspectives
- **Open questions** — what remains unresolved
- **Next steps** — concrete actions emerging from the discussion

### Step 3. Compose Note

Structure the note as a discussion document:

```markdown
# Discussion: <topic>

## Perspectives

### 1. <perspective title> (p=<probability>)
<summary>

### 2. <perspective title> (p=<probability>)
<summary>

...

## Synthesis
- **Decisions:** ...
- **Open questions:** ...
- **Next steps:** ...
```

### Step 4. Create Note

```bash
ID=$(jot home create "Discussion: <topic>" | cut -f1)
```

Use the file-based update method (see jot skill) for multiline content:

```bash
CONTENT=$(cat /tmp/discussion-note.md)
jot home update "$ID" markdown "$CONTENT"
```

### Step 5. Open Note

```bash
open "http://localhost:3210/notes/${ID}"
```

Output the ID to the user. Say:

> "Discussion saved to jot (ID: ${ID}). The note includes 5 diverse perspectives with synthesis."
