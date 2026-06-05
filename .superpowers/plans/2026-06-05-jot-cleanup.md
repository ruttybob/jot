# jot cleanup — remove autosync, add agent modal tabs

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Убрать autosync из расширения `jot`, переименовать его в `jot`, удалить dead-code, добавить табы в модалке робота.

**Architecture:** Чистка одного TS-файла + переименование папки + refactor одной функции в `app.js` (вынос текстов в отдельные функции-билдеры + добавление табов). Изменения изолированные, не трогают серверный код jot.

**Tech Stack:** TypeScript (pi extension), vanilla JS (frontend), CSS.

**Spec:** `.superpowers/specs/2026-06-05-jot-cleanup-design.md`

---

## File Structure

| Файл | Действие |
|---|---|
| `extensions/jot-autosync/index.ts` | DELETE (переименование + контент уходит в новый файл) |
| `extensions/jot/index.ts` | CREATE — облегчённая версия расширения |
| `public/app.js` | MODIFY — `openAgentModal` refactor (1086–1189) |
| `public/styles.css` | MODIFY — добавить стили `.agent-tabs` после строки 273 |
| `.superpowers/plans/2025-05-28-jot-autosync-plan.md` | DELETE |
| `.superpowers/plans/2025-05-28-test-autosync.md` | DELETE |
| `.superpowers/specs/2025-05-28-jot-autosync-design.md` | DELETE |

---

## Task 1: Удалить старые spec/plan файлы для autosync

**Files:**
- Delete: `.superpowers/plans/2025-05-28-jot-autosync-plan.md`
- Delete: `.superpowers/plans/2025-05-28-test-autosync.md`
- Delete: `.superpowers/specs/2025-05-28-jot-autosync-design.md`

- [ ] **Step 1: Удалить три файла**

```bash
rm .superpowers/plans/2025-05-28-jot-autosync-plan.md
rm .superpowers/plans/2025-05-28-test-autosync.md
rm .superpowers/specs/2025-05-28-jot-autosync-design.md
```

- [ ] **Step 2: Проверить что в `.superpowers/` не осталось ссылок на autosync**

Run: `grep -rn "jot-autosync\|autosync" .superpowers/`
Expected: только эта спека/план (2026-06-05-jot-cleanup) может упоминать слово для контекста.

- [ ] **Step 3: Commit**

```bash
git add -A .superpowers/
git commit -m "chore: remove jot-autosync spec/plan (feature deleted)"
```

---

## Task 2: Создать новое расширение `extensions/jot/index.ts`

**Files:**
- Create: `extensions/jot/index.ts`

Контент — копия `extensions/jot-autosync/index.ts`, из которой удалены:
- helper'ы `updateNote`, `readNoteBody`, `uploadBody`
- функция `classifyPath`
- функция `syncFile`
- интерфейс `SyncState` и объект `state`
- команду `/jot:pull`
- весь обработчик `pi.on("tool_call", …)`
- лишние импорты: `readdirSync`, `unlinkSync`, `relative` (после чистки не используются)
- поле `state` в lifecycle hooks

И `createNote` упрощается до одного вызова.

- [ ] **Step 1: Создать директорию**

```bash
mkdir -p extensions/jot
```

- [ ] **Step 2: Создать `extensions/jot/index.ts` с контентом ниже**

```typescript
/**
 * jot — pi extension for working with jot instances.
 *
 * Commands:
 *   /jot            — select jot instance (saved globally)
 *   /jot:public <path> — publish file to jot manually
 *   /jot:open       — open jot instance in browser
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";
import type { AutocompleteItem } from "@earendil-works/pi-tui";
import { execFileSync, execSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { resolve, basename, dirname, relative, join } from "node:path";
import { homedir } from "node:os";

// Note: isToolCallEventType is no longer used after autosync removal,
//       but kept imported to avoid breaking typecheck if other code references it.
//       If tsconfig noUnusedLocals is strict, remove this import too.

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
  const tmpFile = `/tmp/jot-publish-${process.pid}-${Date.now()}.md`;
  writeFileSync(tmpFile, content, "utf-8");
  try {
    // jot CLI doesn't support stdin for body — must use $() expansion
    const createOut = execSync(
      `CONTENT=$(cat '${tmpFile}') && jot ${instanceName} create "${title.replace(/"/g, '\\"')}" markdown "$CONTENT"`,
      { encoding: "utf-8", timeout: 15000 },
    );
    const noteId = createOut.trim().split(/\s+/)[0];
    if (!noteId) throw new Error(`Failed to create note: ${createOut}`);
    return noteId;
  } finally {
    try { require("node:fs").unlinkSync(tmpFile); } catch {}
  }
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
```

- [ ] **Step 3: TypeScript check (опционально — в репо нет сборки расширений, но проверить синтаксис)**

```bash
npx --yes typescript@5 --noEmit --target es2022 --module esnext --moduleResolution bundler \
  --allowJs --skipLibCheck extensions/jot/index.ts 2>&1 | head -30 || true
