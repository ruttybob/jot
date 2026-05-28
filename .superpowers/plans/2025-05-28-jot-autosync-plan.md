# jot-autosync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pi-расширение, автоматически публикующее файлы из `.superpowers/plans/` и `.superpowers/specs/` как заметки в jot, с командами `/jot`, `/jot:public`, `/jot:open`.

**Architecture:** Глобальное pi-расширение `~/.pi/agent/extensions/jot-autosync/index.ts` с `fs.watch` на `.superpowers/{plans,specs}/`. При создании/изменении `.md` файлов — синхронизация с jot через CLI. Глобальный выбор инстанса через файл `~/.config/jot/pi-default-instance`.

**Tech Stack:** TypeScript, Node.js `fs.watch`, jot CLI, pi ExtensionAPI

---

## File Structure

```
~/.pi/agent/extensions/jot-autosync/
└── index.ts              ← Весь код расширения
```

Существующий `extensions/jot.ts` в проекте jot — не трогаем, но после миграции можно удалить.

---

### Task 1: Extension skeleton + global instance config

**Files:**
- Create: `~/.pi/agent/extensions/jot-autosync/index.ts`

- [ ] **Step 1: Create extension directory**

```bash
mkdir -p ~/.pi/agent/extensions/jot-autosync
```

- [ ] **Step 2: Write skeleton with global instance helpers + `/jot` command**

```typescript
/**
 * jot-autosync — automatic spec/plan publishing to jot
 *
 * Commands:
 *   /jot            — select jot instance (saved globally)
 *   /jot:public <path> — publish file to jot manually
 *   /jot:open       — open jot instance in browser
 *
 * Autosync: watches .superpowers/plans/ and .superpowers/specs/ for
 * new/changed .md files and publishes them to jot.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { AutocompleteItem } from "@earendil-works/pi-tui";
import { execSync } from "node:child_process";
import {
  existsSync,
  readdirSync,
  statSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  watch,
} from "node:fs";
import { resolve, basename, dirname, relative, join } from "node:path";
import { homedir } from "node:os";

// ── Global instance config ──────────────────────────────────────

const GLOBAL_INSTANCE_FILE = join(
  homedir(),
  ".config",
  "jot",
  "pi-default-instance",
);
const CUSTOM_TYPE_INSTANCE = "jot-selected-instance";

function saveGlobalInstance(name: string): void {
  const dir = dirname(GLOBAL_INSTANCE_FILE);
  if (!existsSync(dir)) {
    execSync(`mkdir -p "${dir}"`, { encoding: "utf-8" });
  }
  writeFileSync(GLOBAL_INSTANCE_FILE, name, "utf-8");
}

function loadGlobalInstance(): string {
  try {
    return readFileSync(GLOBAL_INSTANCE_FILE, "utf-8").trim() || "self";
  } catch {
    return "self";
  }
}

// ── jot CLI helpers ─────────────────────────────────────────────

interface JotInstance {
  name: string;
  url: string;
  description: string;
}

function parseInstances(output: string): JotInstance[] {
  return output
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/\s+/);
      return {
        name: parts[0],
        url: parts[1] || "",
        description: parts.slice(2).join(" "),
      };
    });
}

function getInstances(): JotInstance[] {
  try {
    const out = execSync("jot instances", {
      encoding: "utf-8",
      timeout: 5000,
    });
    return parseInstances(out);
  } catch {
    return [];
  }
}

function getInstanceUrl(instanceName: string): string | undefined {
  return getInstances().find((i) => i.name === instanceName)?.url;
}

/** Restore instance from session entries (fallback). */
function restoreInstanceFromSession(ctx: {
  sessionManager: any;
}): string | undefined {
  for (const entry of ctx.sessionManager.getEntries()) {
    if (
      entry.type === "custom" &&
      entry.customType === CUSTOM_TYPE_INSTANCE &&
      entry.data?.instance
    ) {
      return entry.data.instance;
    }
  }
  return undefined;
}

/** Get the active jot instance name: session > global > "self" */
function getActiveInstance(ctx: {
  sessionManager: any;
}): string {
  return restoreInstanceFromSession(ctx) || loadGlobalInstance();
}

// ── Extension ───────────────────────────────────────────────────

export default function jotAutosyncExtension(pi: ExtensionAPI) {
  // ── /jot — select instance (saves globally) ──────────────────
  pi.registerCommand("jot", {
    description: "Select a jot instance (saved globally)",
    handler: async (_args, ctx) => {
      const instances = getInstances();
      if (instances.length === 0) {
        ctx.ui.notify(
          "No jot instances registered. Run: jot register <name> <url> <key>",
          "warning",
        );
        return;
      }

      const items = instances.map(
        (inst) => `${inst.name}  (${inst.url})  ${inst.description}`.trim(),
      );

      const current = getActiveInstance(ctx);
      const selected = await ctx.ui.select(
        `Select jot instance (current: ${current})`,
        items,
      );
      if (!selected) return;

      const instanceName = selected.split(/\s+/)[0];

      // Save globally
      saveGlobalInstance(instanceName);

      // Save in session too
      pi.appendEntry(CUSTOM_TYPE_INSTANCE, { instance: instanceName });

      ctx.ui.notify(`Selected jot instance: ${instanceName}`, "info");
    },
  });
}
```

