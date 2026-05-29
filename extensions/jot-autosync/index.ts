/**
 * jot-autosync — automatic spec/plan publishing to jot
 *
 * Commands:
 *   /jot            — select jot instance (saved globally)
 *   /jot:public <path> — publish file to jot manually
 *   /jot:open       — open jot instance in browser
 *   /jot:pull       — download all tracked notes back to local files
 *
 * Autosync: intercepts write/edit tool calls for .superpowers/{plans,specs}/*.md
 * and publishes them to jot.
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

// ── Sync state ──────────────────────────────────────────────────

interface SyncState {
  fileToNote: Map<string, string>; // absPath → noteId
  ui: any | null; // ctx.ui reference for notifications
}

// ── jot note operations ─────────────────────────────────────────

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

  // ── Sync state ────────────────────────────────────────────────

  const state: SyncState = {
    fileToNote: new Map(),
    ui: null,
  };

  // ── tool_call interception ───────────────────────────────────

  /**
   * Check if a file path belongs to .superpowers/{plans,specs}/*.md
   * and return the subDir if it does, or undefined otherwise.
   */
  function classifyPath(absPath: string, cwd: string): "plans" | "specs" | undefined {
    const rel = relative(cwd, absPath);
    const match = rel.match(/^\.superpowers\/(plans|specs)\/.+\.md$/);
    return (match?.[1] as "plans" | "specs") || undefined;
  }

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
      try {
        updateNote(instanceName, existingNoteId, content);
        state.ui?.notify(
          `jot-autosync: updated ${existingNoteId} ← ${basename(absPath)}`,
          "info",
        );
      } catch (err: any) {
        console.error(`jot-autosync: failed to update ${absPath}:`, err.message);
        state.fileToNote.delete(absPath);
      }
    } else {
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

  pi.on("tool_call", async (event, _ctx) => {
    // Intercept write tool
    if (isToolCallEventType("write", event)) {
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

    // Intercept edit tool
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

  // ── Lifecycle events ──────────────────────────────────────────

  pi.on("session_start", async (_event, ctx) => {
    state.ui = ctx.ui;
  });

  pi.on("session_shutdown", async () => {
    state.fileToNote.clear();
    state.ui = null;
  });
}
