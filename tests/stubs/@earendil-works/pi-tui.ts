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
  constructor(text?: any, _alignment?: any) {
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
  setSelectedIndex(index: number): void {
    this.selectedIndex = Math.max(0, Math.min(this.items.length - 1, index));
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
