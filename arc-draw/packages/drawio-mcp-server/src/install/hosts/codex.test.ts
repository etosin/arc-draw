import { describe, it, expect } from "@jest/globals";
import { codexAdapter } from "./codex.js";

const ENTRY = {
  command: "npx",
  args: ["-y", "drawio-mcp-server", "--editor"],
  env: {},
  transport: "stdio" as const,
};

describe("codexAdapter.merge", () => {
  it("inserts [mcp_servers.drawio] into empty file", () => {
    const out = codexAdapter.merge("", ENTRY, "drawio", { uninstall: false });
    expect(out).toContain("[mcp_servers.drawio]");
    expect(out).toContain('command = "npx"');
    expect(out).toContain('args = ["-y", "drawio-mcp-server", "--editor"]');
  });

  it("preserves existing entries and comments", () => {
    const source = [
      "# my codex config",
      "[mcp_servers.other]",
      'command = "other-server"',
      "",
    ].join("\n");
    const out = codexAdapter.merge(source, ENTRY, "drawio", {
      uninstall: false,
    });
    expect(out).toContain("# my codex config");
    expect(out).toContain("[mcp_servers.other]");
    expect(out).toContain('command = "other-server"');
    expect(out).toContain("[mcp_servers.drawio]");
  });

  it("updates existing drawio entry idempotently", () => {
    const source = ["[mcp_servers.drawio]", 'command = "old"', ""].join("\n");
    const out1 = codexAdapter.merge(source, ENTRY, "drawio", {
      uninstall: false,
    });
    const out2 = codexAdapter.merge(out1, ENTRY, "drawio", {
      uninstall: false,
    });
    expect(out2).toBe(out1);
    expect(out1).toContain('command = "npx"');
    expect(out1).not.toContain('command = "old"');
  });

  it("removes entry on uninstall and leaves other blocks intact", () => {
    const source = [
      "[mcp_servers.other]",
      'command = "other"',
      "",
      "[mcp_servers.drawio]",
      'command = "npx"',
      "",
    ].join("\n");
    const out = codexAdapter.merge(source, ENTRY, "drawio", {
      uninstall: true,
    });
    expect(out).toContain("[mcp_servers.other]");
    expect(out).not.toContain("[mcp_servers.drawio]");
  });

  it("round-trips non-empty env idempotently and removes env on uninstall", () => {
    const withEnv = {
      command: "npx",
      args: ["-y", "drawio-mcp-server", "--editor"],
      env: { FOO: "bar", HELLO: "world" },
      transport: "stdio" as const,
    };
    const first = codexAdapter.merge("", withEnv, "drawio", {
      uninstall: false,
    });
    expect(first).toContain("[mcp_servers.drawio]");
    expect(first).toContain("env = {");
    expect(first).toContain('FOO = "bar"');
    expect(first).toContain('HELLO = "world"');
    const second = codexAdapter.merge(first, withEnv, "drawio", {
      uninstall: false,
    });
    expect(second).toBe(first);
    const removed = codexAdapter.merge(first, withEnv, "drawio", {
      uninstall: true,
    });
    expect(removed).not.toContain("[mcp_servers.drawio]");
    expect(removed).not.toContain("FOO");
    expect(removed).not.toContain("HELLO");
    expect(removed).not.toContain("[env]");
    expect(removed).not.toContain("bar");
  });

  it("recognizes quoted-key header form", () => {
    const src = '[mcp_servers."drawio"]\ncommand = "old"\n';
    const out = codexAdapter.merge(src, ENTRY, "drawio", { uninstall: false });
    // Should update in place, not append a duplicate block.
    expect((out.match(/\[mcp_servers/g) ?? []).length).toBe(1);
    expect(out).toContain('command = "npx"');
  });

  it("recognizes whitespace-around-dot header form", () => {
    const src = '[mcp_servers . drawio]\ncommand = "old"\n';
    const out = codexAdapter.merge(src, ENTRY, "drawio", { uninstall: false });
    expect((out.match(/\[mcp_servers/g) ?? []).length).toBe(1);
    expect(out).toContain('command = "npx"');
  });

  it("throws on unsupported inline-in-parent form", () => {
    const src = '[mcp_servers]\ndrawio = { command = "old" }\n';
    expect(() =>
      codexAdapter.merge(src, ENTRY, "drawio", { uninstall: false }),
    ).toThrow(/inline-in-parent|move.*mcp_servers\.drawio/i);
  });

  it("does not confuse an indented [ array element with a sibling table header", () => {
    // Not real drawio schema, but proves robustness for future keys.
    const src = [
      "[mcp_servers.drawio]",
      'command = "old"',
      "args = [",
      "  [1, 2, 3],",
      "]",
      "",
      "[mcp_servers.other]",
      'command = "x"',
    ].join("\n");
    const out = codexAdapter.merge(src, ENTRY, "drawio", { uninstall: false });
    expect(out).toContain("[mcp_servers.other]");
    expect(out).toContain('command = "x"');
  });
});

describe("codexAdapter.defaultPaths", () => {
  it("points at ~/.codex/config.toml", () => {
    const paths = codexAdapter.defaultPaths();
    expect(paths[0]).toMatch(/\.codex\/config\.toml$/);
  });
});