- [ ] **Step 3: Verify extension loads**

```bash
pi -e ~/.pi/agent/extensions/jot-autosync/index.ts -p "test"
```

Expected: no errors in output, extension loads.

- [ ] **Step 4: Commit skeleton**

```bash
cd ~/.pi/agent/extensions/jot-autosync
git init  # if not already in a git repo
# Or if tracked differently — just note it's created
```

---

### Task 2: `/jot:public` command

**Files:**
- Modify: `~/.pi/agent/extensions/jot-autosync/index.ts`

- [ ] **Step 1: Add `/jot:public` command inside the extension factory**

Add after the `/jot` command registration, inside `jotAutosyncExtension`:

```typescript
  // ── /jot:public <path> — publish file manually ──────────────
  pi.registerCommand("jot:public", {
    description: "Publish a file to jot: /jot:public <path>",
    getArgumentCompletions: (prefix: string): AutocompleteItem[] | null => {
      const cwd = process.cwd();
      const expanded = prefix.startsWith("~")
        ? prefix.replace("~", process.env.HOME || "~")
        : prefix;
      const absPrefix = expanded.startsWith("/") ? expanded : join(cwd, expanded);

      let dir: string;
      let partial: string;
      try {
        const s = statSync(absPrefix);
        if (s.isDirectory()) {
          dir = absPrefix;
          partial = "";
        } else {
          dir = dirname(absPrefix);
          partial = basename(absPrefix);
        }
      } catch {
        dir = dirname(absPrefix);
        partial = basename(absPrefix);
      }

      let entries: string[];
      try {
        entries = readdirSync(dir);
      } catch {
        return null;
      }

      const hidden = partial.startsWith(".");
      const filtered = entries
        .filter(
          (e) =>
            (hidden || !e.startsWith(".")) &&
            e.toLowerCase().startsWith(partial.toLowerCase()),
        )
        .sort((a, b) => a.localeCompare(b))
        .slice(0, 30);

      if (filtered.length === 0) return null;

      return filtered.map((name) => {
        const fullPath = join(dir, name);
        const isDir = statSync(fullPath).isDirectory();
        const relPath = relative(cwd, fullPath);
        const display = relPath.startsWith("..") ? fullPath : relPath;
        return {
          value: isDir ? display + "/" : display,
          label: isDir ? name + "/" : name,
          description: isDir ? undefined : relative(cwd, dir) || ".",
        };
      });
    },
    handler: async (args, ctx) => {
      const filePath = args.trim();
      if (!filePath) {
        ctx.ui.notify("Usage: /jot:public <path-to-file>", "warning");
        return;
      }

      const instanceName = getActiveInstance(ctx);
      if (!instanceName) {
        ctx.ui.notify("No jot instance selected. Run /jot first.", "warning");
        return;
      }

      const absPath = resolve(ctx.cwd, filePath);
      if (!existsSync(absPath)) {
        ctx.ui.notify(`File not found: ${absPath}`, "error");
        return;
      }

      const content = readFileSync(absPath, "utf-8");

      const now = new Date();
      const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      const relDir = dirname(relative(ctx.cwd, absPath));
      const fileBase = basename(absPath);
      const title =
        relDir && relDir !== "."
          ? `${relDir}/${fileBase}-${time}`
          : `${fileBase}-${time}`;

      try {
        const createOut = execSync(
          `jot ${instanceName} create ${JSON.stringify(title)}`,
          { encoding: "utf-8", timeout: 10000 },
        );

        const noteId = createOut.trim().split(/\s+/)[0];
        if (!noteId) {
          ctx.ui.notify(`Failed to create note: ${createOut}`, "error");
          return;
        }

        const tmpFile = `/tmp/jot-pi-${noteId}.md`;
        writeFileSync(tmpFile, content, "utf-8");
        try {
          execSync(
            `CONTENT=$(cat '${tmpFile}') && jot ${instanceName} update ${noteId} markdown "$CONTENT"`,
            { encoding: "utf-8", timeout: 15000 },
          );
        } finally {
          unlinkSync(tmpFile);
        }

        ctx.ui.notify(
          `Created note "${title}" (${noteId}) in ${instanceName}`,
          "info",
        );

        pi.sendMessage(
          {
            customType: "jot-published",
            content: `Published \`${filePath}\` → jot **${instanceName}** / ${noteId} ("${title}")`,
            display: true,
            details: { absPath, instance: instanceName, noteId, title },
          },
          { triggerTurn: false },
        );
      } catch (err: any) {
        ctx.ui.notify(`Error: ${err.message}`, "error");
      }
    },
  });
