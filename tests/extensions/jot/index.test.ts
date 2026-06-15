import { describe, it, expect } from "vitest";
import {
  getAgentEndMessages,
  buildNoteTitle,
  parseCmuxCallerPane,
} from "../../../extensions/jot/index.js";

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

  it("preview — первая meaningful строка без #", () => {
    const branch = [msg("1", "assistant", [{ type: "text", text: "# Title\n\nbody" }])];
    expect(getAgentEndMessages(branch as any)[0].preview).toBe("Title");
  });

  it("preview — обрезается до 80 символов", () => {
    const long = "# " + "x".repeat(120);
    const branch = [msg("1", "assistant", [{ type: "text", text: long }])];
    const result = getAgentEndMessages(branch as any)[0];
    expect(result.preview).toHaveLength(80);
    expect(result.preview).toBe("x".repeat(80));
  });

  it("пропускает non-message entries", () => {
    const branch = [
      { type: "compaction", id: "c1", summary: "..." },
      msg("1", "assistant", [{ type: "text", text: "ok" }]),
    ];
    expect(getAgentEndMessages(branch as any)).toHaveLength(1);
  });
});

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
    expect(title.length).toBeLessThanOrEqual(58); // 50 + " — 09:05"
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

  it("strip # даже при отступе перед заголовком", () => {
    const now = new Date("2026-06-15T22:51:00");
    expect(buildNoteTitle("   # Indented\nbody", now)).toBe("Indented — 22:51");
  });
});

describe("parseCmuxCallerPane", () => {
  it("достаёт caller.pane_ref из валидного JSON", () => {
    const json = JSON.stringify({
      caller: { pane_ref: "pane:27", surface_ref: "surface:40" },
      focused: { pane_ref: "pane:10" },
    });
    expect(parseCmuxCallerPane(json)).toBe("pane:27");
  });

  it("возвращает null если caller отсутствует", () => {
    expect(
      parseCmuxCallerPane(JSON.stringify({ focused: { pane_ref: "pane:1" } })),
    ).toBeNull();
  });

  it("возвращает null для битого JSON", () => {
    expect(parseCmuxCallerPane("not json")).toBeNull();
    expect(parseCmuxCallerPane("")).toBeNull();
  });
});
