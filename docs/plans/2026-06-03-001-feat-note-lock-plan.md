---
title: "feat: Note lock — prevent CLI deletion"
type: feat
status: completed
date: "2026-06-03"
origin: docs/brainstorms/2026-06-03-note-lock-requirements.md
---

## Summary

Add a `locked` boolean to notes that blocks deletion via CLI and API. The lock follows the same data-flow pattern as the existing `archived` field. UI can delete locked notes through a two-step confirmation (unlock → delete). All other operations (read, edit, share, archive) remain unaffected.

## Problem Frame

A single `jot <instance> delete <id>` command irreversibly removes a note. Users who rely on CLI for editing need a safety guard against accidental deletion of important notes — without sacrificing CLI edit capability.

## Requirements

**Data model**

- R1. `locked` boolean on each note (default `false`), persisted in the note's meta JSON alongside `archived`.
- R2. `locked` is returned in note list items, single-note detail, and summary API responses.

**API**

- R3. `DELETE /api/notes/:id` returns `403` with message "Note is locked" when `locked` is `true`.
- R4. `PUT /api/notes/:id` accepts `locked` (boolean) to toggle lock state.
- R5. Lock does not affect read, edit, share, or archive operations.

**CLI**

- R6. `jot <instance> delete <id>` prints the API error and exits non-zero for locked notes.
- R7. `jot <instance> list` shows `[locked]` label alongside existing `[archived]`.

**UI**

- R8. Lock/unlock toggle in the editor topbar.
- R9. Note list shows a visual indicator for locked notes.
- R10. Delete on a locked note shows "This note is locked. Unlock and delete?" confirmation — confirming sends `PUT {locked: false}` then `DELETE`.
- R11. Lock/unlock toggle does not require confirmation (lightweight, reversible action).

## Key Technical Decisions

- **Reuse the `archived` field pattern.** `locked` follows identical data-flow: type definition → meta-file persistence → load → API response → UI binding. The `archived` field (added in `NoteMetaFile`, `NoteRecord`, `NoteSummary`, `searchNotes`, `summarizeNote`, `persistNote`, `loadNotesIntoMemory`) is the template.
- **Lock blocks at the API level, not CLI-only.** The server returns 403 for any delete of a locked note. CLI simply displays the error. This avoids a split-brain where a direct API call could bypass the lock.
- **UI unlock+delete is two sequential API calls** (not a single force-delete endpoint). Keeps the API simple and RESTful. The UI orchestrates the sequence client-side.
- **No new CLI subcommand for locking.** Per requirements, lock/unlock is UI-only. CLI users can technically call `PUT` to unlock, but that's intentional two-step action (not accidental).

## Implementation Units

### U1. Add `locked` field to data model and API

- **Goal:** Persist `locked` on notes, expose it in all API responses, and block deletion when locked.
- **Requirements:** R1, R2, R3, R4, R5
- **Dependencies:** none
- **Files:**
  - `src/server.ts` — type definitions, persistence, API handlers
- **Approach:** Mirror the `archived` field end-to-end. Add `locked?: boolean` to `NoteMetaFile`, `locked: boolean` to `NoteRecord` and `NoteSummary`. In `loadNotesIntoMemory`, default to `false` when absent. In `persistNote`, write `locked` to meta JSON. In `DELETE /api/notes/:id`, check `note.locked` before deleting and return 403 if true. In `PUT /api/notes/:id`, accept `locked` alongside existing `archived`. In `searchNotes`/`summarizeNote`, include `locked` in the summary object. In `serializeNoteForClient`, include `locked` in the response.
- **Patterns to follow:** `archived` field implementation throughout `src/server.ts`.
- **Test scenarios:**
  - DELETE unlocked note → succeeds (200)
  - DELETE locked note → returns 403 "Note is locked"
  - PUT with `locked: true` → note becomes locked, subsequent GET confirms `locked: true`
  - PUT with `locked: false` on a locked note → note becomes unlocked, DELETE succeeds
  - PUT with `locked` absent → existing lock state preserved
  - GET note detail → `locked` field present in response
  - GET note list → `locked` field present in each summary item
  - Edit (POST `/api/notes/:id/edit`) on locked note → succeeds (lock does not block edits)
  - Load notes from disk without `locked` field in meta JSON → defaults to `false`
