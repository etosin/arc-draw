import { describe, it, expect } from "@jest/globals";
import { claudeCodeAdapter } from "./claude-code.js";

const ENTRY = {
  command: "npx",
  args: ["-y", "drawio-mcp-server", "--editor"],
  env: {},
  transport: "stdio" as const,
};

describe("claudeCodeAdapter.merge", () => {
  it("adds mcpServers.drawio to a fresh file", () => {
    const out = claudeCodeAdapter.merge("", ENTRY, "drawio", {
      uninstall: false,
    });
    const parsed = JSON.parse(out);
    expect(parsed.mcpServers.drawio).toEqual({
      type: "stdio",
      command: "npx",
      args: ["-y", "drawio-mcp-server", "--editor"],
    });
  });

  it("uninstall removes only that key", () => {
    const source = JSON.stringify({
      mcpServers: {
        drawio: { type: "stdio", command: "old" },
        other: { command: "x" },
      },
    });
    const out = claudeCodeAdapter.merge(source, ENTRY, "drawio", {
      uninstall: true,
    });
    const parsed = JSON.parse(out);
    expect(parsed.mcpServers.drawio).toBeUndefined();
    expect(parsed.mcpServers.other).toEqual({ command: "x" });
  });

  it("preserves unrelated top-level keys", () => {
    const source = JSON.stringify(
      { projects: { "/tmp": {} }, mcpServers: {} },
      null,
      2,
    );
    const out = claudeCodeAdapter.merge(source, ENTRY, "drawio", {
      uninstall: false,
    });
    expect(JSON.parse(out).projects).toEqual({ "/tmp": {} });
  });
});

describe("claudeCodeAdapter.defaultPaths", () => {
  it("points at ~/.claude.json", () => {
    expect(claudeCodeAdapter.defaultPaths()[0]).toMatch(/\.claude\.json$/);
  });
});
