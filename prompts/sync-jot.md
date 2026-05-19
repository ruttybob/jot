---
description: Review comments on the note just created in this session, reply, wait for approval, then resolve and update
argument-hint: "<note-id>"
---

$@

## Language

- Russian: all replies, edits, and comments in Russian.


`jot main read <id>` — read the note + unresolved threads.

For each unresolved thread:
- `reply` with an answer or proposed change
- Tell the user what you replied / proposed
- **Wait** for user to confirm

After user confirms:
- `resolve` the thread
- `edit` the note if this thread requires changes

No confirmation — don't resolve, don't touch the note.
