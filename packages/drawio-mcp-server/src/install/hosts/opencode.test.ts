import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { opencodeAdapter } from "./opencode.js";

const ENTRY = {
  command: "npx",
  args: ["-y", "drawio-mcp-server", "--editor"],
  env: {},
  transport: "stdio" as const,
};

describe("opencodeAdapter.merge", () => {
  it("adds mcp.drawio entry with type: local", () => {
    const out = opencodeAdapter.merge("", ENTRY, "drawio", {
      uninstall: false,
    });
    const parsed = JSON.parse(out);
    expect(parsed.mcp.drawio).toEqual({
      type: "local",
      command: ["npx", "-y", "drawio-mcp-server", "--editor"],
      enabled: true,
    });
  });

  it("preserves the $schema field", () => {
    const source = JSON.stringify(
      { $schema: "https://opencode.ai/config.json", mcp: {} },
      null,
      2,
    );
    const out = opencodeAdapter.merge(source, ENTRY, "drawio", {
      uninstall: false,
    });
    const parsed = JSON.parse(out);
    expect(parsed["$schema"]).toBe("https://opencode.ai/config.json");
  });

  it("uninstall removes the entry", () => {
    const source = JSON.stringify({
      mcp: { drawio: { type: "local", command: ["old"] } },
    });
    const out = opencodeAdapter.merge(source, ENTRY, "drawio", {
      uninstall: true,
    });
    expect(JSON.parse(out).mcp).toEqual({});
  });
});

describe("opencodeAdapter.defaultPaths", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "opencode-"));
    process.chdir(dir);
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns project config first when present", () => {
    writeFileSync(join(dir, "opencode.json"), "{}");
    const paths = opencodeAdapter.defaultPaths();
    expect(paths[0]).toBe(join(dir, "opencode.json"));
  });

  it("falls back to global ~/.config/opencode/opencode.json otherwise", () => {
    const paths = opencodeAdapter.defaultPaths();
    expect(paths[paths.length - 1]).toMatch(
      /\.config\/opencode\/opencode\.json$/,
    );
  });
});
