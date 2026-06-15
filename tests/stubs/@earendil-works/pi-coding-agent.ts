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
