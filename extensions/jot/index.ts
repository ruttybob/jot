/**
 * jot — pi extension for working with jot instances.
 *
 * Commands:
 *   /jot            — select jot instance (saved globally)
 *   /jot:public <path> — publish file to jot manually
 *   /jot:open       — open jot instance in browser
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { AutocompleteItem } from "@earendil-works/pi-tui";
import { execFileSync } from "node:child_process";
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

// ── jot note operations ─────────────────────────────────────────

/** Create a jot note with body content. Returns noteId. */
function createNote(
  instanceName: string,
  title: string,
  content: string,
): string {
  const createOut = execFileSync(
    "jot",
    [instanceName, "create", title, "markdown", content],
    { encoding: "utf-8", timeout: 15000 },
  );
  const noteId = createOut.trim().split(/\s+/)[0];
  if (!noteId) throw new Error(`Failed to create note: ${createOut}`);
  return noteId;
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

  // ── /jot:public <path> — publish file manually ───────────────
  pi.registerCommand("jot:public", {
    description: "Publish a file to jot: /jot:public <path>",
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
}
