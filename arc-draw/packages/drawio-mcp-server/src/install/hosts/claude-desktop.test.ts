import { describe, it, expect } from "@jest/globals";
import {
  claudeDesktopAdapter,
  resolveClaudeDesktopPath,
} from "./claude-desktop.js";

const ENTRY = {
  command: "npx",
  args: ["-y", "drawio-mcp-server", "--editor"],
  env: {},
  transport: "stdio" as const,
};

describe("claudeDesktopAdapter.merge", () => {
  it("adds mcpServers.drawio", () => {
    const out = claudeDesktopAdapter.merge("", ENTRY, "drawio", {
      uninstall: false,
    });
    const parsed = JSON.parse(out);
    expect(parsed.mcpServers.drawio).toEqual({
      command: "npx",
      args: ["-y", "drawio-mcp-server", "--editor"],
    });
  });

  it("preserves comments in jsonc source", () => {
    const source = [
      "{",
      "  // pinned by me",
      '  "mcpServers": {',
      '    "other": { "command": "x" }',
      "  }",
      "}",
    ].join("\n");
    const out = claudeDesktopAdapter.merge(source, ENTRY, "drawio", {
      uninstall: false,
    });
    expect(out).toContain("// pinned by me");
    expect(out).toContain('"drawio"');
  });

  it("uninstall removes the entry", () => {
    const source = JSON.stringify({
      mcpServers: { drawio: { command: "old" } },
    });
    const out = claudeDesktopAdapter.merge(source, ENTRY, "drawio", {
      uninstall: true,
    });
    expect(JSON.parse(out).mcpServers).toEqual({});
  });
});

describe("resolveClaudeDesktopPath", () => {
  it("darwin uses Application Support", () => {
    expect(resolveClaudeDesktopPath("darwin", "/Users/me", {})).toMatch(
      /Library\/Application Support\/Claude\/claude_desktop_config\.json$/,
    );
  });
  it("win32 uses APPDATA when set", () => {
    expect(
      resolveClaudeDesktopPath("win32", "C:\\Users\\me", {
        APPDATA: "C:\\Users\\me\\AppData\\Roaming",
      }),
    ).toMatch(/AppData\\Roaming\\Claude\\claude_desktop_config\.json$/);
  });
  it("linux uses ~/.config/Claude", () => {
    expect(resolveClaudeDesktopPath("linux", "/home/me", {})).toBe(
      "/home/me/.config/Claude/claude_desktop_config.json",
    );
  });
});
