import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import {
  mkdtempSync,
  rmSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BIN = join(__dirname, "..", "..", "build", "index.js");

// Sandbox every adapter's defaultPaths() resolution so a spawned `install`
// process can never resolve to the real developer's home directory.
// homedir() reads HOME on POSIX and USERPROFILE/HOMEDRIVE+HOMEPATH on
// Windows; claude-desktop's resolver reads APPDATA directly on win32.
function isolateEnv(homeDir: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  env.HOME = homeDir;
  env.USERPROFILE = homeDir;
  env.APPDATA = join(homeDir, "AppData", "Roaming");
  env.LOCALAPPDATA = join(homeDir, "AppData", "Local");
  env.HOMEDRIVE = "C:"; // benign default; ignored on POSIX
  env.HOMEPATH = homeDir;
  delete env.XDG_CONFIG_HOME;
  delete env.XDG_DATA_HOME;
  delete env.XDG_STATE_HOME;
  delete env.XDG_CACHE_HOME;
  return env;
}

describe("install subcommand — end to end", () => {
  let dir: string;
  let home: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "drawio-e2e-"));
    home = mkdtempSync(join(tmpdir(), "drawio-home-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  });

  function run(args: string[]) {
    return spawnSync("node", [BIN, "install", ...args], {
      encoding: "utf8",
      env: isolateEnv(home),
      cwd: home,
    });
  }

  it("codex --print emits TOML on stdout, no file written", () => {
    const target = join(dir, "codex.toml");
    const r = run(["codex", "--print", "--config-path", target]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("[mcp_servers.drawio]");
    expect(existsSync(target)).toBe(false);
  });

  it("zed --print emits JSON", () => {
    const target = join(dir, "zed.json");
    const r = run(["zed", "--print", "--config-path", target]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('"context_servers"');
  });

  it("codex writes to target when --yes passed", () => {
    const target = join(dir, "codex.toml");
    const r = run(["codex", "--yes", "--config-path", target]);
    expect(r.status).toBe(0);
    expect(existsSync(target)).toBe(true);
    expect(readFileSync(target, "utf8")).toContain("[mcp_servers.drawio]");
  });

  it("codex refuses to overwrite non-empty target without --yes and returns exit 4", () => {
    const target = join(dir, "codex.toml");
    const first = run(["codex", "--yes", "--config-path", target]);
    expect(first.status).toBe(0);
    const modified = readFileSync(target, "utf8").replace(
      "drawio-mcp-server",
      "drawio-mcp-server-old",
    );
    writeFileSync(target, modified);
    const second = run(["codex", "--config-path", target]);
    expect(second.status).toBe(4);
    expect(second.stderr).toContain("Re-run with --yes");
  });

  it("all with per-host config paths writes to each, and never touches unoverridden adapters' real paths", () => {
    const codexPath = join(dir, "codex.toml");
    const zedPath = join(dir, "zed.json");
    const r = run([
      "all",
      "--yes",
      "--config-path",
      `codex=${codexPath}`,
      "--config-path",
      `zed=${zedPath}`,
    ]);
    expect(r.status).toBe(0);
    expect(existsSync(codexPath)).toBe(true);
    expect(existsSync(zedPath)).toBe(true);

    // opencode, claude-desktop, and claude-code got no --config-path
    // override. With HOME sandboxed to a fresh temp dir, their
    // defaultPaths() resolve to non-existent files, so detect() reports
    // "absent" and applyAll() skips them entirely — proving isolation
    // rather than just asserting the explicit overrides worked.
    expect(existsSync(join(home, ".claude.json"))).toBe(false);
    expect(
      existsSync(join(home, ".config", "Claude", "claude_desktop_config.json")),
    ).toBe(false);
    expect(existsSync(join(home, ".config", "opencode", "opencode.json"))).toBe(
      false,
    );
  });

  it("returns exit 1 on unknown host", () => {
    const r = run(["bogus"]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("unknown host");
  });
});
