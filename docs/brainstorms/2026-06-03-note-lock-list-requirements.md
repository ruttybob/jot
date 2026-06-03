# Note Lock: List-Level Lock & Locked Tab

**Date:** 2026-06-03
**Status:** active

## Problem

Lock toggle currently lives only inside the note editor. To lock a note you must open it first. There's no way to see all locked notes at a glance — they mix into the active list with only a small lock icon indicator.

## What We're Building

1. **Lock/unlock button on each note row** in the note list (alongside the existing archive and delete buttons). Clicking it toggles `locked` on that note via `PUT /api/notes/:id` with `{ locked: true/false }`.

2. **"Locked" tab** in the list sidebar — a third tab alongside "Active" and "Archive". Selecting it filters the note list to only locked notes, following the exact same pattern as the Archive tab (`state.archiveTab` → `state.listTab`, API query param).

The lock toggle in the editor topbar remains unchanged — both entry points control the same `locked` field.

## Scope

- Add lock/unlock icon button to each note row in the list (visible on both Active and Archive tabs)
- Add "Locked" tab to the tab bar (`Active | Archive | Locked`)
- Filter notes by `locked=true` when the Locked tab is selected
- Remove the static lock indicator icon from note rows (replaced by the interactive toggle button)
- Keep editor topbar lock button as-is

## Out of Scope

- Changes to server API (already supports `locked` in PUT and returns it in list responses)
- Changes to CLI
- Batch lock/unlock operations
- Lock reason or metadata beyond the boolean

## Success Criteria

- Can lock/unlock a note directly from the note list without opening it
- "Locked" tab shows only locked notes
- Editor lock button still works and stays in sync with list state
