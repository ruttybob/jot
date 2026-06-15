# /jot:public Picker — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** При `/jot:public` без аргументов открыть picker overlay финальных ответов агента (agent_end), выбрать один, запушить в jot и открыть заметку в браузере.

**Architecture:** Расширение `extensions/jot/index.ts` (один файл). Чистые функции `getAgentEndMessages` / `buildNoteTitle` фильтруют `sessionManager.getBranch()` (assistant без `tool_use` блоков = финальный ответ). Overlay picker переиспользует паттерн из ruttybob `extensions/preview` (`SelectList` + `frameBox`). `openJotUrl` вынесен из `/jot:open` и теперь таргетит pane через `cmux identify` (фикс из ruttybob). Новая test-инфраструктура (vitest + stubs).

**Tech Stack:** TypeScript (ESM), vitest, pi SDK (`@earendil-works/pi-coding-agent`, `@earendil-works/pi-tui` — через stubs в тестах), jot CLI.

**Spec:** `docs/brainstorming/2026-06-15-jot-public-picker-design.md`

---

## File Structure

```
jot/
├── extensions/jot/index.ts                      ← MODIFY (add picker, refactor openJotUrl)
├── tests/
│   ├── extensions/jot/index.test.ts             ← CREATE (TDD for pure functions)
│   └── stubs/
│       ├── @earendil-works/pi-coding-agent.ts   ← CREATE (ExtensionAPI type)
│       └── @earendil-works/pi-tui.ts            ← CREATE (SelectList/Container/Text + types)
├── vitest.config.ts                             ← CREATE (aliases → stubs)
├── tsconfig.test.json                           ← CREATE (path aliases)
└── package.json                                 ← MODIFY (+test script, +vitest devDep)
```

**Ответственность файлов:**
- `extensions/jot/index.ts` — все команды jot. Добавляются: `getAgentEndMessages`, `buildNoteTitle`, `pickAgentEndMessage`, `openJotUrl`, `parseCmuxCallerPane`, `resolveCmuxCallerPane`, `padLine`, `frameBox`.
- `tests/extensions/jot/index.test.ts` — unit-тесты чистых функций.
- `tests/stubs/*` — минимальные stub'ы pi SDK, чтобы модуль грузился в тестах.

---

## Task 1: Test infrastructure (vitest + stubs)

**Files:**
- Create: `vitest.config.ts`
- Create: `tsconfig.test.json`
- Create: `tests/stubs/@earendil-works/pi-coding-agent.ts`
- Create: `tests/stubs/@earendil-works/pi-tui.ts`
- Modify: `package.json`

- [ ] **Step 1: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const stubDir = resolve(__dirname, "tests/stubs");

export default defineConfig({
	test: {
		include: ["tests/**/*.test.ts"],
		exclude: ["**/node_modules/**"],
		globals: true,
	},
	resolve: {
		alias: {
			"@earendil-works/pi-coding-agent": resolve(stubDir, "@earendil-works/pi-coding-agent.ts"),
			"@earendil-works/pi-tui": resolve(stubDir, "@earendil-works/pi-tui.ts"),
		},
	},
});
```

- [ ] **Step 2: Create `tsconfig.test.json`**

```json
{
	"compilerOptions": {
		"target": "ES2022",
		"module": "NodeNext",
		"moduleResolution": "NodeNext",
		"strict": true,
		"esModuleInterop": true,
		"skipLibCheck": true,
		"types": ["node"],
		"paths": {
			"@earendil-works/pi-coding-agent": ["./tests/stubs/@earendil-works/pi-coding-agent.ts"],
			"@earendil-works/pi-tui": ["./tests/stubs/@earendil-works/pi-tui.ts"]
		}
	},
	"include": ["tests/**/*.ts", "extensions/**/*.ts"]
}
```

- [ ] **Step 3: Create `tests/stubs/@earendil-works/pi-coding-agent.ts`**

Минимальный stub — только то, что импортирует расширение.

```ts
// Minimal stub: only what extensions/jot/index.ts imports.
export interface ExtensionAPI {
	registerCommand(name: string, options: any): void;
	on(event: string, handler: any): void;
	appendEntry(customType: string, data: any): void;
	sendMessage(message: any, options?: any): void;
}