```

Expected: либо чисто, либо только "Cannot find modules @earendil-works/* — это ок, они резолвятся только внутри pi.

- [ ] **Step 4: Commit**

```bash
git add extensions/jot/
git commit -m "feat(extension): add jot extension (jot-autosync successor without autosync)"
```

---

## Task 3: Удалить старое расширение `extensions/jot-autosync/`

**Files:**
- Delete: `extensions/jot-autosync/index.ts` (и вся папка)

- [ ] **Step 1: Удалить папку**

```bash
rm -rf extensions/jot-autosync
```

- [ ] **Step 2: Проверить что в репо не осталось ссылок на старое имя**

Run: `grep -rn "jot-autosync" --include="*.ts" --include="*.js" --include="*.json" --include="*.md" .`
Expected: пусто.

- [ ] **Step 3: Smoke-test pi — команда `/jot` доступна**

Запустить pi в репо jot, ввести `/jot<TAB>`.
Expected: автокомплит показывает `/jot`, `/jot:public`, `/jot:open`. `/jot:pull` отсутствует.

- [ ] **Step 4: Commit**

```bash
git add -A extensions/
git commit -m "chore: remove jot-autosync extension (replaced by jot)"
```

---

## Task 4: CSS — стили для `.agent-tabs`

**Files:**
- Modify: `public/styles.css:273` (после блока `.agent-modal jot-button`)

- [ ] **Step 1: Добавить стили табов**

В `public/styles.css` найти строку 273:
```css
.agent-modal jot-button { flex-shrink: 0; }
```

Сразу после неё вставить:
```css
.agent-tabs { display: flex; gap: 0.25rem; margin: 0 0 0.75rem; flex-shrink: 0; }
.agent-tabs button {
  background: transparent; border: 1px solid var(--code-border);
  color: var(--muted); padding: 0.4rem 0.8rem; border-radius: 8px;
  font-size: 0.82rem; cursor: pointer; font-family: inherit;
}
.agent-tabs button:hover { color: var(--text); border-color: var(--text); }
.agent-tabs button.active {
  background: var(--code-bg); color: var(--text); border-color: var(--text);
}
```

- [ ] **Step 2: Проверить, что в CSS нет конфликтов**

Run: `grep -n "agent-tabs" public/styles.css`
Expected: ровно 4 строки (родительское правило + 3 дочерних).

- [ ] **Step 3: Commit**

```bash
git add public/styles.css
git commit -m "style: add .agent-tabs for agent modal"
```

---

## Task 5: JS — refactor `openAgentModal` с табами

**Files:**
- Modify: `public/app.js:1086-1189` (тело `openAgentModal`)

Заменяем всё тело функции `openAgentModal` новой реализацией, которая:
1. Выносит построение CLI-промпта в `buildCliPrompt(isOwnerView, ctx)`
2. Добавляет `buildSyncPrompt(isOwnerView, ctx)` с workflow-промптом
3. Добавляет табы в HTML
4. Локально хранит `activeTab` и текущий `instructions`
5. Copy button копирует `instructions` активного таба

- [ ] **Step 1: Заменить тело `openAgentModal` (строки 1086–1189)**

В файле `public/app.js` найти функцию:
```js
  function openAgentModal(refs) {
    const baseUrl = `${location.protocol}//${location.host}`;
```

Замени её целиком (от `function openAgentModal(refs) {` до закрывающей `}` перед `function openIdentityModalAsync`) на:

```js
  function buildCliPrompt(isOwnerView, ctx) {
    const { baseUrl, currentNoteId, shareUrl } = ctx;
    const lines = [];
    if (isOwnerView) {
      lines.push(
        `# Your user wants you to interact with a jot note using the CLI below.`,
        `# Run the commands as needed to read, edit, and comment on the note.`,
        ``,
        `npm install -g @mariozechner/jot`,
        ``,
        `# Connect`,
        `jot register my-jot ${baseUrl} <YOUR_API_KEY>`,
        ``,
        `# List notes`,
        `jot my-jot list`,
        ``,
        `# Read this note (includes thread/message IDs)`,
        `jot my-jot read ${currentNoteId}`,
        ``,
        `# Create a note`,
        `jot my-jot create "My note title"`,
        ``,
        `# Edit this note`,
        `jot my-jot edit ${currentNoteId} '[{"oldText":"...","newText":"..."}]'`,
        ``,
        `# Comment on text in this note`,
        `jot my-jot comment ${currentNoteId} "quoted text" "comment body"`,
        ``,
        `# Reply to a specific message`,
        `jot my-jot reply ${currentNoteId} <thread-id> <message-id> "reply"`,
        ``,
        `# Edit or delete a comment`,
        `jot my-jot edit-comment ${currentNoteId} <message-id> "new body"`,
        `jot my-jot delete-comment ${currentNoteId} <message-id>`,
        ``,
        `# Resolve, reopen, or delete a thread`,
        `jot my-jot resolve ${currentNoteId} <thread-id>`,
        `jot my-jot reopen ${currentNoteId} <thread-id>`,
        `jot my-jot delete-thread ${currentNoteId} <thread-id>`,
        ``,
        `# Full command reference`,
        `jot --help`,
      );
    } else {
      lines.push(
        `# Your user wants you to interact with a shared jot note using the CLI below.`,
        `# Run the commands as needed to read, edit, and comment on the note.`,
        ``,
        `npm install -g @mariozechner/jot`,
        ``,
        `# Connect to the shared note`,
        `jot register my-jot ${shareUrl}`,
        ``,
        `# Read the note (includes thread/message IDs)`,
        `jot my-jot read`,
        ``,
        `# Edit the note (if edit access)`,
        `jot my-jot edit '[{"oldText":"...","newText":"..."}]'`,
        ``,
        `# Comment on text`,
        `jot my-jot comment "quoted text" "comment body" --name="My Agent"`,
        ``,
        `# Reply to a specific message`,
        `jot my-jot reply <thread-id> <message-id> "reply" --name="My Agent"`,
        ``,
        `# Full command reference`,
        `jot --help`,
      );
    }
    return lines.join("\n");
  }

  function buildSyncPrompt(isOwnerView, ctx) {
    const { currentNoteId } = ctx;
    if (isOwnerView) {
      return [
        `- \`jot my-jot read-threads ${currentNoteId}\` — read unresolved threads`,
        `- For each unresolved thread: \`reply\` with a proposed change, tell the user what you proposed, **wait for confirmation**`,
        `- After confirmation: \`resolve\` the thread, \`edit\` the note if the thread requires changes`,
        ``,
        `## Rules`,
        ``,
        `- No confirmation → don't resolve, don't edit`,
        `- All replies and edits in Russian`,
      ].join("\n");
    }
    return [
      `- \`jot my-jot read\` — read the note with threads (shared-mode, no instance)`,
      `- For each unresolved thread: propose a \`reply\`, tell the user what you proposed, **wait for confirmation**`,
      `- After confirmation: \`reply\` to the thread`,
      ``,
      `## Rules`,
      ``,
      `- No confirmation → don't reply`,
      `- All replies in Russian`,
    ].join("\n");
  }

  function openAgentModal(refs) {
    const isOwnerView = state.viewer?.isOwner;
    const baseUrl = `${location.protocol}//${location.host}`;
    const currentNoteId = state.note?.id || "<note-id>";
    const shareUrl = `${baseUrl}/s/${state.note?.shareId || ""}`;
    const ctx = { baseUrl, currentNoteId, shareUrl };

    const prompts = {
      cli: buildCliPrompt(isOwnerView, ctx),
      sync: buildSyncPrompt(isOwnerView, ctx),
    };
    const hint = isOwnerView
      ? "Create an API key in settings on the landing page, then give your agent these instructions:"
      : "Give your agent these instructions to interact with this note:";

    if (!refs.modalBackdrop) return;
    state.modalOpen = true;
    refs.modalBackdrop.classList.remove("hidden");
    let activeTab = "cli";
    const render = () => {
      refs.modalBackdrop.innerHTML = `
        <div class="modal agent-modal" role="dialog" aria-modal="true">
          <div class="settings-header">
            <h2 class="settings-title">Agent setup</h2>
            <jot-icon-button icon="close" label="Close" id="agentModalClose"></jot-icon-button>
          </div>
          <p class="agent-hint">${escapeHtml(hint)}</p>
          <div class="agent-tabs">
            <button data-tab="cli" class="${activeTab === "cli" ? "active" : ""}">Agent CLI</button>
            <button data-tab="sync" class="${activeTab === "sync" ? "active" : ""}">Sync threads</button>
          </div>
          <pre class="agent-instructions"><code>${escapeHtml(prompts[activeTab])}</code></pre>
          <jot-button variant="ghost" size="sm" id="agentCopyBtn">copy to clipboard</jot-button>
        </div>
      `;
      // Bind events
      refs.modalBackdrop.querySelector("#agentModalClose").addEventListener("click", close);
      refs.modalBackdrop.querySelectorAll(".agent-tabs button").forEach((btn) => {
        btn.addEventListener("click", () => {
          activeTab = btn.dataset.tab;
          render();
        });
      });
      refs.modalBackdrop.querySelector("#agentCopyBtn").addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(prompts[activeTab]);
          const btn = refs.modalBackdrop.querySelector("#agentCopyBtn");
          setButtonLabel(btn, "copied!");
          setTimeout(() => setButtonLabel(btn, "copy to clipboard"), 1500);
        } catch {}
      });
    };

    const close = () => { closeModal(refs); };
    refs.modalBackdrop.addEventListener("click", (e) => { if (e.target === refs.modalBackdrop) close(); });
    render();
  }
