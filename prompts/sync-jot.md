---
description: Read note threads, propose replies, wait for confirmation, then resolve and apply edits
argument-hint: 
---

- `jot $1 read-threads <id>` — read unresolved threads
- For each unresolved thread: `reply` with a proposed change, tell the user what you proposed, **wait for confirmation**
- After confirmation: `resolve` the thread, `edit` the note if the thread requires changes

## Rules

- No confirmation → don't resolve, don't edit
- All replies and edits in Russian
