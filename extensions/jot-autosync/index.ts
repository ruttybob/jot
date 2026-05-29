/**
 * jot-autosync — automatic spec/plan publishing to jot
 *
 * Commands:
 *   /jot            — select jot instance (saved globally)
 *   /jot:public <path> — publish file to jot manually
 *   /jot:open       — open jot instance in browser
 *   /jot:pull       — download all tracked notes back to local files
 *
 * Autosync: watches .superpowers/plans/ and .superpowers/specs/ for
 * new/changed .md files and publishes them to jot.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";
import type { AutocompleteItem } from "@earendil-works/pi-tui";
import { execFileSync, execSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
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

/** Validate instance name: only safe characters allowed. */
function safeInstanceName(name: string): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    throw new Error(`Invalid jot instance name: "${name}"`);
  }
  return name;
}

function saveGlobalInstance(name: string): void {
  const validated = safeInstanceName(name);
  const dir = dirname(GLOBAL_INSTANCE_FILE);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(GLOBAL_INSTANCE_FILE, validated, "utf-8");
}

function loadGlobalInstance(): string {
  try {
    const raw = readFileSync(GLOBAL_INSTANCE_FILE, "utf-8").trim();
    if (!raw) return "self";
    return safeInstanceName(raw);
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
    const out = execFileSync("jot", ["instances"], {
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
      try {
        return safeInstanceName(entry.data.instance);
      } catch {
        return undefined;
      }
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

// ── Autosync helpers ────────────────────────────────────────────

const DEBOUNCE_MS = 500;
const ARCHIVED_REFRESH_MS = 5 * 60 * 1000; // 5 minutes

interface WatcherState {
  watchers: import("node:fs").FSWatcher[];
  fileToNote: Map<string, string>; // absPath → noteId
  debounceTimers: Map<string, NodeJS.Timeout>;
  archivedIds: Set<string>; // cached set of archived note IDs
  archivedRefreshTimer: NodeJS.Timeout | null;
  ui: any | null; // ctx.ui reference for notifications
}

/** Fetch all archived note IDs for the instance. */
function fetchArchivedIds(instanceName: string): Set<string> {
  try {
    const out = execFileSync("jot", [instanceName, "list", "--archived"], {
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
  const createOut = execFileSync("jot", [instanceName, "create", title], {
    encoding: "utf-8",
    timeout: 10000,
  });
  const noteId = createOut.trim().split(/\s+/)[0];
  if (!noteId) throw new Error(`Failed to create note: ${createOut}`);

  uploadBody(instanceName, noteId, content);
  return noteId;
}

/** Update an existing jot note body. */
function updateNote(
  instanceName: string,
  noteId: string,
  content: string,
): void {
  uploadBody(instanceName, noteId, content);
}

/** Read note body from jot. Strips metadata header and comments section. */
function readNoteBody(instanceName: string, noteId: string): string {
  const out = execFileSync("jot", [instanceName, "read", noteId], {
    encoding: "utf-8",
    timeout: 10000,
  });

  // Strip comments section ("--- Comments ---" and everything after)
  const commentsIdx = out.indexOf("\n--- Comments ---");
  const withoutComments = commentsIdx !== -1 ? out.substring(0, commentsIdx) : out;

  // Strip metadata header: lines starting with "# " (title, id, updated, share)
  const lines = withoutComments.split("\n");
  let bodyStart = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("# ")) continue;
    // First non-header, non-empty line marks body start
    if (line.trim() === "") {
      bodyStart = i + 1;
      continue;
    }
    // First non-header, non-empty content line
    bodyStart = i;
    break;
  }
  return lines.slice(bodyStart).join("\n").trim();
}

/** Upload body content to a jot note via tmp file. */
function uploadBody(
  instanceName: string,
  noteId: string,
  content: string,
): void {
  const tmpFile = `/tmp/jot-autosync-${noteId}.md`;
  writeFileSync(tmpFile, content, "utf-8");
  try {
    // jot CLI doesn't support stdin for body — must use $() expansion
    execSync(
      `CONTENT=$(cat '${tmpFile}') && jot ${instanceName} update ${noteId} markdown "$CONTENT"`,
      { encoding: "utf-8", timeout: 15000 },
    );
  } finally {
    unlinkSync(tmpFile);
  }
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

      // Validate before saving
      try {
        safeInstanceName(instanceName);
      } catch {
        ctx.ui.notify(`Invalid instance name: ${instanceName}`, "error");
        return;
      }

      // Save globally
      saveGlobalInstance(instanceName);

      // Save in session too
      pi.appendEntry(CUSTOM_TYPE_INSTANCE, { instance: instanceName });

      ctx.ui.notify(`Selected jot instance: ${instanceName}`, "info");
    },
  });

  // ── /jot:public <path> — publish file manually ───────────────
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
        const noteId = createNote(instanceName, title, content);

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

  // ── /jot:open — open jot instance in browser ─────────────────
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
        execFileSync("open", [url], { timeout: 5000 });
        ctx.ui.notify(`Opened ${instanceName}: ${url}`, "info");
      } catch (err: any) {
        ctx.ui.notify(`Failed to open: ${err.message}`, "error");
      }
    },
  });

  // ── /jot:pull — download all tracked notes back to files ─────
  pi.registerCommand("jot:pull", {
    description: "Download all tracked jot notes back to their local files",
    handler: async (_args, ctx) => {
      if (state.fileToNote.size === 0) {
        ctx.ui.notify("No tracked files to pull. Autosync tracks files created during this session.", "warning");
        return;
      }

      const instanceName = getActiveInstance(ctx);
      let pulled = 0;
      let failed = 0;

      for (const [absPath, noteId] of state.fileToNote) {
        try {
          const body = readNoteBody(instanceName, noteId);
          writeFileSync(absPath, body + "\n", "utf-8");
          pulled++;
        } catch (err: any) {
          failed++;
          console.error(`jot-autosync: failed to pull ${noteId} → ${absPath}:`, err.message);
        }
      }

      if (failed > 0) {
        ctx.ui.notify(`Pulled ${pulled} notes, ${failed} failed`, "warning");
      } else {
        ctx.ui.notify(`Pulled ${pulled} notes from ${instanceName}`, "info");
      }
    },
  });

  // ── Layer 2: fs.watch + initial sync ──────────────────────────

  const state: WatcherState = {
    watchers: [],
    fileToNote: new Map(),
    debounceTimers: new Map(),
    archivedIds: new Set(),
    archivedRefreshTimer: null,
    ui: null,
  };

  function syncFile(
    absPath: string,
    subDir: "plans" | "specs",
    cwd: string,
  ): void {
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
        state.ui?.notify(
          `jot-autosync: updated ${existingNoteId} ← ${basename(absPath)}`,
          "info",
        );
      } catch (err: any) {
        console.error(`jot-autosync: failed to update ${absPath}:`, err.message);
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
        state.ui?.notify(
          `jot-autosync: created ${noteId} ← ${basename(absPath)}`,
          "info",
        );
      } catch (err: any) {
        console.error(`jot-autosync: failed to create note for ${absPath}:`, err.message);
      }
    }
  }

  function setupWatcher(
    dirPath: string,
    subDir: "plans" | "specs",
    cwd: string,
  ): void {
    if (!existsSync(dirPath)) return;

    const watcher = watch(dirPath, (_eventType, filename) => {
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

  /** Periodically refresh the archived IDs cache. */
  function startArchivedRefresh(instanceName: string): void {
    stopArchivedRefresh();
    state.archivedRefreshTimer = setInterval(() => {
      try {
        state.archivedIds = fetchArchivedIds(instanceName);
      } catch (err: any) {
        console.error("jot-autosync: failed to refresh archived IDs:", err.message);
      }
    }, ARCHIVED_REFRESH_MS);
  }

  function stopArchivedRefresh(): void {
    if (state.archivedRefreshTimer) {
      clearInterval(state.archivedRefreshTimer);
      state.archivedRefreshTimer = null;
    }
  }

  /**
   * Restore fileToNote mapping at session start.
   * Scans jot notes and matches titles like "<project>/<plans|specs>/<filename>"
   * back to local .md files.
   */
  function restoreFileMapping(cwd: string, instanceName: string): void {
    const projectName = basename(cwd);
    const prefix = `${projectName}/`;

    // Build expected titles for existing local files
    const expectedTitles = new Map<string, string>(); // title → absPath
    for (const subDir of ["plans", "specs"] as const) {
      const dirPath = join(cwd, ".superpowers", subDir);
      if (!existsSync(dirPath)) continue;
      try {
        for (const entry of readdirSync(dirPath)) {
          if (!entry.endsWith(".md")) continue;
          const title = `${projectName}/${subDir}/${entry}`;
          expectedTitles.set(title, join(dirPath, entry));
        }
      } catch {
        // Directory not readable
      }
    }

    if (expectedTitles.size === 0) return;

    // Fetch jot notes and match
    try {
      const out = execFileSync("jot", [instanceName, "list"], {
        encoding: "utf-8",
        timeout: 10000,
      });
      for (const line of out.trim().split("\n")) {
        if (!line.trim()) continue;
        // Format: id\ttitle\tdate
        const tabIdx = line.indexOf("\t");
        if (tabIdx === -1) continue;
        const noteId = line.substring(0, tabIdx);
        const rest = line.substring(tabIdx + 1);
        // Title is between first and second tab
        const titleEnd = rest.indexOf("\t");
        const title = titleEnd === -1 ? rest : rest.substring(0, titleEnd);

        const absPath = expectedTitles.get(title);
        if (absPath) {
          state.fileToNote.set(absPath, noteId);
        }
      }
    } catch (err: any) {
      console.error("jot-autosync: failed to restore file mapping:", err.message);
    }
  }

  // ── Layer 1: tool_call interception ──────────────────────────

  /**
   * Check if a file path belongs to .superpowers/{plans,specs}/*.md
   * and return the subDir if it does, or undefined otherwise.
   */
  function classifyPath(absPath: string, cwd: string): "plans" | "specs" | undefined {
    const rel = relative(cwd, absPath);
    const match = rel.match(/^\.superpowers\/(plans|specs)\/.+\.md$/);
    return (match?.[1] as "plans" | "specs") || undefined;
  }

  pi.on("tool_call", async (event, _ctx) => {
    // Intercept write tool
    if (isToolCallEventType("write", event)) {
      const subDir = classifyPath(resolve(event.input.path), process.cwd());
      if (!subDir) return;

      // Defer sync — let the write complete first, then sync from disk
      // Use setImmediate so we don't block the tool execution
      const absPath = resolve(event.input.path);
      const cwd = process.cwd();
      setImmediate(() => {
        try {
          syncFile(absPath, subDir, cwd);
        } catch (err: any) {
          console.error(`jot-autosync: tool_call sync failed for ${absPath}:`, err.message);
        }
      });
      return;
    }

    // Intercept edit tool — edit modifies existing files, sync after
    if (isToolCallEventType("edit", event)) {
      const subDir = classifyPath(resolve(event.input.path), process.cwd());
      if (!subDir) return;

      const absPath = resolve(event.input.path);
      const cwd = process.cwd();
      setImmediate(() => {
        try {
          syncFile(absPath, subDir, cwd);
        } catch (err: any) {
          console.error(`jot-autosync: tool_call sync failed for ${absPath}:`, err.message);
        }
      });
      return;
    }
  });

  /**
   * Initial sync: create jot notes for local .superpowers/{plans,specs}/*.md
   * files that don't yet have a jot note (no mapping in fileToNote).
   */
  function initialSync(cwd: string, instanceName: string): void {
    let created = 0;
    for (const subDir of ["plans", "specs"] as const) {
      const dirPath = join(cwd, ".superpowers", subDir);
      if (!existsSync(dirPath)) continue;
      try {
        for (const entry of readdirSync(dirPath)) {
          if (!entry.endsWith(".md")) continue;
          const absPath = join(dirPath, entry);
          if (state.fileToNote.has(absPath)) continue; // already mapped
          try {
            syncFile(absPath, subDir, cwd);
            created++;
          } catch (err: any) {
            console.error(`jot-autosync: initial sync failed for ${absPath}:`, err.message);
          }
        }
      } catch {
        // Directory not readable
      }
    }
    if (created > 0) {
      console.log(`jot-autosync: initial sync created ${created} notes`);
    }
  }

  // ── Lifecycle events ──────────────────────────────────────────

  pi.on("session_start", async (_event, ctx) => {
    const cwd = ctx.cwd;

    // Store ui reference for notifications from syncFile
    state.ui = ctx.ui;

    // Refresh archived IDs cache
    const instanceName = loadGlobalInstance();
    state.archivedIds = fetchArchivedIds(instanceName);

    // Restore file→note mapping from previous sessions
    restoreFileMapping(cwd, instanceName);

    // Initial sync: create jot notes for files that exist locally
    // but have no jot note yet (e.g. created before extension loaded)
    initialSync(cwd, instanceName);

    // Setup watchers for .superpowers/plans and .superpowers/specs
    const plansDir = join(cwd, ".superpowers", "plans");
    const specsDir = join(cwd, ".superpowers", "specs");

    setupWatcher(plansDir, "plans", cwd);
    setupWatcher(specsDir, "specs", cwd);

    // Start periodic archived IDs refresh
    if (state.watchers.length > 0) {
      startArchivedRefresh(instanceName);
    }

    if (state.watchers.length > 0 && ctx.hasUI) {
      ctx.ui.notify(
        `jot-autosync: watching .superpowers/{plans,specs}/ → ${instanceName}`,
        "info",
      );
    }
  });

  pi.on("session_shutdown", async () => {
    // Stop archived refresh timer
    stopArchivedRefresh();

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
    state.ui = null;
  });
}
