---
date: "2026-06-03"
topic: note-lock
---

## Summary

Add a `locked` flag to notes that prevents deletion via CLI. Locked notes can still be read and edited through CLI. Deletion of a locked note is only possible through the UI, where the user must explicitly confirm an unlock-and-delete action.

## Requirements

**Note data model**

- R1. Each note has a boolean `locked` field (default `false`).
- R2. `locked` is persisted in the note's meta JSON alongside existing fields (`archived`, `shareAccess`, etc.).
- R3. `locked` is returned in API responses: note list items, single note detail, and note summary.

**API behavior**

- R4. `DELETE /api/notes/:id` returns `403` with a descriptive error (e.g. "Note is locked") when `locked` is `true`.
- R5. `PUT /api/notes/:id` accepts `locked` (boolean) to toggle the lock state. This is the only way to change `locked` — there is no separate endpoint.
- R6. Lock status does not affect any other operations: read, edit, share, archive/unarchive all work regardless of `locked`.

**CLI**

- R7. `jot <instance> delete <id>` prints the API error ("Note is locked") and exits non-zero when the note is locked.
- R8. `jot <instance> list` shows a `[locked]` label next to locked notes (similar to existing `[archived]` label).

**UI**

- R9. A lock/unlock toggle is available on each note — in the note editor view (toolbar or header area).
- R10. The note list view shows a visual indicator (lock icon or label) for locked notes.
- R11. Attempting to delete a locked note from the UI shows a confirmation: "This note is locked. Unlock and delete?" — confirming sends `PUT {locked: false}` then `DELETE`.
- R12. The lock toggle in the editor does not require confirmation — locking/unlocking is a lightweight, reversible action.

## Acceptance Examples

- AE1. **Locked note resists CLI delete**
  - **Given** a note with `locked: true`
  - **When** user runs `jot myserver delete <id>`
  - **Then** CLI prints "Note is locked" and exits with non-zero code. Note still exists.

- AE2. **UI deletes locked note after confirmation**
  - **Given** a note with `locked: true`
  - **When** user clicks delete in the UI and confirms "Unlock and delete?"
  - **Then** UI sends `PUT` to unlock, then `DELETE`. Note is removed.

- AE3. **Lock toggle is instant**
  - **Given** an unlocked note open in the editor
  - **When** user clicks the lock toggle
  - **Then** note becomes locked immediately, no confirmation dialog.

- AE4. **Locked note is still editable via CLI**
  - **Given** a note with `locked: true`
  - **When** user runs `jot myserver edit <id> '[{"oldText":"x","newText":"y"}]'`
  - **Then** edit succeeds. Only deletion is blocked.

## Scope Boundaries

- Lock does not protect against content modification — only deletion.
- Lock is a safety guard against accidental one-command deletion, not a security feature. A user with API access can unlock then delete in two steps.
- No new CLI subcommand for locking/unlocking — the user stated this should be UI-only.
