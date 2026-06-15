/**
 * jot — pi extension for working with jot instances.
 *
 * Commands:
 *   /jot            — select jot instance (saved globally)
 *   /jot:public [path] — publish file, or pick an agent response (no args)
 *   /jot:open       — open jot instance in browser
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  Container,
  SelectList,
  Text,
  truncateToWidth,
  visibleWidth,
  type AutocompleteItem,
  type SelectItem,
  type Theme,
  type TUI,
} from "@earendil-works/pi-tui";
import { execFileSync, spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
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

// ── cmux pane resolution ────────────────────────────────

// Cached for process lifetime. Intentional — pane rarely moves mid-session.
let cachedCmuxPane: string | null | undefined;

/** Pure: extract caller.pane_ref from `cmux identify` JSON output. */
export function parseCmuxCallerPane(identifyJson: string): string | null {
  try {
    const parsed = JSON.parse(identifyJson) as {
      caller?: { pane_ref?: unknown };
    };
    const ref = parsed?.caller?.pane_ref;
    return typeof ref === "string" && ref ? ref : null;
  } catch {
    return null;
  }
}

/** Resolve the cmux pane where this process runs, via caller detection. */
async function resolveCmuxCallerPane(): Promise<string | null> {
  if (cachedCmuxPane !== undefined) return cachedCmuxPane;
  const cmuxBin = process.env.CMUX_PI_CMUX_BIN || "cmux";
  const result = await new Promise<string | null>((settle) => {
    let stdout = "";
    let settled = false;
    const child = spawn(cmuxBin, ["identify"], {
      stdio: ["ignore", "pipe", "ignore"],
    });
    child.stdout?.on("data", (c: Buffer) => {
      stdout += c.toString();
    });
    // Node fires both `error` and `close` on spawn failure — settle once.
    const done = (value: string | null) => {
      if (!settled) {
        settled = true;
        settle(value);
      }
    };
    child.once("error", () => done(null));
    child.once("close", () => done(parseCmuxCallerPane(stdout)));
  });
  cachedCmuxPane = result;
  return result;
}

/** Spawn a detached, fire-and-forget process. Resolves on start, rejects on spawn error. */
function spawnDetached(cmd: string, args: string[]): Promise<void> {
  return new Promise<void>((settle) => {
    let settled = false;
    const child = spawn(cmd, args, { stdio: "ignore", detached: true });
    const done = (err?: unknown) => {
      if (settled) return;
      settled = true;
      if (err) settle(Promise.reject(err));
      else { child.unref(); settle(); }
    };
    child.once("error", done);
    child.once("spawn", () => done());
  });
}

/** Open a URL in cmux browser-surface (targeting pi's pane) or system browser. */
async function openJotUrl(ctx: { ui: { notify(m: string, level?: string): void } }, url: string): Promise<void> {
  const inCmux = process.env.CMUX_BUNDLE_ID === "com.cmuxterm.app";
  try {
    if (inCmux) {
      const cmuxBin = process.env.CMUX_PI_CMUX_BIN || "cmux";
      const pane = await resolveCmuxCallerPane();
      const args = ["new-surface", "--type", "browser", "--url", url, "--focus", "true"];
      if (pane) args.push("--pane", pane);
      await spawnDetached(cmuxBin, args);
    } else {
      const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
      const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
      await spawnDetached(cmd, args);
    }
  } catch (err: any) {
    ctx.ui.notify(`Failed to open browser: ${err.message}`, "error");
  }
}

// ── jot note operations ─────────────────────────────────────────

/**
 * Create a jot note with body content. Returns noteId.
 *
 * Two-step (per jot skill pattern):
 *   1. `jot <inst> create <title>` — creates note with empty body, returns `<id>\t<title>`
 *   2. `jot <inst> update <id> markdown <content>` — fills the body
 *
 * The previous one-shot `create <title> markdown <content>` form was broken:
 * `jot create` joins all positional args into the title, so the body was always empty
 * and the title swallowed the literal word `markdown` plus the whole file content.
 */
function createNote(
  instanceName: string,
  title: string,
  content: string,
): string {
  const createOut = execFileSync(
    "jot",
    [instanceName, "create", title],
    { encoding: "utf-8", timeout: 15000 },
  );
  const noteId = createOut.trim().split(/\s+/)[0];
  if (!noteId) throw new Error(`Failed to create note: ${createOut}`);

  execFileSync(
    "jot",
    [instanceName, "update", noteId, "markdown", content],
    { encoding: "utf-8", timeout: 15000 },
  );

  return noteId;
}

// ── Agent-end message picker ────────────────────────────────────

/** First non-blank line of a markdown string, or "" if none. */
function firstMeaningfulLine(markdown: string): string {
  return markdown.split("\n").find((l) => l.trim().length > 0) ?? "";
}

export interface AgentEndMessage {
  /** Sequential index among the returned messages (0-based), NOT the raw branch position. */
  index: number;
  markdown: string;
  preview: string;
}

/**
 * Extract final agent responses (assistant messages without tool_use blocks)
 * from a session branch. Intermediate turns (text + tool_use) are skipped —
 * they represent steps, not the final answer.
 */