```

- [ ] **Step 2: Проверить синтаксис JS**

Run: `node -c public/app.js`
Expected: пусто (без ошибок).

- [ ] **Step 3: Ручной smoke-тест**

1. `npm run dev`
2. Открыть заметку (owner-view) → кликнуть иконку робота.
3. Проверить: 2 таба, при переключении текст меняется, кнопка copy копирует текст активного таба.
4. Открыть shared-link → кликнуть иконку робота.
5. Проверить: те же 2 таба, в обоих — адаптированный под shared текст.

- [ ] **Step 4: Commit**

```bash
git add public/app.js
git commit -m "feat(ui): agent modal tabs — Agent CLI / Sync threads prompts"
```

---

## Task 6: Финальная проверка

- [ ] **Step 1: Проверить, что в репо не осталось упоминаний autosync**

Run: `grep -rn "jot-autosync\|autosync" --include="*.ts" --include="*.js" --include="*.json" --include="*.md" . | grep -v node_modules | grep -v ".superpowers/specs/2026-06-05-jot-cleanup"`
Expected: пусто (только текущий cleanup-план/спека могут упоминать слово).

- [ ] **Step 2: Полный smoke-test**

1. `npm run dev` — jot-сервер запускается.
2. Открыть owner-note → иконка робота → оба таба работают.
3. Открыть shared-note → иконка робота → оба таба работают.
4. Запустить pi в репо jot → команды `/jot`, `/jot:public`, `/jot:open` работают; `/jot:pull` не существует.

- [ ] **Step 3: Закоммитить, если что-то ещё менялось**

Если все коммиты сделаны в предыдущих шагах — skip.

```bash
git status
```

Expected: clean tree (или только untracked файлы, не связанные с задачей).

---

## Self-Review Plan vs Spec

**Spec coverage:**
- ✅ Удалить autosync из расширения → Task 2, Task 3
- ✅ Оставить /jot, /jot:public, /jot:open → Task 2
- ✅ Переименовать jot-autosync → jot → Task 2 (создаёт новый), Task 3 (удаляет старый)
- ✅ Удалить dead-code helpers → Task 2 (в новом файле их нет)
- ✅ Табы в openAgentModal → Task 4 (CSS) + Task 5 (JS)
- ✅ Sync-промпт owner = копия sync-jot.md → Task 5, `buildSyncPrompt` owner-ветка
- ✅ Sync-промпт shared адаптирован → Task 5, `buildSyncPrompt` shared-ветка
- ✅ Удалить старые plan/spec для autosync → Task 1

**Placeholder scan:** нет "TODO", "TBD", "implement later".

**Type consistency:** имена `buildCliPrompt`, `buildSyncPrompt`, `activeTab`, `prompts` согласованы между шагами.

План готов.
