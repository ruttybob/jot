# jot

pi extension for working with jot instances.

## Commands

```text
/jot                 — select jot instance (saved globally)
/jot:public          — pick a final agent response → publish to jot → open
/jot:public <path>   — publish file to jot → open
/jot:open [noteId]   — open jot instance or specific note in browser
```

## Modules

- `extensions/jot/index.ts` — all code in one file:
  - `getAgentEndMessages` — filter final assistant responses (no tool_use blocks) from session branch
  - `buildNoteTitle` — first line (without #) + HH:MM
  - `pickAgentEndMessage` — overlay picker (SelectList + frameBox)
  - `openJotUrl` — cmux `new-surface --pane <identify>` or system browser
  - `parseCmuxCallerPane` / `resolveCmuxCallerPane` — cmux caller-detection pane resolution
  - `createNote` — two-step jot CLI (create + update markdown)
  - `getActiveInstance` — session > global config > "self"

## Instance config

- Global: `~/.config/jot/pi-default-instance` (instance name)
- Session: `jot-selected-instance` custom entry (fallback)

## cmux pane targeting

`openJotUrl` resolves the pane via `cmux identify` caller-detection
(`caller.pane_ref`), not the focused pane. `CMUX_PANEL_ID` env var is misnamed
(holds surface UUID, not pane id). Cached for process lifetime.

## Tests

```sh
npm test   # vitest with stubs for pi SDK
```

- `tests/stubs/@earendil-works/pi-coding-agent.ts` — ExtensionAPI + SessionEntry types
- `tests/stubs/@earendil-works/pi-tui.ts` — SelectList/Container/Text no-op stubs + types
