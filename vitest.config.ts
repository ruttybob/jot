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