// Session entry types (used by getAgentEndMessages tests via plain objects).
export interface SessionMessageEntry {
	type: "message";
	id: string;
	parentId: string | null;
	timestamp: string;
	message: {
		role: string;
		content: Array<{ type: string; text?: string }>;
	};
}

export type SessionEntry = SessionMessageEntry | { type: string; [k: string]: unknown };
```

- [ ] **Step 4: Create `tests/stubs/@earendil-works/pi-tui.ts`**

Stub'ы классов (no-op) + типы. Копия паттерна из ruttybob.

```ts
// Minimal stub: classes used as values + types used by extension.

export interface SelectItem {
	value: string;
	label: string;
	description?: string;
}

export interface AutocompleteItem {
	value: string;
	label: string;
	description?: string;
}

export interface Theme {
	fg(color: string, text: string): string;
}

export class Container {
	children: any[] = [];
	addChild(c: any) { this.children.push(c); }
	invalidate() { for (const c of this.children) c.invalidate?.(); }
	render(width: number): string[] {
		const lines: string[] = [];
		for (const child of this.children) {
			const childLines = child.render(width);
			for (const line of childLines) lines.push(line);
		}
		return lines;
	}
}

export class Text {
	private text: string;
	constructor(text?: any) {
		this.text = typeof text === "string" ? text : "";
	}
	invalidate() {}
	render(): string[] {
		return this.text ? [this.text] : [""];
	}
}

export class SelectList {
	onSelect?: (item: SelectItem) => void;
	onCancel?: () => void;
	private items: SelectItem[];
	private selectedIndex = 0;
	constructor(items: SelectItem[], _maxVisible?: number, _theme?: any) {
		this.items = items;
	}
	handleInput(data: string): void {
		if (data === "\x1b[A") {
			this.selectedIndex = Math.max(0, this.selectedIndex - 1);
		} else if (data === "\x1b[B") {
			this.selectedIndex = Math.min(this.items.length - 1, this.selectedIndex + 1);
		}
	}
	invalidate() {}
	render(): string[] {
		return this.items.map((item, i) => (i === this.selectedIndex ? "→ " : "  ") + item.label);
	}
}

