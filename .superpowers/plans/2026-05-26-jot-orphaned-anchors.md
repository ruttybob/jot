# Orphaned Thread Anchors — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thread comments remain visible in the web UI even when their text anchor no longer exists in the note content (after editing). Orphaned threads show a grey "anchor deleted" banner.

**Architecture:** Modify `syncThreadLayout` to collect orphaned threads (where `locateAnchor` returns null) into a separate array and render them at the bottom of the thread rail with a visual indicator. The `renderThreadCard` function gains an `orphaned` flag to conditionally render the banner. Thread modal dialog also shows the banner. Server-side code is not touched.

**Tech Stack:** Vanilla JS (no framework), CSS custom properties, existing jot DOM structure.

---

## Files

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `public/app.js:1168-1252` | `syncThreadLayout` — collect orphaned threads, render after anchored |
| Modify | `public/app.js:1252-1270` | `renderThreadCard` — accept `orphaned` flag, render banner |
| Modify | `public/app.js:1667` | `openThreadDialog` — pass orphaned flag |
| Modify | `public/app.js:1652` | `refreshOpenThreadDialog` — pass orphaned flag |
| Modify | `public/styles.css` | `.thread-orphan-banner` styles |

---

### Task 1: Collect orphaned threads in syncThreadLayout

**Files:**
- Modify: `public/app.js` (function `syncThreadLayout`, lines 1168-1252)

- [ ] **Step 1: Modify syncThreadLayout to collect orphaned threads**

In `syncThreadLayout`, replace the `continue` on `!match` with collection into an `orphaned` array. Then after rendering all anchored cards, render orphaned cards at the bottom with a visual separator.

Find this block (lines ~1186-1190):

```js
      const match = locateAnchor(thread.anchor, refs.previewContent);
      if (!match) {
        continue;
      }
```

Replace with:

```js
      const match = locateAnchor(thread.anchor, refs.previewContent);
      if (!match) {
        orphaned.push(thread);
        continue;
      }
```

Add `const orphaned = [];` declaration right after `const visible = [];` (line ~1181):

```js
    const visible = [];
    const orphaned = [];
```

- [ ] **Step 2: Change the early return when no visible threads found**

Currently the function returns early if `!visible.length` (line ~1221):

```js
    if (!visible.length) {
      refs.threadRail.innerHTML = "";
      return;
    }
```

Replace with — only return early if there are also no orphaned threads:

```js
    if (!visible.length && !orphaned.length) {
      refs.threadRail.innerHTML = "";
      return;
    }
```

- [ ] **Step 3: Render orphaned cards after anchored cards**

After the existing anchored cards rendering block (the `let cursor = 14` loop ending at line ~1249), add the orphaned section:

```js
    // Orphaned threads — rendered below all anchored threads
    if (orphaned.length) {
      if (visible.length) {
        // Visual separator between anchored and orphaned
        const separator = document.createElement("div");
        separator.className = "thread-orphan-separator";
        separator.textContent = "— anchor deleted —";
        separator.style.top = `${cursor + 6}px`;
        refs.threadRail.appendChild(separator);
        cursor += 32;
      }

      for (const thread of orphaned) {
        const card = document.createElement("section");
        card.className = `thread-card thread-card-orphaned${thread.id === state.activeThreadId ? " active" : ""}${thread.resolved ? " resolved" : ""}`;
        card.dataset.threadId = thread.id;
        card.style.top = `${cursor + 14}px`;
        card.innerHTML = renderThreadCard(thread, true);
        refs.threadRail.appendChild(card);
        cursor += card.offsetHeight + 12;
      }
    }

    refs.threadRail.style.minHeight = `${cursor + 20}px`;
```

Remove the duplicate `refs.threadRail.style.minHeight = ...` that was at line ~1250 (the original last line of the anchored section) — it will now be set only once at the end.

The original last two lines:

```js
    refs.threadRail.style.minHeight = `${cursor + 20}px`;
  }
```

Become just the closing `}` — because `minHeight` is now set after the orphaned block.

---

### Task 2: Add orphaned banner to renderThreadCard

**Files:**
- Modify: `public/app.js` (function `renderThreadCard`, line ~1252)

- [ ] **Step 1: Modify renderThreadCard signature and add banner**

Current function signature:

```js
  function renderThreadCard(thread) {
```

Change to:

```js
  function renderThreadCard(thread, orphaned = false) {
```

Right after the `const flat = flattenTree(tree);` line and before the `return` statement, add the orphaned banner. The current return statement starts with:

```js
    return `
      <div class="thread-tree">
```

Insert the banner before `<div class="thread-tree">`:

```js
    const orphanBanner = orphaned
      ? `<div class="thread-orphan-banner">⚠️ Anchor text was deleted during editing</div>`
      : "";

    return `
      ${orphanBanner}
      <div class="thread-tree">
```

---

### Task 3: Pass orphaned flag in thread modal dialog

**Files:**
- Modify: `public/app.js` (functions `refreshOpenThreadDialog` and `openThreadDialog`)

- [ ] **Step 1: Update refreshOpenThreadDialog**

