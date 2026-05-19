---
name: jot
description: >
  Use when the user wants to interact with a jot instance — list, read, create,
  edit, comment, reply, or manage notes and threads via the jot CLI. Notes, writes
---

## Language

All jot notes, titles, and content must be in **Russian** (unless the topic itself is in English).

## Prerequisites

```bash
jot register <instance> https://jot.example.com <api-key>
jot instances    # verify
jot <instance> list  # verify
```

## Commands

```bash
# Notes
jot <inst> list                                    # list active notes (default)
jot <inst> list --archived                         # list archived only
jot <inst> list --archived=any                     # list all (active + archived)
jot <inst> search "query"                          # search active notes
jot <inst> search "query" --archived               # search archived only
jot <inst> read <id>                               # read note (markdown + thread/message IDs)
jot <inst> read-threads <id>                          # read only comments (no note body, minimal context)
jot <inst> create "Title"                          # create note → returns id
jot <inst> edit <id> '[{"oldText":"…","newText":"…"}]'  # precise replacements (same as edit tool)
jot <inst> update <id> title "New title"           # update metadata
jot <inst> update <id> markdown "$CONTENT"         # update body (see multiline below)
jot <inst> delete <id>
jot <inst> archive <id>                            # move to archive
jot <inst> unarchive <id>                          # restore from archive

# Threads
jot <inst> comment <id> "quoted text" "body"       # new thread (quote must match note exactly)
jot <inst> reply <id> <tid> <mid> "body"           # reply in thread
jot <inst> resolve <id> <tid>                      # ✅ always resolve when done
jot <inst> reopen <id> <tid>                       # reopen if needed
jot <inst> delete-thread <id> <tid>                # delete thread entirely

# Comments
jot <inst> edit-comment <id> <mid> "new body"
jot <inst> delete-comment <id> <mid>
```

## Multiline Content

⚠️ Literal `\n` in shell strings does NOT work. Always write to file first:

```bash
CONTENT=$(cat /tmp/note-content.md)
jot <inst> update "$ID" markdown "$CONTENT"
```

Heredoc is OK for short content (1–5 lines, no backticks/pipes/`$`):

```bash
CONTENT=$(cat <<'EOF'
Short text here.
EOF
)
```

## Workflow

1. **Read first** — `read` before editing/commenting to get current content and IDs.
   Use `read-threads` instead when you only need thread/message IDs (e.g., before `reply`, `resolve`, `edit-comment`). This avoids loading the full note body into context.
2. **Edit precisely** — smallest unique `oldText`, no large surrounding context.
3. **Comment on specifics** — quoted text must exactly match a span in the note.
4. **Resolve threads** — always `resolve` when the question is answered or decision is final.
5. **Verify** — `read` again after `edit` or `comment` to confirm.
6. **Archive completed** — `archive` notes that are no longer active to keep the list clean.