export function visibleWidth(s: string): number {
	// Strip ANSI escape codes for width calculation.
	return s.replace(/\x1b\[[0-9;]*m/g, "").length;
}

export function truncateToWidth(s: string, w: number, _ellipsis?: string): string {
	const stripped = s.replace(/\x1b\[[0-9;]*m/g, "");
	return stripped.length > w ? stripped.slice(0, w) : stripped;
}

export type TUI = {
	requestRender(): void;
};
```

- [ ] **Step 5: Install vitest + add test script**

Run:
```bash
cd ~/pets/jot && npm install --save-dev vitest
```

Modify `package.json` — add to `"scripts"`:
```json
"test": "vitest run"
```

(Keep existing `dev`, `build`, `start` scripts untouched.)

- [ ] **Step 6: Verify empty test run works**

Run: `cd ~/pets/jot && npm test`
Expected: runs vitest, "No test files found" or 0 tests — no module-resolution errors.

- [ ] **Step 7: Commit**

```bash
cd ~/pets/jot && git add vitest.config.ts tsconfig.test.json tests/stubs/ package.json package-lock.json
git commit -m "test: add vitest infrastructure with pi SDK stubs"
```

---

## Task 2: TDD `getAgentEndMessages` (pure)

Фильтрует `sessionManager.getBranch()`: assistant сообщения без `tool_use` блоков = финальные ответы.

**Files:**
- Create: `tests/extensions/jot/index.test.ts`
- Modify: `extensions/jot/index.ts` (add + export function)

- [ ] **Step 1: Write the failing test**

Create `tests/extensions/jot/index.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { getAgentEndMessages } from "../../../extensions/jot/index.js";

// Helper: build a SessionMessageEntry.
function msg(
	id: string,
	role: string,
	content: Array<{ type: string; text?: string }>,
) {
	return { type: "message", id, parentId: null, timestamp: "", message: { role, content } };
}

describe("getAgentEndMessages", () => {
	it("включает assistant без tool_use", () => {
		const branch = [
			msg("1", "user", [{ type: "text", text: "hi" }]),
			msg("2", "assistant", [{ type: "text", text: "# Final answer" }]),
		];
		const result = getAgentEndMessages(branch as any);
		expect(result).toHaveLength(1);
		expect(result[0].markdown).toBe("# Final answer");
	});

	it("пропускает assistant с tool_use (промежуточный step)", () => {
		const branch = [
			msg("1", "assistant", [
				{ type: "text", text: "Let me check" },
				{ type: "tool_use", id: "t1", name: "bash", input: {} },
			]),
			msg("2", "assistant", [{ type: "text", text: "Done." }]),
		];
		const result = getAgentEndMessages(branch as any);
		expect(result).toHaveLength(1);
		expect(result[0].markdown).toBe("Done.");
	});

	it("пропускает не-assistant (user/tool)", () => {
		const branch = [
			msg("1", "user", [{ type: "text", text: "q" }]),
			msg("2", "tool", [{ type: "tool_result", toolUseId: "t1" }]),
		];
		expect(getAgentEndMessages(branch as any)).toHaveLength(0);
	});

	it("пропускает пустой content", () => {
		const branch = [msg("1", "assistant", [{ type: "text", text: "   " }])];
		expect(getAgentEndMessages(branch as any)).toHaveLength(0);
	});

	it("склеивает несколько text-блоков через \\n\\n", () => {
		const branch = [
			msg("1", "assistant", [
				{ type: "text", text: "Part A" },
				{ type: "text", text: "Part B" },
			]),
		];
		expect(getAgentEndMessages(branch as any)[0].markdown).toBe("Part A\n\nPart B");
	});

	it("preview — первая meaningful строка без #, обрез 80", () => {
		const long = "# Title\n\n" + "x".repeat(120);
		const branch = [msg("1", "assistant", [{ type: "text", text: long }])];
		expect(getAgentEndMessages(branch as any)[0].preview).toBe("Title");
	});

	it("пропускает non-message entries", () => {
		const branch = [
			{ type: "compaction", id: "c1", summary: "..." },
			msg("1", "assistant", [{ type: "text", text: "ok" }]),
		];
		expect(getAgentEndMessages(branch as any)).toHaveLength(1);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/pets/jot && npm test -- tests/extensions/jot/index.test.ts`
Expected: FAIL — `getAgentEndMessages is not a function`.

- [ ] **Step 3: Implement `getAgentEndMessages`**

Add to `extensions/jot/index.ts` (above `export default function jotExtension`):

```ts
// ── Agent-end message picker ────────────────────────────────────

export interface AgentEndMessage {
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
		const firstLine = markdown.split("\n").find((l) => l.trim().length > 0) ?? "";
		const preview = firstLine.replace(/^#+\s*/, "").slice(0, 80);
		messages.push({ index: messageIndex, markdown, preview });
		messageIndex++;
	}

	return messages;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ~/pets/jot && npm test -- tests/extensions/jot/index.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 5: Commit**

```bash
cd ~/pets/jot && git add tests/extensions/jot/index.test.ts extensions/jot/index.ts
git commit -m "feat(jot): add getAgentEndMessages (filter final assistant responses)"
```

---

## Task 3: TDD `buildNoteTitle` (pure)

Генерирует заголовок jot-заметки из markdown ответа.

**Files:**
- Modify: `tests/extensions/jot/index.test.ts`
- Modify: `extensions/jot/index.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/extensions/jot/index.test.ts`:

```ts
import { buildNoteTitle } from "../../../extensions/jot/index.js";

describe("buildNoteTitle", () => {
	it("первая meaningful строка без # + HH:MM", () => {
		const now = new Date("2026-06-15T22:51:00");
		const title = buildNoteTitle("# Fix the preview bug\n\nBody text", now);
		expect(title).toBe("Fix the preview bug — 22:51");
	});

	it("обрезает длинную первую строку до 50 символов", () => {
		const now = new Date("2026-06-15T09:05:00");
		const long = "x".repeat(80);
		const title = buildNoteTitle(long, now);
		expect(title.length).toBeLessThanOrEqual(56); // 50 + " — 09:05"
		expect(title).toMatch(/ — 09:05$/);
	});

	it("fallback для пустого markdown", () => {
		const now = new Date("2026-06-15T00:00:00");
		const title = buildNoteTitle("   \n  ", now);
		expect(title).toBe("Agent response — 00:00");
	});

	it("пропускает пустые строки в начале", () => {
		const now = new Date("2026-06-15T14:30:00");
		const title = buildNoteTitle("\n\n  \nActual content here", now);
		expect(title).toBe("Actual content here — 14:30");
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/pets/jot && npm test -- tests/extensions/jot/index.test.ts`
Expected: FAIL — `buildNoteTitle is not a function`.

- [ ] **Step 3: Implement `buildNoteTitle`**

Add to `extensions/jot/index.ts` (after `getAgentEndMessages`):

```ts
/**
 * Build a jot note title from an agent response.
 * First meaningful line (without leading #), truncated to 50 chars, + " HH:MM".
 */
export function buildNoteTitle(markdown: string, now: Date): string {
	const firstLine = markdown.split("\n").find((l) => l.trim().length > 0) ?? "";
	const cleaned = firstLine.replace(/^#+\s*/, "").trim();
	const base = cleaned.length > 50 ? cleaned.slice(0, 50) : cleaned;
	const hh = String(now.getHours()).padStart(2, "0");
	const mm = String(now.getMinutes()).padStart(2, "0");
	const label = base || "Agent response";
	return `${label} — ${hh}:${mm}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ~/pets/jot && npm test -- tests/extensions/jot/index.test.ts`
Expected: PASS — 11 tests.

- [ ] **Step 5: Commit**

```bash
cd ~/pets/jot && git add tests/extensions/jot/index.test.ts extensions/jot/index.ts
git commit -m "feat(jot): add buildNoteTitle (first line + HH:MM)"
```

---

## Task 4: TDD `parseCmuxCallerPane` (pure)

Парсит вывод `cmux identify` → `caller.pane_ref`. Нужен для `--pane` таргетинга (фикс "открывается в фокусированной панели").

**Files:**
- Modify: `tests/extensions/jot/index.test.ts`
- Modify: `extensions/jot/index.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/extensions/jot/index.test.ts`:

```ts
import { parseCmuxCallerPane } from "../../../extensions/jot/index.js";

describe("parseCmuxCallerPane", () => {
	it("достаёт caller.pane_ref из валидного JSON", () => {
		const json = JSON.stringify({
			caller: { pane_ref: "pane:27", surface_ref: "surface:40" },
			focused: { pane_ref: "pane:10" },
		});
		expect(parseCmuxCallerPane(json)).toBe("pane:27");
	});

	it("возвращает null если caller отсутствует", () => {
		expect(parseCmuxCallerPane(JSON.stringify({ focused: { pane_ref: "pane:1" } }))).toBeNull();
	});

	it("возвращает null для битого JSON", () => {
		expect(parseCmuxCallerPane("not json")).toBeNull();
		expect(parseCmuxCallerPane("")).toBeNull();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/pets/jot && npm test -- tests/extensions/jot/index.test.ts`
Expected: FAIL — `parseCmuxCallerPane is not a function`.

- [ ] **Step 3: Implement `parseCmuxCallerPane`**

Add to `extensions/jot/index.ts`. Also add the `spawn` import at the top of the file if not present. First, update imports:

Find the existing import block at the top of `extensions/jot/index.ts`:
```ts
import { execFileSync } from "node:child_process";
```

Replace with:
```ts
import { execFileSync, spawn } from "node:child_process";
```

Then add the functions (after `getActiveInstance`, before `createNote`):

```ts
// ── cmux pane resolution ────────────────────────────────────────

let cachedCmuxPane: string | null | undefined;

/** Pure: extract caller.pane_ref from `cmux identify` JSON output. */
export function parseCmuxCallerPane(identifyJson: string): string | null {
	try {
		const parsed = JSON.parse(identifyJson) as { caller?: { pane_ref?: unknown } };
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
	const result = await new Promise<string | null>((resolve) => {
		let stdout = "";
		const child = spawn(cmuxBin, ["identify"], { stdio: ["ignore", "pipe", "ignore"] });
		child.stdout?.on("data", (c: Buffer) => {
			stdout += c.toString();
		});
		child.once("error", () => resolve(null));
		child.once("close", () => resolve(parseCmuxCallerPane(stdout)));
	});
	cachedCmuxPane = result;
	return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ~/pets/jot && npm test -- tests/extensions/jot/index.test.ts`
Expected: PASS — 14 tests.

- [ ] **Step 5: Commit**

```bash
cd ~/pets/jot && git add tests/extensions/jot/index.test.ts extensions/jot/index.ts
git commit -m "feat(jot): add cmux pane resolution via 'cmux identify'"
```

---

## Task 5: Refactor `openJotUrl` (extract from `/jot:open`)

Вынести логику открытия URL в общую функцию с pane-таргетингом. Переиспользуется `/jot:open` и новым `/jot:public` picker.

**Files:**
- Modify: `extensions/jot/index.ts`

- [ ] **Step 1: Add `openJotUrl` function**

Add to `extensions/jot/index.ts` (after `resolveCmuxCallerPane`):

```ts
/** Open a URL in cmux browser-surface (targeting pi's pane) or system browser. */
async function openJotUrl(ctx: { ui: { notify(m: string, level?: string): void } }, url: string): Promise<void> {
	const inCmux = process.env.CMUX_BUNDLE_ID === "com.cmuxterm.app";
	try {
		if (inCmux) {
			const cmuxBin = process.env.CMUX_PI_CMUX_BIN || "cmux";
			const pane = await resolveCmuxCallerPane();
			const args = ["new-surface", "--type", "browser", "--url", url, "--focus", "true"];
			if (pane) args.push("--pane", pane);
			await new Promise<void>((resolve, reject) => {
				const child = spawn(cmuxBin, args, { stdio: "ignore", detached: true });
				child.once("error", reject);
				child.once("spawn", () => {
					child.unref();
					resolve();
				});
			});
		} else {
			const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
			const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
			await new Promise<void>((resolve, reject) => {
				const child = spawn(cmd, args, { stdio: "ignore", detached: true });
				child.once("error", reject);
				child.once("spawn", () => {
					child.unref();
					resolve();
				});
			});
		}
	} catch (err: any) {
		ctx.ui.notify(`Failed to open browser: ${err.message}`, "error");
	}
}
```

- [ ] **Step 2: Refactor `/jot:open` handler to use `openJotUrl`**

In `extensions/jot/index.ts`, find the `/jot:open` handler's try/catch block:

```ts
      const inCmux = process.env.CMUX_BUNDLE_ID === "com.cmuxterm.app";

      try {
        if (inCmux) {
          execFileSync(
            "cmux",
            ["new-surface", "--type", "browser", "--url", url, "--focus", "true"],
            { timeout: 5000 },
          );
        } else {
          execFileSync("open", [url], { timeout: 5000 });
        }
        ctx.ui.notify(
          `Opened ${instanceName}: ${noteId ? `note ${noteId}` : "home"}`,
          "info",
        );
      } catch (err: any) {
        ctx.ui.notify(`Failed to open: ${err.message}`, "error");
      }
```

Replace with:

```ts
      await openJotUrl(ctx, url);
      ctx.ui.notify(
        `Opened ${instanceName}: ${noteId ? `note ${noteId}` : "home"}`,
        "info",
      );
```

- [ ] **Step 3: Run tests to verify nothing broke**

Run: `cd ~/pets/jot && npm test`
Expected: PASS — 14 tests (refactor, no new tests).

- [ ] **Step 4: Commit**

```bash
cd ~/pets/jot && git add extensions/jot/index.ts
git commit -m "refactor(jot): extract openJotUrl with cmux pane targeting"
```

---

## Task 6: `padLine` + `frameBox` helpers

ANSI-aware border rendering для overlay picker. Копия из ruttybob preview.

**Files:**
- Modify: `extensions/jot/index.ts`

- [ ] **Step 1: Add imports for pi-tui**

In `extensions/jot/index.ts`, find:
```ts
import type { AutocompleteItem } from "@earendil-works/pi-tui";
```

Replace with:
```ts
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
```

- [ ] **Step 2: Add `padLine` + `frameBox`**

Add to `extensions/jot/index.ts` (after `getAgentEndMessages`):

```ts
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
```

- [ ] **Step 3: Run tests to verify nothing broke**

Run: `cd ~/pets/jot && npm test`
Expected: PASS — 14 tests.

- [ ] **Step 4: Commit**

```bash
cd ~/pets/jot && git add extensions/jot/index.ts
git commit -m "feat(jot): add padLine + frameBox helpers for overlay picker"
```

---

## Task 7: `pickAgentEndMessage` overlay

Overlay picker по образцу preview. Manual verification (no unit test — UI).

**Files:**
- Modify: `extensions/jot/index.ts`

- [ ] **Step 1: Add `pickAgentEndMessage`**

Add to `extensions/jot/index.ts` (after `frameBox`):

```ts
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
			for (let i = 0; i < items.length - 1; i++) {
				selectList.handleInput("\x1b[B");
			}

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
```

- [ ] **Step 2: Run tests to verify nothing broke**

Run: `cd ~/pets/jot && npm test`
Expected: PASS — 14 tests.

- [ ] **Step 3: Commit**

```bash
cd ~/pets/jot && git add extensions/jot/index.ts
git commit -m "feat(jot): add pickAgentEndMessage overlay picker"
```

---

## Task 8: Wire up `/jot:public` handler (empty args → picker)

**Files:**
- Modify: `extensions/jot/index.ts`

- [ ] **Step 1: Modify `/jot:public` handler**

In `extensions/jot/index.ts`, find the `/jot:public` handler:

```ts
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
```

Replace with:

```ts
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
        await ctx.waitForIdle();
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
```

- [ ] **Step 2: Update command description**

In `extensions/jot/index.ts`, find the `/jot:public` registration:

```ts
    description: "Publish a file to jot: /jot:public <path>",
```

Replace with:

```ts
    description: "Publish to jot: /jot:public <path> (file) or /jot:public (pick agent response)",
```

- [ ] **Step 3: Run tests to verify nothing broke**

Run: `cd ~/pets/jot && npm test`
Expected: PASS — 14 tests.

- [ ] **Step 4: Commit**

```bash
cd ~/pets/jot && git add extensions/jot/index.ts
git commit -m "feat(jot): /jot:public without args opens agent response picker"
```

---

## Task 9: Manual verification + AGENTS.md

**Files:**
- Create: `extensions/jot/AGENTS.md`

- [ ] **Step 1: Verify extension loads in pi**

Run in pi: `/reload`
Expected: no load errors.

- [ ] **Step 2: Verify picker overlay**

Run in pi: `/jot:public` (no args)
Expected: overlay appears with "Publish to Jot" title, lists final agent responses, ↑↓ navigates, Enter selects, Esc cancels.

- [ ] **Step 3: Verify publish + open**

Select a response in the picker.
Expected: jot note created, browser surface opens at `${baseUrl}/notes/${id}?view` in pi's pane (not focused pane), notify + sendMessage appear.

- [ ] **Step 4: Verify file mode still works**

Run in pi: `/jot:public package.json`
Expected: creates note from file (unchanged behavior), opens in browser.

- [ ] **Step 5: Create `extensions/jot/AGENTS.md`**

```markdown
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
```

- [ ] **Step 6: Commit**

```bash
cd ~/pets/jot && git add extensions/jot/AGENTS.md
git commit -m "docs(jot): add AGENTS.md for jot extension"
```

---

## Self-Review

**Spec coverage:**
- ✅ `/jot:public` без аргументов → picker — Task 7 + Task 8
- ✅ Фильтр agent_end (без tool_use) — Task 2
- ✅ `buildNoteTitle` — Task 3
- ✅ `pickAgentEndMessage` overlay — Task 7
- ✅ `openJotUrl` с pane-таргетингом — Task 4 + Task 5
- ✅ create note + open — Task 8
- ✅ notify + sendMessage — Task 8
- ✅ Test infra (vitest + stubs) — Task 1
- ✅ TDD чистых функций — Tasks 2, 3, 4
- ✅ YAGNI: нет `/jot:auto-public`, нет персистенции — соблюдено

**Type consistency:**
- `AgentEndMessage { index, markdown, preview }` — consistent across Task 2 (def) + Task 7 (use)
- `getAgentEndMessages(branch: any[])` — consistent
- `buildNoteTitle(markdown, now)` — consistent Task 3 (def) + Task 8 (use)
- `parseCmuxCallerPane(json): string | null` — consistent Task 4 (def)
- `openJotUrl(ctx, url)` — consistent Task 5 (def) + Task 8 (use)
- `pickAgentEndMessage(ctx)` — consistent Task 7 (def) + Task 8 (use)

**Placeholder scan:** нет TBD/TODO, весь код включён.
