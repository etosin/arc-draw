import { describe, it, expect } from "@jest/globals";
import { zedAdapter } from "./zed.js";

const ENTRY = {
  command: "npx",
  args: ["-y", "drawio-mcp-server", "--editor"],
  env: {},
  transport: "stdio" as const,
};

describe("zedAdapter.merge", () => {
  it("adds context_servers.drawio to empty file", () => {
    const out = zedAdapter.merge("", ENTRY, "drawio", { uninstall: false });
    const parsed = JSON.parse(out);
    expect(parsed.context_servers.drawio).toEqual({
      command: "npx",
      args: ["-y", "drawio-mcp-server", "--editor"],
      env: {},
    });
  });

  it("preserves other keys", () => {
    const source = JSON.stringify(
      { theme: "One Dark", context_servers: { other: { command: "x" } } },
      null,
      2,
    );
    const out = zedAdapter.merge(source, ENTRY, "drawio", { uninstall: false });
    const parsed = JSON.parse(out);
    expect(parsed.theme).toBe("One Dark");
    expect(parsed.context_servers.other).toEqual({ command: "x" });
    expect(parsed.context_servers.drawio.command).toBe("npx");
  });

  it("uninstall removes the entry", () => {
    const source = JSON.stringify({
      context_servers: { drawio: { command: "old" } },
    });
    const out = zedAdapter.merge(source, ENTRY, "drawio", { uninstall: true });
    expect(JSON.parse(out).context_servers).toEqual({});
  });

  it("uninstall on missing entry is a no-op", () => {
    const source = JSON.stringify({
      context_servers: { other: { command: "x" } },
    });
    const out = zedAdapter.merge(source, ENTRY, "drawio", { uninstall: true });
    expect(JSON.parse(out).context_servers.other).toEqual({ command: "x" });
  });
});

describe("zedAdapter.defaultPaths", () => {
  it("points at ~/.config/zed/settings.json", () => {
    const [p] = zedAdapter.defaultPaths();
    expect(p).toMatch(/\.config\/zed\/settings\.json$/);
  });
});
