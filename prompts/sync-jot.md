---
description: Read note threads, propose replies, wait for confirmation, then resolve and apply edits
argument-hint: 
---

$1


Instance name is `$1`. Read the **jot** skill before starting.

## Workflow

- `jot $1 read <id>` — read note + unresolved threads
- For each unresolved thread: `reply` with a proposed change, tell the user what you proposed, **wait for confirmation**
- After confirmation: `resolve` the thread, `edit` the note if the thread requires changes

## Rules

- No confirmation → don't resolve, don't edit
- All replies and edits in Russian