```

- [ ] **Step 2: Verify `/jot:public` loads**

```bash
pi -e ~/.pi/agent/extensions/jot-autosync/index.ts -p "test"
```

Expected: no errors.

---

### Task 3: `/jot:open` command

**Files:**
- Modify: `~/.pi/agent/extensions/jot-autosync/index.ts`

- [ ] **Step 1: Add `/jot:open` command inside the extension factory**

Add after `/jot:public`:

```typescript
  // ── /jot:open — open jot instance in browser ────────────────
  pi.registerCommand("jot:open", {
    description: "Open jot instance in browser",
    handler: async (_args, ctx) => {
      const instanceName = getActiveInstance(ctx);
      const url = getInstanceUrl(instanceName);

      if (!url) {
        ctx.ui.notify(
          `Could not find URL for instance "${instanceName}". Run /jot to select one.`,
          "error",
        );
        return;
      }

      try {
        execSync(`open "${url}"`, { encoding: "utf-8", timeout: 5000 });
        ctx.ui.notify(`Opened ${instanceName}: ${url}`, "info");
      } catch (err: any) {
        ctx.ui.notify(`Failed to open: ${err.message}`, "error");
      }
    },
  });
```

- [ ] **Step 2: Test `/jot:open`**

```bash
pi -e ~/.pi/agent/extensions/jot-autosync/index.ts
# Type: /jot:open
```

Expected: browser opens the jot instance URL.

---

### Task 4: File watcher + autosync (core)

**Files:**
- Modify: `~/.pi/agent/extensions/jot-autosync/index.ts`

This is the main feature. Add the watcher logic inside the extension factory.

- [ ] **Step 1: Add watcher types and publish helper**

Add before the extension factory function (top-level helpers):

```typescript
// ── Autosync helpers ───────────────────────────────────────────

const DEBOUNCE_MS = 500;

interface WatcherState {
  watchers: import("node:fs").FSWatcher[];
  fileToNote: Map<string, string>; // absPath → noteId
  debounceTimers: Map<string, NodeJS.Timeout>;
  archivedIds: Set<string>; // cached set of archived note IDs
}