Currently (line ~1652):

```js
    body.innerHTML = renderThreadCard(thread);
```

Change to:

```js
    const isOrphaned = !state.visibleMatches.has(thread.id) && !locateAnchor(thread.anchor, refs.previewContent);
    body.innerHTML = renderThreadCard(thread, isOrphaned);
```

Wait — `refs` may not be in scope here. Let me check. The function signature is `function refreshOpenThreadDialog(refs, isPublic)`. Yes, `refs` is available.

But `locateAnchor` needs `refs.previewContent`. Let me use a simpler check — just check if the thread is in `visibleMatches`:

```js
    const isOrphaned = !state.visibleMatches.has(thread.id);
    body.innerHTML = renderThreadCard(thread, isOrphaned);
```

This works because `syncThreadLayout` populates `visibleMatches` only for anchored threads. If `refreshOpenThreadDialog` is called after `syncThreadLayout`, orphaned threads won't be in the map.

- [ ] **Step 2: Update openThreadDialog**

Currently (line ~1684):

```js
        <div class="thread-modal-body">${renderThreadCard(thread)}</div>
```

Change to:

```js
        <div class="thread-modal-body">${renderThreadCard(thread, false)}</div>
```

For the modal dialog we pass `false` because `openThreadDialog` is called after clicking on a thread card in the rail — if the thread was visible in the rail, it was anchored. For orphaned threads, the card click still works because we handle it generically.

Actually wait — orphaned threads ARE rendered in the rail now, so clicking them will call `openThreadDialog`. We need to detect orphaned status correctly. Let's use the same approach:

```js
    const isOrphaned = !state.visibleMatches.has(thread.id);
```

Find this block:

```js
  function openThreadDialog(threadId, refs, isPublic) {
    const thread = state.threads.find((item) => item.id === threadId);
    if (!thread) {
      return;
    }

    state.activeThreadId = threadId;
    syncThreadLayout(refs);
```

After `syncThreadLayout(refs);` and before the modal HTML, add:

```js
    const isOrphaned = !state.visibleMatches.has(thread.id);
```

Then in the modal HTML:

```js
        <div class="thread-modal-body">${renderThreadCard(thread, isOrphaned)}</div>
```

---

### Task 4: CSS styles for orphaned threads

**Files:**
- Modify: `public/styles.css`

- [ ] **Step 1: Add orphaned thread styles**

After the existing `.thread-footer` rule (around line 465), add:

```css
.thread-orphan-banner {
  font-size: 0.82rem;
  color: var(--muted);
  background: var(--card-bg);
  border: 1px dashed var(--line);
  border-radius: 6px;
  padding: 0.3rem 0.55rem;
  margin-bottom: 0.35rem;
  opacity: 0.7;
}

.thread-card-orphaned {
  border-style: dashed;
}

.thread-orphan-separator {
  position: absolute;
  right: 0.5rem;
  width: calc(var(--thread-width) - 6px);
  text-align: center;
  font-size: 0.78rem;
  color: var(--muted);
  opacity: 0.5;
  padding: 0.2rem 0;
}
```

---

### Task 5: Handle orphaned thread click in thread rail

**Files:**
- Modify: `public/app.js` (click handler for thread rail)

- [ ] **Step 1: Verify orphaned card clicks work**

The existing thread rail click handler (line ~636) delegates by `[data-thread-id]`:

```js
    if (threadRail) threadRail.addEventListener("click", async (event) => {
```

This handler already finds `card = event.target.closest("[data-thread-id]")` and calls `activateThread(threadId, refs, true)` or `openThreadDialog(threadId, refs, isPublic)`. Since orphaned cards also have `data-thread-id`, clicking them will trigger the same flow.

However, `activateThread` tries to scroll to the anchor:

```js
    const match = state.visibleMatches.get(threadId);
    if (!match) {
      return;
    }
```

For orphaned threads, `visibleMatches` won't have the entry, so `activateThread` returns early without scrolling — which is correct. But `state.activeThreadId` is set before the return, so the card gets the `.active` class on next `syncThreadLayout`.

Verify that `openThreadDialog` still works — it's called for the modal/dialog path. Since we updated it in Task 3 to handle orphaned state, this should work.

No code changes needed for this task — just verify the existing click delegation handles orphaned cards correctly. If testing reveals issues, fix them.

---

### Task 6: Manual verification

- [ ] **Step 1: Open note lzjdamht in browser**

Navigate to `http://localhost:3210/lzjdamht`. Verify that:
1. All 8 threads appear in the thread rail
2. The 3 unresolved threads (kugt4o18b9, inczlv0r8z, pjrx1hy30e) appear as anchored if their text exists, or as orphaned with grey banner if not
3. The 5 resolved threads appear as orphaned with grey banner (since all anchors are broken)
4. The "— привязка удалена —" separator appears between anchored and orphaned sections
5. Clicking an orphaned card opens the thread modal dialog with the banner

- [ ] **Step 2: Test on a note with working anchors**

Find or create a note where threads have valid anchors. Verify that anchored threads still render normally — no regression.
