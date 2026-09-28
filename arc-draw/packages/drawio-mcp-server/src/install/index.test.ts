import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { parseArgs } from "./index.js";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("parseArgs", () => {
  it("parses host + defaults", () => {
    const opts = parseArgs(["codex"]);
    expect(opts).toEqual({
      host: "codex",
      name: "drawio",
      editor: true,
      httpPort: 3000,
      extraArgs: [],
      env: {},
      configPath: undefined,
      configPathByHost: {},
      print: false,
      dryRun: false,
      uninstall: false,
      yes: false,
    });
  });

  it("supports --no-editor, --name, --http-port, --extra-arg, --env, --config-path, --print, --dry-run, --uninstall, --yes", () => {
    const opts = parseArgs([
      "zed",
      "--no-editor",
      "--name",
      "diagrams",
      "--http-port",
      "4000",
      "--extra-arg",
      "--transport",
      "--extra-arg",
      "http",
      "--env",
      "FOO=bar",
      "--config-path",
      "/tmp/z.json",
      "--print",
      "--dry-run",
      "--uninstall",
      "--yes",
    ]);
    expect(opts).toEqual({
      host: "zed",
      name: "diagrams",
      editor: false,
      httpPort: 4000,
      extraArgs: ["--transport", "http"],
      env: { FOO: "bar" },
      configPath: "/tmp/z.json",
      configPathByHost: {},
      print: true,
      dryRun: true,
      uninstall: true,
      yes: true,
    });
  });

  it("throws on missing host", () => {
    expect(() => parseArgs([])).toThrow(/host required/);
  });

  it("throws on unknown flag", () => {
    expect(() => parseArgs(["codex", "--nope"])).toThrow(
      /unknown option: --nope/,
    );
  });
});

describe("dispatch (smoke)", () => {
  it("`install` before all other work exits 0 on --print without booting transport", () => {
    const bin = join(__dirname, "..", "..", "build", "index.js");
    const result = spawnSync(
      "node",
      [
        bin,
        "install",
        "codex",
        "--print",
        "--config-path",
        "/tmp/nonexistent-drawio-install-test.toml",
      ],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    expect(result.stdout).toContain("[mcp_servers.drawio]");
    expect(result.status).toBe(0);
  });
});

describe("runInstall (codex + --print)", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "drawio-install-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("prints codex TOML to stdout without touching disk", async () => {
    const target = join(dir, "config.toml");
    const chunks: string[] = [];
    const orig = process.stdout.write.bind(process.stdout);
    (process.stdout.write as unknown as (s: string) => boolean) = (s) => {
      chunks.push(String(s));
      return true;
    };
    const { runInstall } = await import("./index.js");
    const code = await runInstall([
      "codex",
      "--print",
      "--config-path",
      target,
    ]);
    process.stdout.write = orig;
    expect(code).toBe(0);
    expect(chunks.join("")).toContain("[mcp_servers.drawio]");
  });
});