export function getAgentEndMessages(branch: any[]): AgentEndMessage[] {
  const messages: AgentEndMessage[] = [];
  let messageIndex = 0;

  for (const entry of branch) {
    if (!entry || entry.type !== "message") continue;
    const message = entry.message;
    if (!message || message.role !== "assistant") continue;

    const content = Array.isArray(message.content) ? message.content : [];
    // Skip intermediate turns: any tool_use block means it's a step, not final.
    if (content.some((c: any) => c?.type === "tool_use")) continue;

    const textBlocks = content.filter(
      (c: any): c is { type: "text"; text: string } =>
        c?.type === "text" && typeof c.text === "string" && c.text.trim().length > 0,
    );
    if (textBlocks.length === 0) continue;

    const markdown = textBlocks.map((c) => c.text).join("\n\n");
    const firstLine = firstMeaningfulLine(markdown);
    const preview = firstLine.trimStart().replace(/^#+\s*/, "").slice(0, 80);
    messages.push({ index: messageIndex, markdown, preview });
    messageIndex++;
  }

  return messages;
}

/**
 * Build a jot note title from an agent response.
 * First meaningful line (without leading #), truncated to 50 chars, + " — HH:MM".
 */
export function buildNoteTitle(markdown: string, now: Date): string {
  const firstLine = firstMeaningfulLine(markdown);
  const cleaned = firstLine.trimStart().replace(/^#+\s*/, "").trim();
  const base = cleaned.length > 50 ? cleaned.slice(0, 50) : cleaned;
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const label = base || "Agent response";
  return `${label} — ${hh}:${mm}`;
}

function padLine(text: string, width: number): string {
  const truncated = truncateToWidth(text, width, "");
  const visible = visibleWidth(truncated);
  return `${truncated}${" ".repeat(Math.max(0, width - visible))}`;
}

function frameBox(lines: string[], width: number, theme: Theme, title: string): string[] {
  const border = (t: string) => theme.fg("borderAccent", t);
  const pad = 1;
  const innerWidth = Math.max(1, width - 2 - pad * 2);
  const titlePlain = ` ${title} `;
  const fillTop = Math.max(1, width - 2 - visibleWidth(titlePlain));
  const top = `${border("┏")}${theme.fg("accent", titlePlain)}${border("━".repeat(fillTop))}${border("┓")}`;
  const blank = `${border("┃")}${" ".repeat(width - 2)}${border("┃")}`;

  const framed = [top, blank];
  for (const line of lines) {
    framed.push(`${border("┃")}${" ".repeat(pad)}${padLine(line, innerWidth)}${" ".repeat(pad)}${border("┃")}`);
  }
  framed.push(blank);
  framed.push(`${border("┗")}${border("━".repeat(width - 2))}${border("┛")}`);
  return framed.map((l) => truncateToWidth(l, width, ""));
}

/**
 * Show overlay picker of final agent responses. Returns selected markdown or null.
 * If only one message, returns it directly (no picker).
 */
async function pickAgentEndMessage(ctx: {
  sessionManager: { getBranch(): any[] };
  ui: {
    notify(m: string, level?: string): void;
    custom<T>(factory: (...args: any[]) => any, options?: Record<string, unknown>): Promise<T>;
    theme: Theme;
  };
}): Promise<string | null> {
  const messages = getAgentEndMessages(ctx.sessionManager.getBranch());

  if (messages.length === 0) {
    ctx.ui.notify("No agent responses found in the current branch.", "warning");
    return null;
  }

  if (messages.length === 1) {
    return messages[0]!.markdown;
  }

  const items: SelectItem[] = messages.map((msg, i) => ({
    value: String(i),
    label: `Response ${msg.index + 1}`,
    description: msg.preview,
  }));

  const result = await ctx.ui.custom<string | null>(
    (tui: TUI, theme: Theme, _kb: any, done: (v: string | null) => void) => {
      const container = new Container();
      container.addChild(new Text("", 0));

      const selectList = new SelectList(items, Math.min(items.length, 10), {
        selectedPrefix: (text: string) => theme.fg("accent", text),
        selectedText: (text: string) => theme.fg("accent", text),
        description: (text: string) => theme.fg("muted", text),
      });

      // Start with the last (most recent) item selected.
      selectList.setSelectedIndex(items.length - 1);

      selectList.onSelect = (item: SelectItem) => done(item.value);
      selectList.onCancel = () => done(null);
      container.addChild(selectList);

      container.addChild(new Text(theme.fg("dim", "↑↓ navigate • enter select • esc cancel"), 1));

      return {
        render(width: number) {
          const innerWidth = Math.max(1, width - 4);
          const lines = container.render(innerWidth);
          return frameBox(lines, width, theme, "Publish to Jot");
        },
        invalidate() {
          container.invalidate();
        },
        handleInput(data: string) {
          selectList.handleInput(data);
          tui.requestRender();
        },
      };
    },
    { overlay: true, overlayOptions: { anchor: "center", maxHeight: "80%", width: 80 } },
  );

  if (result === null) return null;
  const selected = messages[Number(result)];
  return selected ? selected.markdown : null;
}

// ── Extension ───────────────────────────────────────────────────

export default function jotExtension(pi: ExtensionAPI) {
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

      try {
        safeInstanceName(instanceName);
      } catch {
        ctx.ui.notify(`Invalid instance name: ${instanceName}`, "error");
        return;
      }

      saveGlobalInstance(instanceName);
      pi.appendEntry(CUSTOM_TYPE_INSTANCE, { instance: instanceName });

      ctx.ui.notify(`Selected jot instance: ${instanceName}`, "info");
    },
  });

  // ── /jot:public [path] — publish file or pick agent response ──
  pi.registerCommand("jot:public", {
    description: "Publish to jot: /jot:public <path> (file) or /jot:public (pick agent response)",
    getArgumentCompletions: (prefix: string): AutocompleteItem[] | null => {
      const cwd = process.cwd();
      const dirs = ["plans", "specs"] as const;
      const items: AutocompleteItem[] = [];

      for (const sub of dirs) {
        const dirPath = join(cwd, ".superpowers", sub);
        if (!existsSync(dirPath)) continue;
        try {
          for (const entry of readdirSync(dirPath)) {
            if (!entry.endsWith(".md")) continue;
            const rel = `.superpowers/${sub}/${entry}`;
            if (prefix && !rel.toLowerCase().startsWith(prefix.toLowerCase())) continue;
            items.push({ value: rel, label: entry, description: sub });
          }
        } catch {
          // skip
        }
      }

      return items.length > 0 ? items : null;
    },
    handler: async (args, ctx) => {
      const instanceName = getActiveInstance(ctx);
      const baseUrl = getInstanceUrl(instanceName);
      const filePath = args.trim();

      // Resolve content + title.
      let content: string;
      let title: string;
      let sourceDescription: string;

      if (filePath) {
        // File mode (unchanged behavior).
        const absPath = resolve(ctx.cwd, filePath);
        if (!existsSync(absPath)) {
          ctx.ui.notify(`File not found: ${absPath}`, "error");
          return;
        }
        content = readFileSync(absPath, "utf-8");
        const now = new Date();
        const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
        const relDir = dirname(relative(ctx.cwd, absPath));
        const fileBase = basename(absPath);
        title =
          relDir && relDir !== "."
            ? `${relDir}/${fileBase}-${time}`
            : `${fileBase}-${time}`;
        sourceDescription = filePath;
      } else {
        // Picker mode: select a final agent response.
        await ctx.waitForIdle?.();
        const picked = await pickAgentEndMessage(ctx);
        if (!picked) return; // cancelled or empty
        content = picked;
        title = buildNoteTitle(picked, new Date());
        sourceDescription = "agent response";
      }

      try {
        const noteId = createNote(instanceName, title, content);

        ctx.ui.notify(
          `Created note "${title}" (${noteId}) in ${instanceName}`,
          "info",
        );

        // Open the new note in browser.
        if (baseUrl) {
          await openJotUrl(ctx, `${baseUrl}/notes/${noteId}?view`);
        } else {
          ctx.ui.notify(`Instance "${instanceName}" has no URL — note created, not opened in browser`, "warning");
        }

        pi.sendMessage(
          {
            customType: "jot-published",
            content: `Published \`${sourceDescription}\` → jot **${instanceName}** / ${noteId} ("${title}")`,
            display: true,
            details: { instance: instanceName, noteId, title },
          },
          { triggerTurn: false },
        );
      } catch (err: any) {
        ctx.ui.notify(`Error: ${err.message}`, "error");
      }
    },
  });

  // ── /jot:open [noteId] — open jot instance or specific note ──
  pi.registerCommand("jot:open", {
    description: "Open jot: /jot:open [noteId] — leave empty for home, or pick a note",
    getArgumentCompletions: (prefix: string): AutocompleteItem[] | null => {
      const instanceName = loadGlobalInstance();
      try {
        const out = execFileSync("jot", [instanceName, "list"], {
          encoding: "utf-8",
          timeout: 10000,
        });
        const items: AutocompleteItem[] = [];
        for (const line of out.trim().split("\n")) {
          const [id, title, date] = line.split("\t");
          if (!id) continue;
          if (prefix && !id.startsWith(prefix) && !(title || "").toLowerCase().includes(prefix.toLowerCase())) continue;
          items.push({ value: id, label: title || id, description: (date || "").slice(0, 10) });
        }
        return items.length > 0 ? items : null;
      } catch {
        return null;
      }
    },
    handler: async (args, ctx) => {
      const instanceName = getActiveInstance(ctx);
      const baseUrl = getInstanceUrl(instanceName);

      if (!baseUrl) {
        ctx.ui.notify(
          `Could not find URL for instance "${instanceName}". Run /jot to select one.`,
          "error",
        );
        return;
      }

      const noteId = args.trim();
      const url = noteId ? `${baseUrl}/notes/${noteId}?view` : baseUrl;

      await openJotUrl(ctx, url);
      ctx.ui.notify(
        `Opened ${instanceName}: ${noteId ? `note ${noteId}` : "home"}`,
        "info",
      );
    },
  });
}
