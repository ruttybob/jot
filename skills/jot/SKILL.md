---
name: jot
description: >
  Use when the user wants to interact with a jot instance — list, read, create,
  edit, comment, reply, or manage notes and threads via the jot CLI. Notes, writes
---

## Prerequisites

The `jot` CLI must be installed and a server registered:

```bash
jot register <instance> https://jot.example.com <api-key>
# or for shared access:
jot register <instance> https://jot.example.com/s/<share-id>
```
1. Verify: `jot instances`
2. Verify: `jot <instance> list`

## Commands

### Notes

```bash
# List all notes
jot <instance> list

# Search notes
jot <instance> search "query"

# Read a note (markdown body + thread/message IDs)
jot <instance> read <note-id>

# Create a new note
jot <instance> create "Note title"

# Edit a note — array of precise replacements
jot <instance> edit <note-id> '[{"oldText":"...","newText":"..."}]'

# Update note metadata (title)
jot <instance> update <note-id> title "New title"

# Delete a note
jot <instance> delete <note-id>
```

### Comments & Threads

```bash
# Comment on quoted text in a note
jot <instance> comment <note-id> "quoted text" "comment body"

# Reply to a specific message in a thread
jot <instance> reply <note-id> <thread-id> <message-id> "reply body"

# Edit a comment
jot <instance> edit-comment <note-id> <message-id> "new body"

# Delete a comment
jot <instance> delete-comment <note-id> <message-id>

# Resolve a thread
jot <instance> resolve <note-id> <thread-id>

# Reopen a thread
jot <instance> reopen <note-id> <thread-id>

# Delete a thread
jot <instance> delete-thread <note-id> <thread-id>
```

## Editing Notes

The `edit` command takes a JSON array of replacement objects. Each object has:
- `oldText` — exact text to find in the note (must be unique)
- `newText` — replacement text

This is the same semantics as the `edit` tool: precise, non-overlapping replacements.

```bash
# Single replacement
jot my-jot edit abc123 '[{"oldText":"old paragraph","newText":"new paragraph"}]'

# Multiple replacements in one call
jot my-jot edit abc123 '[{"oldText":"foo","newText":"bar"},{"oldText":"baz","newText":"qux"}]'
```

## Workflow

1. **Read first**: always `read` the note before editing or commenting to get the current content and thread IDs.
2. **Edit precisely**: use the smallest unique `oldText` that identifies the target. Avoid large surrounding context.
3. **Comment on specifics**: the quoted text in `comment` must exactly match a span in the note.
4. **Verify**: after `edit` or `comment`, `read` the note again to confirm the change.
