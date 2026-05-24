/**
 * Jot Extension for pi
 *
 * Commands:
 *   /jot          — select a jot instance from registered ones
 *   /jot-public <path-to-file> — create a note in the selected instance from a file
 *
 * State is persisted via appendEntry, so the selected instance survives
 * session restarts and /reload.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { AutocompleteItem } from "@earendil-works/pi-tui";
import { execSync } from "node:child_process";
import { existsSync, readdirSync, statSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { resolve, basename, dirname, relative, join } from "node:path";

const CUSTOM_TYPE_INSTANCE = "jot-selected-instance";

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
    const out = execSync("jot instances", { encoding: "utf-8", timeout: 5000 });
    return parseInstances(out);
  } catch {
    return [];
  }
}

/** Find the persisted instance name in session entries. */
function restoreInstance(ctx: { sessionManager: any }): string | undefined {
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

export default function jotExtension(pi: ExtensionAPI) {
  // ── /jot — select an instance ────────────────────────────────────
  pi.registerCommand("jot", {
    description: "Select a jot instance from registered ones",
    handler: async (_args, ctx) => {
      const instances = getInstances();
      if (instances.length === 0) {
        ctx.ui.notify("No jot instances registered. Run: jot register <name> <url> <key>", "warning");
        return;
      }

      const items = instances.map(
        (inst) => `${inst.name}  (${inst.url})  ${inst.description}`.trim(),
      );

      const selected = await ctx.ui.select("Select jot instance", items);
      if (!selected) return;

      const instanceName = selected.split(/\s+/)[0];
      pi.appendEntry(CUSTOM_TYPE_INSTANCE, { instance: instanceName });
      ctx.ui.notify(`Selected jot instance: ${instanceName}`, "info");
    },
  });

  // ── /jot-public <path> — create note from file ───────────────────
  pi.registerCommand("jot-public", {
    description: "Create a jot note from a file in the selected instance: /jot-public <path>",
    getArgumentCompletions: (prefix: string): AutocompleteItem[] | null => {
      // Resolve the directory part and the partial filename
      const cwd = process.cwd();
      const expanded = prefix.startsWith("~") ? prefix.replace("~", process.env.HOME || "~") : prefix;
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
        .filter((e) => (hidden || !e.startsWith(".")) && e.toLowerCase().startsWith(partial.toLowerCase()))
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
        ctx.ui.notify("Usage: /jot-public <path-to-file>", "warning");
        return;
      }

      // Restore persisted instance
      const instanceName = restoreInstance(ctx);
      if (!instanceName) {
        ctx.ui.notify(
          "No jot instance selected. Run /jot first.",
          "warning",
        );
        return;
      }

      const absPath = resolve(ctx.cwd, filePath);
      if (!existsSync(absPath)) {
        ctx.ui.notify(`File not found: ${absPath}`, "error");
        return;
      }

      const content = readFileSync(absPath, "utf-8");

      // Title: directory/filename-hh:mm
      const now = new Date();
      const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      const relDir = dirname(relative(ctx.cwd, absPath));
      const fileBase = basename(absPath);
      const title = relDir && relDir !== "." ? `${relDir}/${fileBase}-${time}` : `${fileBase}-${time}`;

      // Create note
      try {
        const createOut = execSync(`jot ${instanceName} create ${JSON.stringify(title)}`, {
          encoding: "utf-8",
          timeout: 10000,
        });

        // Output like: "oqtd7azt	test from cli"
        const noteId = createOut.trim().split(/\s+/)[0];
        if (!noteId) {
          ctx.ui.notify(`Failed to create note: ${createOut}`, "error");
          return;
        }

        // Upload body via temp file + variable (pipe/stdin not supported by jot CLI)
        const tmpFile = `/tmp/jot-pi-${noteId}.md`;
        writeFileSync(tmpFile, content, "utf-8");
        try {
          execSync(`CONTENT=$(cat '${tmpFile}') && jot ${instanceName} update ${noteId} markdown "$CONTENT"`, {
            encoding: "utf-8",
            timeout: 15000,
          });
        } finally {
          unlinkSync(tmpFile);
        }

        ctx.ui.notify(
          `Created note "${title}" (${noteId}) in ${instanceName}`,
          "info",
        );

        // Send chat message (no LLM turn)
        pi.sendMessage({
          customType: "jot-published",
          content: `Published \`${filePath}\` → jot **${instanceName}** / ${noteId} ("${title}")`,
          display: true,
          details: { absPath, instance: instanceName, noteId, title },
        }, { triggerTurn: false });
      } catch (err: any) {
        ctx.ui.notify(`Error: ${err.message}`, "error");
      }
    },
  });
}