/** Fetch all archived note IDs for the instance. */
function fetchArchivedIds(instanceName: string): Set<string> {
  try {
    const out = execSync(`jot ${instanceName} list --archived`, {
      encoding: "utf-8",
      timeout: 10000,
    });
    const ids = new Set<string>();
    for (const line of out.trim().split("\n")) {
      if (!line.trim()) continue;
      const id = line.split(/\s+/)[0];
      if (id) ids.add(id);
    }
    return ids;
  } catch {
    return new Set();
  }
}

/** Create a jot note and upload body content. Returns noteId. */
function createNote(
  instanceName: string,
  title: string,
  content: string,
): string {
  const createOut = execSync(
    `jot ${instanceName} create ${JSON.stringify(title)}`,
    { encoding: "utf-8", timeout: 10000 },
  );
  const noteId = createOut.trim().split(/\s+/)[0];
  if (!noteId) throw new Error(`Failed to create note: ${createOut}`);

  // Upload body via tmp file
  const tmpFile = `/tmp/jot-autosync-${noteId}.md`;
  writeFileSync(tmpFile, content, "utf-8");
  try {
    execSync(
      `CONTENT=$(cat '${tmpFile}') && jot ${instanceName} update ${noteId} markdown "$CONTENT"`,
      { encoding: "utf-8", timeout: 15000 },
    );
  } finally {
    unlinkSync(tmpFile);
  }

  return noteId;
}

/** Update an existing jot note body. */
function updateNote(
  instanceName: string,
  noteId: string,
  content: string,
): void {
  const tmpFile = `/tmp/jot-autosync-${noteId}.md`;
  writeFileSync(tmpFile, content, "utf-8");
  try {
    execSync(
      `CONTENT=$(cat '${tmpFile}') && jot ${instanceName} update ${noteId} markdown "$CONTENT"`,
      { encoding: "utf-8", timeout: 15000 },
    );
  } finally {
    unlinkSync(tmpFile);
  }
}
```

- [ ] **Step 2: Add watcher setup and event handler inside extension factory**

Add inside `jotAutosyncExtension`, after all command registrations:

```typescript
  // ── Autosync watcher ─────────────────────────────────────────

  const state: WatcherState = {
    watchers: [],
    fileToNote: new Map(),
    debounceTimers: new Map(),
    archivedIds: new Set(),
  };

  function syncFile(absPath: string, subDir: "plans" | "specs", cwd: string): void {
    const instanceName = loadGlobalInstance();

    if (!existsSync(absPath)) {
      // File deleted/moved — stop tracking
      state.fileToNote.delete(absPath);
      return;
    }

    const content = readFileSync(absPath, "utf-8");
    const existingNoteId = state.fileToNote.get(absPath);

    if (existingNoteId) {
      // Existing file — check if archived
      if (state.archivedIds.has(existingNoteId)) {
        state.fileToNote.delete(absPath);
        return;
      }
      try {
        updateNote(instanceName, existingNoteId, content);
      } catch (err: any) {
        // If update fails (note deleted?), stop tracking
        state.fileToNote.delete(absPath);
      }
    } else {
      // New file — create note
      const projectName = basename(cwd);
      const fileName = basename(absPath);
      const title = `${projectName}/${subDir}/${fileName}`;

      try {
        const noteId = createNote(instanceName, title, content);
        state.fileToNote.set(absPath, noteId);
      } catch (err: any) {
        // Will retry on next change
      }
    }
  }

  function setupWatcher(dirPath: string, subDir: "plans" | "specs", cwd: string): void {
    if (!existsSync(dirPath)) return;

    const watcher = watch(dirPath, (eventType, filename) => {
      if (!filename || !filename.endsWith(".md")) return;

      const absPath = join(dirPath, filename);

      // Debounce per file
      const existing = state.debounceTimers.get(absPath);
      if (existing) clearTimeout(existing);

      state.debounceTimers.set(
        absPath,
        setTimeout(() => {
          state.debounceTimers.delete(absPath);
          syncFile(absPath, subDir, cwd);
        }, DEBOUNCE_MS),
      );
    });

    state.watchers.push(watcher);
  }

  // ── Lifecycle events ──────────────────────────────────────────

  pi.on("session_start", async (_event, ctx) => {
    const cwd = ctx.cwd;

    // Refresh archived IDs cache
    const instanceName = loadGlobalInstance();
    state.archivedIds = fetchArchivedIds(instanceName);

    // Setup watchers for .superpowers/plans and .superpowers/specs
    const plansDir = join(cwd, ".superpowers", "plans");
    const specsDir = join(cwd, ".superpowers", "specs");

    setupWatcher(plansDir, "plans", cwd);
    setupWatcher(specsDir, "specs", cwd);

    if (state.watchers.length > 0 && ctx.hasUI) {
      ctx.ui.notify(
        `jot-autosync: watching .superpowers/{plans,specs}/ → ${instanceName}`,
        "info",
      );
    }
  });

  pi.on("session_shutdown", async () => {
    // Close all watchers
    for (const w of state.watchers) {
      w.close();
    }
    state.watchers = [];

    // Clear debounce timers
    for (const timer of state.debounceTimers.values()) {
      clearTimeout(timer);
    }
    state.debounceTimers.clear();

    // Clear maps
    state.fileToNote.clear();
    state.archivedIds.clear();
  });