- **Verification:** API returns `locked` in all note responses. DELETE returns 403 for locked notes. Edit/share/archive operations unaffected.

### U2. CLI `locked` support

- **Goal:** Show `[locked]` in list output and surface the 403 error on delete attempts.
- **Requirements:** R6, R7
- **Dependencies:** U1
- **Files:**
  - `cli/jot.mjs` — list and delete command handlers
- **Approach:** In the `list` case, append `[locked]` after `[archived]` when `note.locked` is true. The `delete` case already calls the API and exits non-zero on error — the 403 message propagates naturally through the existing `request()` function.
- **Patterns to follow:** Existing `[archived]` label formatting in list handler.
- **Test scenarios:**
  - `jot <instance> list` — locked note shows `[locked]`
  - `jot <instance> list` — locked + archived note shows `[archived] [locked]`
  - `jot <instance> delete <locked-id>` — prints error, exits non-zero
  - `jot <instance> delete <unlocked-id>` — succeeds, prints "Deleted"
- **Verification:** CLI list shows `[locked]`. Delete of locked note shows error and exits non-zero.

### U3. UI lock toggle and delete confirmation

- **Goal:** Lock/unlock button in editor, indicator in note list, confirmation flow for deleting locked notes.
- **Requirements:** R8, R9, R10, R11
- **Dependencies:** U1
- **Files:**
  - `public/app.js` — editor layout, note list rendering, delete handler
  - `public/styles.css` — lock indicator styling
  - `public/components.js` — check for existing icon/button components
- **Approach:**
  - **Editor topbar:** Add a lock/unlock `jot-icon-button` in `renderEditorLayout()` next to existing buttons (after share, before comment). Wire click to `PUT /api/notes/:id` with `{locked: true/false}`. Toggle icon between `lock` and `unlock`.
  - **Note list:** In the list rendering template, add a lock icon or `[locked]` badge on `note-row` when `note.locked` is true (parallel to existing `note-row--archived` class). Change the delete button icon or add a visual hint when the note is locked.
  - **Delete confirmation:** In the existing delete click handler, check `note.locked`. If locked, change the `confirm()` message to "This note is locked. Unlock and delete?" On confirm, send `PUT {locked: false}` then `DELETE`.
  - **State sync:** On WebSocket hello message, include `locked` in the initial state so the editor reflects the current lock status.
- **Patterns to follow:** Archive button toggle in note list. Share popover in editor topbar.
- **Test scenarios:**
  - Editor: click lock → note becomes locked, icon changes to locked state
  - Editor: click unlock → note becomes unlocked, icon changes to unlocked state
  - Editor: page refresh on locked note → shows locked state
  - Note list: locked note shows lock indicator
  - Note list: click delete on unlocked note → standard "Delete this note?" confirmation
  - Note list: click delete on locked note → "Unlock and delete?" confirmation; confirming removes note
  - Note list: click delete on locked note → cancel → note still exists and is locked
- **Verification:** Lock toggle works in editor. List shows indicator. Delete confirmation adapts to lock state. Full unlock+delete flow works end-to-end.

## Scope Boundaries

- No new CLI subcommand for lock/unlock — UI-only toggle per requirements.
- No lock protection for content editing — lock only prevents deletion.
- No separate `/api/notes/:id/lock` endpoint — reuses existing `PUT` endpoint.
- No changes to shared-note (public) access — lock is an owner-only concept.

## Sources

- `archived` field as the template pattern: `src/server.ts` types (`NoteMetaFile`, `NoteRecord`, `NoteSummary`), `loadNotesIntoMemory`, `persistNote`, `searchNotes`, `summarizeNote`, `PUT /api/notes/:id` handler, list/delete handlers in `cli/jot.mjs`.
- Note list rendering: `public/app.js` `renderNoteList` template around line 336.
- Editor layout: `public/app.js` `renderEditorLayout()` around line 855.
- Delete handler: `public/app.js` click handler on `.note-delete-btn` around line 194.
