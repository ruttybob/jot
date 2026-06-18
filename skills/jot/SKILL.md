---
name: jot
description: >
  Use when the user wants to interact with a jot instance — list, search, read,
  create, edit, comment, reply, resolve threads, manage share access, or delete
  notes via the jot CLI.
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
# Instance management
jot instances                                    # list registered instances
jot register <name> <baseUrl> <token>            # register an owner instance (API key)
jot register <name> <baseUrl> <token> --description="…"
jot register <name> <shareUrl>                   # register a shared instance (no token)
jot unregister <name>                            # remove a registered instance

# Notes
jot <inst> list                                  # list all notes: id<TAB>title<TAB>updated[  ][locked]
jot <inst> search "query"                        # search notes by text
jot <inst> read <id>                             # read full note body + comments (thread/message IDs)
jot <inst> read <id> --raw                       # body only — no meta header, no comments (pipe to file)
jot <inst> read <id> --offset=N --limit=M        # paginate a large note (numbered lines, saves context)
jot <inst> read-threads <id>                     # read only comments (no note body, minimal context)
jot <inst> create "Title"                        # create note → prints "id<TAB>title"
jot <inst> edit <id> '[{"oldText":"…","newText":"…"}]'  # precise replacements (same as edit tool)
jot <inst> update <id> title "New title"         # update title (body is preserved)
jot <inst> update <id> markdown "$CONTENT"       # replace full body (title is preserved; see multiline below)
jot <inst> share <id>                            # show current share access + share URL
jot <inst> share <id> comment                    # set share access: none | view | comment | edit
jot <inst> delete <id>                           # delete note permanently

# Threads
jot <inst> comment <id> "quoted text" "body"     # new thread (quote must match note exactly)
jot <inst> reply <id> <tid> <mid> "body"         # reply in thread
jot <inst> resolve <id> <tid>                    # ✅ always resolve when done
jot <inst> reopen <id> <tid>                     # reopen if needed
jot <inst> delete-thread <id> <tid>              # delete thread entirely

# Comments
jot <inst> edit-comment <id> <mid> "new body"
jot <inst> delete-comment <id> <mid>

# Shared instance (registered via `register <name> <shareUrl>`)
jot <inst> read                              # read shared note + comments
jot <inst> read --raw                        # body only (no meta, no comments)
jot <inst> edit '<json edits>'               # edit (requires edit access)
jot <inst> comment "quoted text" "body"     # comment (no note id needed)
jot <inst> reply <tid> <mid> "body"         # reply in thread
jot <inst> comment "quote" "body" --name="My Name"  # override display name (default: "Agent")
```

## Update from File

When the user wants to publish/update a note from an existing file:

```bash
# 1. Create note first (if needed)
ID=$(jot <inst> create "Title" | awk '{print $1}')  # create outputs "id\ttitle"; cut to id only

# 2. Read file content
CONTENT=$(cat <file>)

# 3. Update note body
jot <inst> update "$ID" markdown "$CONTENT"
```

## Round-trip: dump → edit → push

`read --raw` outputs the note body with no meta header and exactly one trailing newline — ideal for redirecting to a file, editing, and pushing back:

```bash
# 1. Dump body to file
jot <inst> read <id> --raw > /tmp/note.md

# 2. Edit /tmp/note.md freely (no meta lines to strip)

# 3. Push back (title is preserved)
jot <inst> update <id> markdown "$(cat /tmp/note.md)"
```

For a slice of a large note, combine with pagination: `read <id> --offset=N --limit=M --raw`.

## Multiline Content

⚠️ **Literal `\n` in shell strings does NOT work** — it produces the two characters `\` and `n`, not a line break. This applies to **all commands**: `update`, `reply`, `comment`, etc.

Always write to file first:

```bash
cat > /tmp/note-content.md << 'EOF'
<content here>
EOF
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
   Use `read <id> --raw` when you need only the body (no meta header, no comments) — e.g. before `update markdown`, to grep/pipe, or to dump to a file.
   For large notes, use `read <id> --offset=N --limit=M` to read a slice.
2. **Edit precisely** — smallest unique `oldText`, no large surrounding context.
3. **Comment on specifics** — quoted text must exactly match a span in the note.
4. **Resolve threads** — always `resolve` when the question is answered or decision is final.
5. **Verify** — `read` again after `edit` or `comment` to confirm.