```

- [ ] **Step 3: Test autosync end-to-end**

```bash
# Start pi with the extension in a project that has .superpowers
pi -e ~/.pi/agent/extensions/jot-autosync/index.ts

# In another terminal, create a test plan file:
echo "# Test plan\n\nThis is a test." > .superpowers/plans/2025-05-28-test-plan.md

# Check jot — should see a new note:
jot self list | head -5
```

Expected: new note appears in jot with title `<project>/plans/2025-05-28-test-plan.md`.

- [ ] **Step 4: Test update sync**

```bash
# Modify the file:
echo "# Test plan v2\n\nUpdated content." > .superpowers/plans/2025-05-28-test-plan.md

# Wait 1 second, then check jot:
jot self read <noteId>
```

Expected: note body updated with new content.

- [ ] **Step 5: Test archived skip**

```bash
# Archive the note in jot:
jot self archive <noteId>

# Modify the file again:
echo "# Test plan v3\n\nAfter archive." > .superpowers/plans/2025-05-28-test-plan.md

# Check jot — note should NOT be updated:
jot self read <noteId>
```

Expected: archived note not updated, file removed from Map.

- [ ] **Step 6: Cleanup test file**

```bash
rm .superpowers/plans/2025-05-28-test-plan.md
```

---

### Task 5: Integration test — full workflow

**Files:**
- No new files

- [ ] **Step 1: Start pi normally (extension is auto-discovered)**

Extension at `~/.pi/agent/extensions/jot-autosync/index.ts` — auto-discovered by pi (global location).

```bash
pi
# In a project with .superpowers/
```

- [ ] **Step 2: Verify `/jot` command works**

Type `/jot` — should show instance selector. Select one.

- [ ] **Step 3: Verify `/jot:open` opens browser**

Type `/jot:open` — should open jot URL in browser.

- [ ] **Step 4: Verify `/jot:public` publishes a file**

```bash
# In pi session:
echo "test content" > /tmp/test-jot.md
```

Type `/jot:public /tmp/test-jot.md` — should create note.

- [ ] **Step 5: Verify autosync picks up new spec**

Create a file in `.superpowers/specs/` and confirm it appears in jot.

- [ ] **Step 6: Commit**

If using a git-tracked location for the extension:

```bash
git add -A
git commit -m "feat: jot-autosync extension with watcher, /jot, /jot:public, /jot:open"
```

---

### Task 6: Migrate — remove old extension

**Files:**
- Delete: `extensions/jot.ts` (in the jot project)

- [ ] **Step 1: Verify new extension fully replaces old one**

Check that all commands from old `extensions/jot.ts` work:
- `/jot` — instance selection
- `/jot:public` — file publishing (was `/jot-public`)

- [ ] **Step 2: Remove old extension**

```bash
rm extensions/jot.ts
git add -A
git commit -m "chore: remove old jot extension (replaced by global jot-autosync)"
```
