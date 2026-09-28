# Draw.io MCP Claude Code Plugin + Multi-Host Install Subcommand — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Claude Code plugin marketplace + plugin, a `drawio-mcp-server install <host>` subcommand covering Claude Desktop / Codex / Zed / OpenCode / Claude Code, and user-facing docs.

**Architecture:** Marketplace manifest at `.claude-plugin/marketplace.json` (top of repo). Plugin package at `packages/drawio-mcp-claude-plugin/` shipping `plugin.json` + two slash commands. Install subcommand as `install/` module inside `packages/drawio-mcp-server/`, dispatched from `src/index.ts` before any transport boot, per-host adapters behind a common interface, all writes atomic and format-preserving.

**Tech Stack:** TypeScript strict, Node.js 22/24, pnpm workspaces, Jest 30 (with `--experimental-vm-modules`), Biome for lint, `jsonc-parser` for JSON with comments, `smol-toml` for TOML round-trip, GitHub Actions.

## Global Constraints

- **Stdout discipline** — install subcommand only writes to stdout when `--print` is passed. `console.*` outside `src/index.ts`, `src/install/index.ts`, and test files is forbidden. Add `src/install/**` to Biome overrides for `noConsole` matching the pattern in the existing allowlist (or route diagnostics through a passed-in logger).
- **Test convention** — all new `*.test.ts` files start with `import { describe, it, expect, beforeEach, afterEach, jest } from "@jest/globals";` and colocate next to the source file.
- **Node version** — `>=22`. Existing `engines.node: ">=20.0.0"` in `package.json` stays.
- **Package manager** — `pnpm@10.8.1`. All new devDeps go through the pnpm workspace catalog if shared across packages; otherwise pin at the package level.
- **Server package name** — `drawio-mcp-server` (unchanged). New plugin package name — `drawio-mcp-claude-plugin` (`private: true`, not published to npm).
- **Marketplace slug** — `drawio-mcp-server` (matches repo). Plugin slug — `drawio`.
- **Version floor** — plugin + marketplace both start at `0.1.0`. Install subcommand ships in the next `drawio-mcp-server` minor bump; do NOT bump the server version as part of this plan — leave that for release time.
- **Author + Co-Author for commits** — author `claude-code-anthropic-opus-4-7 <claude-code-anthropic-opus-4-7@opencode.ai>`, `Co-Authored-By: Ladislav Gazo <ladislav.gazo@gmail.com>`. Every commit in this plan uses that pair.
- **Formatting** — Biome `pnpm --filter drawio-mcp-server lint`, Prettier `pnpm --filter drawio-mcp-server format`. Run before each commit that touches TS.

---

## File Structure

**New — server package (`packages/drawio-mcp-server/`):**

- `src/install/index.ts` — argv parser + entrypoint (`runInstall`).
- `src/install/types.ts` — shared types (`HostAdapter`, `McpEntry`, `InstallOptions`, `DetectResult`).
- `src/install/config-io.ts` — atomic write, backup, refuse-overwrite, unified diff.
- `src/install/hosts/codex.ts` — TOML adapter.
- `src/install/hosts/claude-desktop.ts` — JSONC adapter (per-OS paths).
- `src/install/hosts/zed.ts` — JSON adapter.
- `src/install/hosts/opencode.ts` — JSONC adapter (project-first, then global).
- `src/install/hosts/claude-code.ts` — `claude` CLI first, JSON fallback.
- `src/install/hosts/index.ts` — registry mapping host id → adapter.
- `src/install/index.test.ts`, `src/install/config-io.test.ts`, `src/install/hosts/*.test.ts`, `src/install/install.integration.test.ts`.

**Modified — server package:**

- `src/index.ts` — pre-boot dispatch (`argv[2] === "install"` → import + run + exit).
- `package.json` — new devDeps (`jsonc-parser`, `smol-toml`), possibly diff lib.
- `biome.json` — add `src/install/**` to appropriate override if diagnostics need `console.error`.

**New — plugin package (`packages/drawio-mcp-claude-plugin/`):**

- `.claude-plugin/plugin.json`.
- `commands/drawio-open.md`.
- `commands/drawio-status.md`.
- `README.md`.
- `package.json` (`private: true`).
- `tests/manifest.test.ts`.
- `tests/commands.test.ts`.
- `tests/fixtures/plugin.schema.json`, `tests/fixtures/marketplace.schema.json`.
- `tsconfig.json`, `jest.config.js`, `biome.json` (or extended from root).

**New — top of repo:**

- `.claude-plugin/marketplace.json`.

**New — CI:**

- `.github/workflows/claude-plugin-ci.yml`.

**New — docs:**

- `docs/PLUGINS.md`.

**Modified — docs:**

- `README.md` — replace multi-host collapsibles with pointer + keep one manual-install fallback.
- `CONFIG.md` — add "Install subcommand" cross-link.
- `pnpm-workspace.yaml` — new catalog entries if any shared devDeps.

---

## Task 1: Install subcommand scaffold — types, argv parser, `config-io.ts`, pre-boot dispatch

**Files:**

- Create: `packages/drawio-mcp-server/src/install/types.ts`
- Create: `packages/drawio-mcp-server/src/install/config-io.ts`
- Create: `packages/drawio-mcp-server/src/install/index.ts`
- Create: `packages/drawio-mcp-server/src/install/hosts/index.ts` (empty registry for now)
- Create: `packages/drawio-mcp-server/src/install/config-io.test.ts`
- Create: `packages/drawio-mcp-server/src/install/index.test.ts`
- Modify: `packages/drawio-mcp-server/src/index.ts` (add pre-boot dispatch)
- Modify: `packages/drawio-mcp-server/package.json` (add devDeps: `jsonc-parser`, `smol-toml`, `diff`)

**Interfaces:**

- Consumes: nothing.
- Produces:
  - `HostAdapter` interface (in `types.ts`):
    ```ts
    export interface McpEntry {
      command: string;
      args: string[];
      env: Record<string, string>;
      transport: "stdio";
    }
    export type DetectResult = "installed" | "config-present" | "absent";
    export interface HostAdapter {
      id: string;
      displayName: string;
      defaultPaths(): string[];
      detect(): Promise<DetectResult>;
      read(path: string): Promise<string>;
      merge(source: string, entry: McpEntry, name: string, opts: { uninstall: boolean }): string;
      diffLabel(): string;
    }
    ```
  - `InstallOptions` (in `types.ts`):
    ```ts
    export interface InstallOptions {
      host: string;
      name: string;
      editor: boolean;
      httpPort: number;
      extraArgs: string[];
      env: Record<string, string>;
      configPath?: string;
      print: boolean;
      dryRun: boolean;
      uninstall: boolean;
      yes: boolean;
    }
    ```
  - `parseArgs(argv: string[]): InstallOptions` (in `index.ts`).
  - `runInstall(argv: string[]): Promise<number>` (in `index.ts`) — returns exit code.
  - `atomicWrite(path: string, contents: string): Promise<void>` (in `config-io.ts`).
  - `unifiedDiff(oldText: string, newText: string, label: string): string` (in `config-io.ts`).
  - `ensureBackup(path: string): Promise<string | null>` (in `config-io.ts`).

- [ ] **Step 1: Add devDeps and install**

Run:

```bash
pnpm --filter drawio-mcp-server add -D jsonc-parser@3.3.1 smol-toml@1.3.4 diff@8.0.1 @types/diff@8.0.0
```

Expected: `pnpm-lock.yaml` updates; both packages present under `packages/drawio-mcp-server/node_modules/`.

- [ ] **Step 2: Write failing test for `parseArgs`**

Create `packages/drawio-mcp-server/src/install/index.test.ts`:

```ts
import { describe, it, expect } from "@jest/globals";
import { parseArgs } from "./index.js";

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
      "--name", "diagrams",
      "--http-port", "4000",
      "--extra-arg", "--transport", "--extra-arg", "http",
      "--env", "FOO=bar",
      "--config-path", "/tmp/z.json",
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
    expect(() => parseArgs(["codex", "--nope"])).toThrow(/unknown option: --nope/);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run:

```bash
pnpm --filter drawio-mcp-server run build
NODE_OPTIONS=--experimental-vm-modules pnpm --filter drawio-mcp-server test -- build/install/index.test.js
```

Expected: FAIL (`parseArgs` not exported / module missing).

- [ ] **Step 4: Implement `types.ts`**

Create `packages/drawio-mcp-server/src/install/types.ts`:

```ts
export interface McpEntry {
  command: string;
  args: string[];
  env: Record<string, string>;
  transport: "stdio";
}

export type DetectResult = "installed" | "config-present" | "absent";

export interface HostAdapter {
  id: string;
  displayName: string;
  defaultPaths(): string[];
  detect(): Promise<DetectResult>;
  read(path: string): Promise<string>;
  merge(
    source: string,
    entry: McpEntry,
    name: string,
    opts: { uninstall: boolean },
  ): string;
  diffLabel(): string;
}

export interface InstallOptions {
  host: string;
  name: string;
  editor: boolean;
  httpPort: number;
  extraArgs: string[];
  env: Record<string, string>;
  configPath?: string;
  print: boolean;
  dryRun: boolean;
  uninstall: boolean;
  yes: boolean;
}
```

- [ ] **Step 5: Implement `parseArgs` and `runInstall` stub**

Create `packages/drawio-mcp-server/src/install/index.ts`:

```ts
import { InstallOptions } from "./types.js";

const SUPPORTED_HOSTS = new Set([
  "claude-code",
  "claude-desktop",
  "codex",
  "zed",
  "opencode",
  "all",
]);

export function parseArgs(argv: string[]): InstallOptions {
  if (argv.length === 0) {
    throw new Error("host required — usage: drawio-mcp-server install <host> [options]");
  }
  const host = argv[0];
  if (!SUPPORTED_HOSTS.has(host)) {
    throw new Error(`unknown host: ${host} (supported: ${[...SUPPORTED_HOSTS].join(", ")})`);
  }

  const opts: InstallOptions = {
    host,
    name: "drawio",
    editor: true,
    httpPort: 3000,
    extraArgs: [],
    env: {},
    configPath: undefined,
    print: false,
    dryRun: false,
    uninstall: false,
    yes: false,
  };

  let i = 1;
  while (i < argv.length) {
    const flag = argv[i];
    switch (flag) {
      case "--name": opts.name = argv[++i]; break;
      case "--editor": opts.editor = true; break;
      case "--no-editor": opts.editor = false; break;
      case "--http-port": opts.httpPort = Number.parseInt(argv[++i], 10); break;
      case "--extra-arg": opts.extraArgs.push(argv[++i]); break;
      case "--env": {
        const kv = argv[++i];
        const eq = kv.indexOf("=");
        if (eq <= 0) throw new Error(`invalid --env: expected KEY=VALUE, got ${kv}`);
        opts.env[kv.slice(0, eq)] = kv.slice(eq + 1);
        break;
      }
      case "--config-path": opts.configPath = argv[++i]; break;
      case "--print": opts.print = true; break;
      case "--dry-run": opts.dryRun = true; break;
      case "--uninstall": opts.uninstall = true; break;
      case "--yes": opts.yes = true; break;
      default: throw new Error(`unknown option: ${flag}`);
    }
    i++;
  }
  return opts;
}

export async function runInstall(_argv: string[]): Promise<number> {
  return 0;
}
```

- [ ] **Step 6: Run test to verify it passes**

Run:

```bash
pnpm --filter drawio-mcp-server run build
NODE_OPTIONS=--experimental-vm-modules pnpm --filter drawio-mcp-server test -- build/install/index.test.js
```

Expected: PASS (4 tests).

- [ ] **Step 7: Write failing tests for `config-io.ts`**

Create `packages/drawio-mcp-server/src/install/config-io.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { mkdtempSync, readFileSync, existsSync, writeFileSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { atomicWrite, ensureBackup, unifiedDiff } from "./config-io.js";

describe("config-io", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "drawio-install-")); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it("atomicWrite writes contents and leaves no tmp file", async () => {
    const target = join(dir, "cfg.json");
    await atomicWrite(target, "{\n  \"a\": 1\n}\n");
    expect(readFileSync(target, "utf8")).toBe("{\n  \"a\": 1\n}\n");
    expect(readdirSync(dir).filter((f) => f.startsWith(".cfg.json."))).toEqual([]);
  });

  it("ensureBackup copies once and returns backup path", async () => {
    const target = join(dir, "cfg.json");
    writeFileSync(target, "orig");
    const bak = await ensureBackup(target);
    expect(bak).toMatch(/cfg\.json\.bak-\d+$/);
    expect(readFileSync(bak!, "utf8")).toBe("orig");
  });

  it("ensureBackup returns null when file missing", async () => {
    expect(await ensureBackup(join(dir, "nope.json"))).toBeNull();
  });

  it("unifiedDiff produces a diff header referencing the label", () => {
    const d = unifiedDiff("a\n", "b\n", "cfg.json");
    expect(d).toContain("--- cfg.json");
    expect(d).toContain("+++ cfg.json");
    expect(d).toContain("-a");
    expect(d).toContain("+b");
  });
});
```

- [ ] **Step 8: Run tests to verify they fail**

Run:

```bash
pnpm --filter drawio-mcp-server run build
NODE_OPTIONS=--experimental-vm-modules pnpm --filter drawio-mcp-server test -- build/install/config-io.test.js
```

Expected: FAIL (module missing).

- [ ] **Step 9: Implement `config-io.ts`**

Create `packages/drawio-mcp-server/src/install/config-io.ts`:

```ts
import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";
import { dirname, basename, join } from "node:path";
import { createPatch } from "diff";

export async function atomicWrite(target: string, contents: string): Promise<void> {
  const dir = dirname(target);
  const tmp = join(dir, `.${basename(target)}.${process.pid}.${Date.now()}.tmp`);
  await fs.writeFile(tmp, contents, "utf8");
  await fs.rename(tmp, target);
}

export async function ensureBackup(target: string): Promise<string | null> {
  if (!existsSync(target)) return null;
  const bak = `${target}.bak-${Date.now()}`;
  const contents = await fs.readFile(target, "utf8");
  await fs.writeFile(bak, contents, "utf8");
  return bak;
}

export function unifiedDiff(oldText: string, newText: string, label: string): string {
  return createPatch(label, oldText, newText, "", "", { context: 3 });
}
```

- [ ] **Step 10: Run tests to verify they pass**

Run:

```bash
pnpm --filter drawio-mcp-server run build
NODE_OPTIONS=--experimental-vm-modules pnpm --filter drawio-mcp-server test -- build/install/config-io.test.js
```

Expected: PASS (4 tests).

- [ ] **Step 11: Add pre-boot dispatch to `src/index.ts`**

Modify `packages/drawio-mcp-server/src/index.ts` — insert immediately after the `fatalLog` declaration around line 65 (before any config parsing):

```ts
if (process.argv[2] === "install") {
  const { runInstall } = await import("./install/index.js");
  try {
    const code = await runInstall(process.argv.slice(3));
    process.exit(code);
  } catch (err) {
    fatalLog.log("error", err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
```

The rest of `index.ts` continues unchanged.

- [ ] **Step 12: Add smoke test for dispatch**

Append to `packages/drawio-mcp-server/src/install/index.test.ts`:

```ts
import { spawnSync } from "node:child_process";
import { join } from "node:path";

describe("dispatch (smoke)", () => {
  it("`install` before all other work exits 0 on --print without booting transport", () => {
    const bin = join(__dirname, "..", "..", "build", "index.js");
    const result = spawnSync("node", [bin, "install", "codex", "--print", "--config-path", "/tmp/nonexistent-drawio-install-test.toml"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    expect(result.stdout).toContain("[mcp_servers.drawio]");
    expect(result.status).toBe(0);
  });
});
```

(This test will be re-run at the end of Task 2 once the codex adapter is wired. For now it will fail — that's expected and picked up by Task 2.)

- [ ] **Step 13: Run lint + format**

Run:

```bash
pnpm --filter drawio-mcp-server lint
pnpm --filter drawio-mcp-server format
```

Expected: 0 errors.

- [ ] **Step 14: Commit**

```bash
GIT_AUTHOR_NAME=claude-code-anthropic-opus-4-7 \
GIT_AUTHOR_EMAIL=claude-code-anthropic-opus-4-7@opencode.ai \
git add packages/drawio-mcp-server/src/install/ \
        packages/drawio-mcp-server/src/index.ts \
        packages/drawio-mcp-server/package.json \
        pnpm-lock.yaml
git commit -m "$(cat <<'EOF'
feat(install): scaffold `install` subcommand and shared config-io helpers

Adds pre-boot dispatch in src/index.ts, an argv parser covering every
documented flag, and shared `atomicWrite` / `ensureBackup` /
`unifiedDiff` helpers. Host adapters land in follow-up tasks.

Co-Authored-By: Ladislav Gazo <ladislav.gazo@gmail.com>
EOF
)"
```

---

## Task 2: Codex adapter (TOML round-trip)

**Files:**

- Create: `packages/drawio-mcp-server/src/install/hosts/codex.ts`
- Create: `packages/drawio-mcp-server/src/install/hosts/codex.test.ts`
- Modify: `packages/drawio-mcp-server/src/install/hosts/index.ts` (register codex)
- Modify: `packages/drawio-mcp-server/src/install/index.ts` (`runInstall` handles single-host case; wires `--print` / write flow)

**Interfaces:**

- Consumes: `HostAdapter`, `McpEntry`, `InstallOptions` from Task 1; `atomicWrite`, `ensureBackup`, `unifiedDiff` from Task 1.
- Produces:
  - `codexAdapter: HostAdapter` (id `codex`).
  - `runInstall` end-to-end path for a single non-`all` host: read → merge → print/diff/write.
  - `buildEntry(opts: InstallOptions): McpEntry` (helper in `index.ts`) — used by every adapter task hereafter.

- [ ] **Step 1: Write failing test for `codexAdapter.merge`**

Create `packages/drawio-mcp-server/src/install/hosts/codex.test.ts`:

```ts
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
    const out = codexAdapter.merge(source, ENTRY, "drawio", { uninstall: false });
    expect(out).toContain("# my codex config");
    expect(out).toContain("[mcp_servers.other]");
    expect(out).toContain('command = "other-server"');
    expect(out).toContain("[mcp_servers.drawio]");
  });

  it("updates existing drawio entry idempotently", () => {
    const source = ['[mcp_servers.drawio]', 'command = "old"', ''].join("\n");
    const out1 = codexAdapter.merge(source, ENTRY, "drawio", { uninstall: false });
    const out2 = codexAdapter.merge(out1, ENTRY, "drawio", { uninstall: false });
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
    const out = codexAdapter.merge(source, ENTRY, "drawio", { uninstall: true });
    expect(out).toContain("[mcp_servers.other]");
    expect(out).not.toContain("[mcp_servers.drawio]");
  });
});

describe("codexAdapter.defaultPaths", () => {
  it("points at ~/.codex/config.toml", () => {
    const paths = codexAdapter.defaultPaths();
    expect(paths[0]).toMatch(/\.codex\/config\.toml$/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm --filter drawio-mcp-server run build
NODE_OPTIONS=--experimental-vm-modules pnpm --filter drawio-mcp-server test -- build/install/hosts/codex.test.js
```

Expected: FAIL (module missing).

- [ ] **Step 3: Implement `codex.ts`**

Create `packages/drawio-mcp-server/src/install/hosts/codex.ts`:

```ts
import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parse, stringify } from "smol-toml";
import type { HostAdapter, McpEntry } from "../types.js";

export const codexAdapter: HostAdapter = {
  id: "codex",
  displayName: "Codex CLI",
  defaultPaths(): string[] {
    return [join(homedir(), ".codex", "config.toml")];
  },
  async detect() {
    return existsSync(codexAdapter.defaultPaths()[0]) ? "installed" : "absent";
  },
  async read(path: string): Promise<string> {
    if (!existsSync(path)) return "";
    return fs.readFile(path, "utf8");
  },
  merge(source, entry, name, { uninstall }) {
    const doc = source.trim() === "" ? {} : (parse(source) as Record<string, unknown>);
    const servers = ((doc.mcp_servers as Record<string, unknown> | undefined) ?? {}) as Record<string, unknown>;
    if (uninstall) {
      delete servers[name];
    } else {
      servers[name] = tomlEntry(entry);
    }
    if (Object.keys(servers).length === 0) {
      delete doc.mcp_servers;
    } else {
      doc.mcp_servers = servers;
    }
    return stringify(doc);
  },
  diffLabel() {
    return codexAdapter.defaultPaths()[0];
  },
};

function tomlEntry(entry: McpEntry): Record<string, unknown> {
  const out: Record<string, unknown> = {
    command: entry.command,
    args: entry.args,
  };
  if (Object.keys(entry.env).length > 0) out.env = entry.env;
  return out;
}
```

**Note on `smol-toml`:** it round-trips comments only outside the sections it rewrites. That's acceptable for v1; a stronger guarantee lives under "Open items" in the spec. If tests find that `smol-toml` loses comments in preserved sections, swap in `@iarna/toml` and re-run.

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
pnpm --filter drawio-mcp-server run build
NODE_OPTIONS=--experimental-vm-modules pnpm --filter drawio-mcp-server test -- build/install/hosts/codex.test.js
```

Expected: PASS (5 tests).

- [ ] **Step 5: Wire host registry**

Replace `packages/drawio-mcp-server/src/install/hosts/index.ts` contents:

```ts
import type { HostAdapter } from "../types.js";
import { codexAdapter } from "./codex.js";

export const HOST_ADAPTERS: Record<string, HostAdapter> = {
  [codexAdapter.id]: codexAdapter,
};

export function listHostIds(): string[] {
  return Object.keys(HOST_ADAPTERS);
}
```

- [ ] **Step 6: Extend `runInstall` for single-host flow**

Replace the placeholder `runInstall` in `packages/drawio-mcp-server/src/install/index.ts` with:

```ts
import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";
import type { HostAdapter, InstallOptions, McpEntry } from "./types.js";
import { HOST_ADAPTERS } from "./hosts/index.js";
import { atomicWrite, ensureBackup, unifiedDiff } from "./config-io.js";

export function buildEntry(opts: InstallOptions): McpEntry {
  const args = ["-y", "drawio-mcp-server"];
  if (opts.editor) args.push("--editor");
  if (opts.httpPort !== 3000) args.push("--http-port", String(opts.httpPort));
  for (const a of opts.extraArgs) args.push(a);
  return { command: "npx", args, env: opts.env, transport: "stdio" };
}

export async function runInstall(argv: string[]): Promise<number> {
  let opts: InstallOptions;
  try {
    opts = parseArgs(argv);
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    return 1;
  }
  if (opts.host === "all") {
    process.stderr.write("`install all` will be wired in a later task\n");
    return 1;
  }
  const adapter = HOST_ADAPTERS[opts.host];
  if (!adapter) {
    process.stderr.write(`unsupported host: ${opts.host}\n`);
    return 1;
  }
  return applySingle(adapter, opts);
}

async function applySingle(adapter: HostAdapter, opts: InstallOptions): Promise<number> {
  const target = opts.configPath ?? adapter.defaultPaths()[0];
  const source = existsSync(target) ? await fs.readFile(target, "utf8") : "";
  const entry = buildEntry(opts);
  const next = adapter.merge(source, entry, opts.name, { uninstall: opts.uninstall });

  if (opts.print) {
    process.stdout.write(next.endsWith("\n") ? next : `${next}\n`);
    return 0;
  }
  if (source === next) {
    process.stderr.write(`no change: ${target}\n`);
    return 0;
  }
  const diff = unifiedDiff(source, next, target);
  if (opts.dryRun) {
    process.stderr.write(diff);
    return 0;
  }
  if (existsSync(target) && !opts.yes) {
    process.stderr.write(diff);
    process.stderr.write(`\nRe-run with --yes to apply changes.\n`);
    return 4;
  }
  await ensureBackup(target);
  await atomicWrite(target, next);
  process.stderr.write(`updated: ${target}\n`);
  return 0;
}
```

- [ ] **Step 7: Update dispatch smoke test to expect codex output**

The dispatch smoke test in Task 1 Step 12 was already written to expect codex `--print` output. It should now pass.

- [ ] **Step 8: Add end-to-end unit test for `runInstall` with codex + `--print` + `--config-path`**

Append to `packages/drawio-mcp-server/src/install/index.test.ts`:

```ts
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

describe("runInstall (codex + --print)", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "drawio-install-")); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it("prints codex TOML to stdout without touching disk", async () => {
    const target = join(dir, "config.toml");
    const chunks: string[] = [];
    const orig = process.stdout.write.bind(process.stdout);
    (process.stdout.write as unknown as (s: string) => boolean) = (s) => { chunks.push(String(s)); return true; };
    const { runInstall } = await import("./index.js");
    const code = await runInstall(["codex", "--print", "--config-path", target]);
    process.stdout.write = orig;
    expect(code).toBe(0);
    expect(chunks.join("")).toContain("[mcp_servers.drawio]");
  });
});
```

- [ ] **Step 9: Run full install test suite**

Run:

```bash
pnpm --filter drawio-mcp-server run build
NODE_OPTIONS=--experimental-vm-modules pnpm --filter drawio-mcp-server test -- build/install/
```

Expected: PASS (all Task 1 + Task 2 tests).

- [ ] **Step 10: Lint + format + commit**

```bash
pnpm --filter drawio-mcp-server lint
pnpm --filter drawio-mcp-server format

GIT_AUTHOR_NAME=claude-code-anthropic-opus-4-7 \
GIT_AUTHOR_EMAIL=claude-code-anthropic-opus-4-7@opencode.ai \
git add packages/drawio-mcp-server/src/install/
git commit -m "$(cat <<'EOF'
feat(install): add codex adapter (TOML round-trip)

Codex adapter writes/removes `[mcp_servers.drawio]` in
~/.codex/config.toml via smol-toml, and `runInstall` now handles the
single-host flow end-to-end for print / dry-run / write / uninstall.

Co-Authored-By: Ladislav Gazo <ladislav.gazo@gmail.com>
EOF
)"
```

---

## Task 3: Zed adapter (JSON)

**Files:**

- Create: `packages/drawio-mcp-server/src/install/hosts/zed.ts`
- Create: `packages/drawio-mcp-server/src/install/hosts/zed.test.ts`
- Modify: `packages/drawio-mcp-server/src/install/hosts/index.ts` (register zed)

**Interfaces:**

- Consumes: `HostAdapter`, `McpEntry` from Task 1.
- Produces: `zedAdapter: HostAdapter` (id `zed`).

- [ ] **Step 1: Write failing tests**

Create `packages/drawio-mcp-server/src/install/hosts/zed.test.ts`:

```ts
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
    const source = JSON.stringify({ theme: "One Dark", context_servers: { other: { command: "x" } } }, null, 2);
    const out = zedAdapter.merge(source, ENTRY, "drawio", { uninstall: false });
    const parsed = JSON.parse(out);
    expect(parsed.theme).toBe("One Dark");
    expect(parsed.context_servers.other).toEqual({ command: "x" });
    expect(parsed.context_servers.drawio.command).toBe("npx");
  });

  it("uninstall removes the entry", () => {
    const source = JSON.stringify({ context_servers: { drawio: { command: "old" } } });
    const out = zedAdapter.merge(source, ENTRY, "drawio", { uninstall: true });
    expect(JSON.parse(out).context_servers).toEqual({});
  });

  it("uninstall on missing entry is a no-op", () => {
    const source = JSON.stringify({ context_servers: { other: { command: "x" } } });
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm --filter drawio-mcp-server run build
NODE_OPTIONS=--experimental-vm-modules pnpm --filter drawio-mcp-server test -- build/install/hosts/zed.test.js
```

Expected: FAIL (module missing).

- [ ] **Step 3: Implement `zed.ts`**

Create `packages/drawio-mcp-server/src/install/hosts/zed.ts`:

```ts
import { existsSync, promises as fs } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { applyEdits, modify, parse } from "jsonc-parser";
import type { HostAdapter, McpEntry } from "../types.js";

export const zedAdapter: HostAdapter = {
  id: "zed",
  displayName: "Zed",
  defaultPaths() {
    return [join(homedir(), ".config", "zed", "settings.json")];
  },
  async detect() {
    return existsSync(zedAdapter.defaultPaths()[0]) ? "installed" : "absent";
  },
  async read(path: string) {
    return existsSync(path) ? fs.readFile(path, "utf8") : "";
  },
  merge(source, entry, name, { uninstall }) {
    let text = source.trim() === "" ? "{}\n" : source;
    const parsed = parse(text) as Record<string, unknown> | undefined;
    if (!parsed || typeof parsed !== "object") text = "{}\n";
    const edits = uninstall
      ? modify(text, ["context_servers", name], undefined, { formattingOptions: { insertSpaces: true, tabSize: 2 } })
      : modify(text, ["context_servers", name], toValue(entry), { formattingOptions: { insertSpaces: true, tabSize: 2 } });
    return applyEdits(text, edits);
  },
  diffLabel() {
    return zedAdapter.defaultPaths()[0];
  },
};

function toValue(entry: McpEntry) {
  return { command: entry.command, args: entry.args, env: entry.env };
}
```

- [ ] **Step 4: Register in host registry**

Modify `packages/drawio-mcp-server/src/install/hosts/index.ts`:

```ts
import type { HostAdapter } from "../types.js";
import { codexAdapter } from "./codex.js";
import { zedAdapter } from "./zed.js";

export const HOST_ADAPTERS: Record<string, HostAdapter> = {
  [codexAdapter.id]: codexAdapter,
  [zedAdapter.id]: zedAdapter,
};

export function listHostIds(): string[] {
  return Object.keys(HOST_ADAPTERS);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run:

```bash
pnpm --filter drawio-mcp-server run build
NODE_OPTIONS=--experimental-vm-modules pnpm --filter drawio-mcp-server test -- build/install/hosts/zed.test.js
```

Expected: PASS (5 tests).

- [ ] **Step 6: Lint + format + commit**

```bash
pnpm --filter drawio-mcp-server lint
pnpm --filter drawio-mcp-server format

GIT_AUTHOR_NAME=claude-code-anthropic-opus-4-7 \
GIT_AUTHOR_EMAIL=claude-code-anthropic-opus-4-7@opencode.ai \
git add packages/drawio-mcp-server/src/install/
git commit -m "$(cat <<'EOF'
feat(install): add zed adapter (settings.json context_servers)

Uses jsonc-parser modify()/applyEdits() to preserve comments and
formatting in ~/.config/zed/settings.json.

Co-Authored-By: Ladislav Gazo <ladislav.gazo@gmail.com>
EOF
)"
```

---

## Task 4: OpenCode adapter (project-first, then global)

**Files:**

- Create: `packages/drawio-mcp-server/src/install/hosts/opencode.ts`
- Create: `packages/drawio-mcp-server/src/install/hosts/opencode.test.ts`
- Modify: `packages/drawio-mcp-server/src/install/hosts/index.ts`

**Interfaces:**

- Consumes: `HostAdapter`, `McpEntry`.
- Produces: `opencodeAdapter: HostAdapter` (id `opencode`) with `defaultPaths()` returning **all candidate paths**, project first.

- [ ] **Step 1: Write failing tests**

Create `packages/drawio-mcp-server/src/install/hosts/opencode.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
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
    const out = opencodeAdapter.merge("", ENTRY, "drawio", { uninstall: false });
    const parsed = JSON.parse(out);
    expect(parsed.mcp.drawio).toEqual({
      type: "local",
      command: ["npx", "-y", "drawio-mcp-server", "--editor"],
      enabled: true,
    });
  });

  it("preserves the $schema field", () => {
    const source = JSON.stringify({ "$schema": "https://opencode.ai/config.json", mcp: {} }, null, 2);
    const out = opencodeAdapter.merge(source, ENTRY, "drawio", { uninstall: false });
    const parsed = JSON.parse(out);
    expect(parsed["$schema"]).toBe("https://opencode.ai/config.json");
  });

  it("uninstall removes the entry", () => {
    const source = JSON.stringify({ mcp: { drawio: { type: "local", command: ["old"] } } });
    const out = opencodeAdapter.merge(source, ENTRY, "drawio", { uninstall: true });
    expect(JSON.parse(out).mcp).toEqual({});
  });
});

describe("opencodeAdapter.defaultPaths", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "opencode-"));
    process.chdir(dir);
  });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it("returns project config first when present", () => {
    writeFileSync(join(dir, "opencode.json"), "{}");
    const paths = opencodeAdapter.defaultPaths();
    expect(paths[0]).toBe(join(dir, "opencode.json"));
  });

  it("falls back to global ~/.config/opencode/opencode.json otherwise", () => {
    const paths = opencodeAdapter.defaultPaths();
    expect(paths[paths.length - 1]).toMatch(/\.config\/opencode\/opencode\.json$/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm --filter drawio-mcp-server run build
NODE_OPTIONS=--experimental-vm-modules pnpm --filter drawio-mcp-server test -- build/install/hosts/opencode.test.js
```

Expected: FAIL.

- [ ] **Step 3: Implement `opencode.ts`**

Create `packages/drawio-mcp-server/src/install/hosts/opencode.ts`:

```ts
import { existsSync, promises as fs } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { applyEdits, modify, parse } from "jsonc-parser";
import type { HostAdapter, McpEntry } from "../types.js";

export const opencodeAdapter: HostAdapter = {
  id: "opencode",
  displayName: "OpenCode",
  defaultPaths() {
    const cwd = process.cwd();
    const local = ["opencode.json", "opencode.jsonc"]
      .map((f) => join(cwd, f))
      .filter(existsSync);
    const global = join(homedir(), ".config", "opencode", "opencode.json");
    return local.length > 0 ? [...local, global] : [global];
  },
  async detect() {
    return existsSync(opencodeAdapter.defaultPaths()[0]) ? "installed" : "absent";
  },
  async read(path: string) {
    return existsSync(path) ? fs.readFile(path, "utf8") : "";
  },
  merge(source, entry, name, { uninstall }) {
    const text = source.trim() === "" ? "{}\n" : source;
    const parsed = parse(text) as Record<string, unknown> | undefined;
    if (!parsed || typeof parsed !== "object") throw new Error("opencode config is not a JSON object");
    const edits = uninstall
      ? modify(text, ["mcp", name], undefined, { formattingOptions: { insertSpaces: true, tabSize: 2 } })
      : modify(text, ["mcp", name], toValue(entry), { formattingOptions: { insertSpaces: true, tabSize: 2 } });
    return applyEdits(text, edits);
  },
  diffLabel() {
    return opencodeAdapter.defaultPaths()[0];
  },
};

function toValue(entry: McpEntry) {
  return {
    type: "local",
    command: [entry.command, ...entry.args],
    enabled: true,
  };
}
```

- [ ] **Step 4: Register + run tests + commit**

Update `packages/drawio-mcp-server/src/install/hosts/index.ts` to include `opencodeAdapter`.

Run:

```bash
pnpm --filter drawio-mcp-server run build
NODE_OPTIONS=--experimental-vm-modules pnpm --filter drawio-mcp-server test -- build/install/hosts/opencode.test.js
pnpm --filter drawio-mcp-server lint
pnpm --filter drawio-mcp-server format
```

Expected: PASS (5 tests), 0 lint errors.

Commit:

```bash
GIT_AUTHOR_NAME=claude-code-anthropic-opus-4-7 \
GIT_AUTHOR_EMAIL=claude-code-anthropic-opus-4-7@opencode.ai \
git add packages/drawio-mcp-server/src/install/
git commit -m "$(cat <<'EOF'
feat(install): add opencode adapter (project-first path resolution)

Writes mcp.<name> entry with `type: local` and full command array.
Prefers ./opencode.json[c] over the global ~/.config/opencode path.

Co-Authored-By: Ladislav Gazo <ladislav.gazo@gmail.com>
EOF
)"
```

---

## Task 5: Claude Desktop adapter (per-OS paths, JSONC)

**Files:**

- Create: `packages/drawio-mcp-server/src/install/hosts/claude-desktop.ts`
- Create: `packages/drawio-mcp-server/src/install/hosts/claude-desktop.test.ts`
- Modify: `packages/drawio-mcp-server/src/install/hosts/index.ts`

**Interfaces:**

- Consumes: `HostAdapter`, `McpEntry`.
- Produces: `claudeDesktopAdapter: HostAdapter` (id `claude-desktop`). Adds shape `mcpServers.<name>`.

- [ ] **Step 1: Write failing tests**

Create `packages/drawio-mcp-server/src/install/hosts/claude-desktop.test.ts`:

```ts
import { describe, it, expect } from "@jest/globals";
import { claudeDesktopAdapter, resolveClaudeDesktopPath } from "./claude-desktop.js";

const ENTRY = {
  command: "npx",
  args: ["-y", "drawio-mcp-server", "--editor"],
  env: {},
  transport: "stdio" as const,
};

describe("claudeDesktopAdapter.merge", () => {
  it("adds mcpServers.drawio", () => {
    const out = claudeDesktopAdapter.merge("", ENTRY, "drawio", { uninstall: false });
    const parsed = JSON.parse(out);
    expect(parsed.mcpServers.drawio).toEqual({
      command: "npx",
      args: ["-y", "drawio-mcp-server", "--editor"],
    });
  });

  it("preserves comments in jsonc source", () => {
    const source = ['{',
      '  // pinned by me',
      '  "mcpServers": {',
      '    "other": { "command": "x" }',
      '  }',
      '}'].join("\n");
    const out = claudeDesktopAdapter.merge(source, ENTRY, "drawio", { uninstall: false });
    expect(out).toContain("// pinned by me");
    expect(out).toContain("\"drawio\"");
  });

  it("uninstall removes the entry", () => {
    const source = JSON.stringify({ mcpServers: { drawio: { command: "old" } } });
    const out = claudeDesktopAdapter.merge(source, ENTRY, "drawio", { uninstall: true });
    expect(JSON.parse(out).mcpServers).toEqual({});
  });
});

describe("resolveClaudeDesktopPath", () => {
  it("darwin uses Application Support", () => {
    expect(resolveClaudeDesktopPath("darwin", "/Users/me", {})).toMatch(/Library\/Application Support\/Claude\/claude_desktop_config\.json$/);
  });
  it("win32 uses APPDATA when set", () => {
    expect(resolveClaudeDesktopPath("win32", "C:\\Users\\me", { APPDATA: "C:\\Users\\me\\AppData\\Roaming" }))
      .toMatch(/AppData\\Roaming\\Claude\\claude_desktop_config\.json$/);
  });
  it("linux uses ~/.config/Claude", () => {
    expect(resolveClaudeDesktopPath("linux", "/home/me", {})).toBe("/home/me/.config/Claude/claude_desktop_config.json");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm --filter drawio-mcp-server run build
NODE_OPTIONS=--experimental-vm-modules pnpm --filter drawio-mcp-server test -- build/install/hosts/claude-desktop.test.js
```

Expected: FAIL.

- [ ] **Step 3: Implement `claude-desktop.ts`**

Create `packages/drawio-mcp-server/src/install/hosts/claude-desktop.ts`:

```ts
import { existsSync, promises as fs } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import { applyEdits, modify, parse } from "jsonc-parser";
import type { HostAdapter, McpEntry } from "../types.js";

export function resolveClaudeDesktopPath(
  plat: NodeJS.Platform,
  home: string,
  env: NodeJS.ProcessEnv,
): string {
  if (plat === "darwin") return join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json");
  if (plat === "win32") {
    const appdata = env.APPDATA ?? join(home, "AppData", "Roaming");
    return join(appdata, "Claude", "claude_desktop_config.json");
  }
  return join(home, ".config", "Claude", "claude_desktop_config.json");
}

export const claudeDesktopAdapter: HostAdapter = {
  id: "claude-desktop",
  displayName: "Claude Desktop",
  defaultPaths() {
    return [resolveClaudeDesktopPath(platform(), homedir(), process.env)];
  },
  async detect() {
    return existsSync(claudeDesktopAdapter.defaultPaths()[0]) ? "installed" : "absent";
  },
  async read(path: string) {
    return existsSync(path) ? fs.readFile(path, "utf8") : "";
  },
  merge(source, entry, name, { uninstall }) {
    const text = source.trim() === "" ? "{}\n" : source;
    const value = uninstall ? undefined : { command: entry.command, args: entry.args, ...(Object.keys(entry.env).length ? { env: entry.env } : {}) };
    const edits = modify(text, ["mcpServers", name], value, { formattingOptions: { insertSpaces: true, tabSize: 2 } });
    return applyEdits(text, edits);
  },
  diffLabel() {
    return claudeDesktopAdapter.defaultPaths()[0];
  },
};
```

- [ ] **Step 4: Register + run tests + commit**

Update `packages/drawio-mcp-server/src/install/hosts/index.ts` to include `claudeDesktopAdapter`.

Run:

```bash
pnpm --filter drawio-mcp-server run build
NODE_OPTIONS=--experimental-vm-modules pnpm --filter drawio-mcp-server test -- build/install/hosts/claude-desktop.test.js
pnpm --filter drawio-mcp-server lint
pnpm --filter drawio-mcp-server format
```

Expected: PASS (6 tests).

Commit:

```bash
GIT_AUTHOR_NAME=claude-code-anthropic-opus-4-7 \
GIT_AUTHOR_EMAIL=claude-code-anthropic-opus-4-7@opencode.ai \
git add packages/drawio-mcp-server/src/install/
git commit -m "$(cat <<'EOF'
feat(install): add claude-desktop adapter (per-OS paths, JSONC merge)

Handles macOS/Windows/Linux config paths and preserves comments in
claude_desktop_config.json via jsonc-parser.

Co-Authored-By: Ladislav Gazo <ladislav.gazo@gmail.com>
EOF
)"
```

---

## Task 6: Claude Code adapter (`claude` CLI first, JSON fallback)

**Files:**

- Create: `packages/drawio-mcp-server/src/install/hosts/claude-code.ts`
- Create: `packages/drawio-mcp-server/src/install/hosts/claude-code.test.ts`
- Modify: `packages/drawio-mcp-server/src/install/hosts/index.ts`
- Modify: `packages/drawio-mcp-server/src/install/index.ts` (add `--scope project` support)

**Interfaces:**

- Consumes: `HostAdapter`, `McpEntry`, `InstallOptions`.
- Produces: `claudeCodeAdapter: HostAdapter` (id `claude-code`).
  - When `configPath` is set → JSON merge into that file (`mcpServers.<name>`).
  - When not set and `claude` on PATH → spawn `claude mcp add-json <name> <json>` (user scope).
  - Fallback: JSON merge into `~/.claude.json`.

- [ ] **Step 1: Write failing tests**

Create `packages/drawio-mcp-server/src/install/hosts/claude-code.test.ts`:

```ts
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
    const out = claudeCodeAdapter.merge("", ENTRY, "drawio", { uninstall: false });
    const parsed = JSON.parse(out);
    expect(parsed.mcpServers.drawio).toEqual({
      type: "stdio",
      command: "npx",
      args: ["-y", "drawio-mcp-server", "--editor"],
    });
  });

  it("uninstall removes only that key", () => {
    const source = JSON.stringify({ mcpServers: { drawio: { type: "stdio", command: "old" }, other: { command: "x" } } });
    const out = claudeCodeAdapter.merge(source, ENTRY, "drawio", { uninstall: true });
    const parsed = JSON.parse(out);
    expect(parsed.mcpServers.drawio).toBeUndefined();
    expect(parsed.mcpServers.other).toEqual({ command: "x" });
  });

  it("preserves unrelated top-level keys", () => {
    const source = JSON.stringify({ projects: { "/tmp": {} }, mcpServers: {} }, null, 2);
    const out = claudeCodeAdapter.merge(source, ENTRY, "drawio", { uninstall: false });
    expect(JSON.parse(out).projects).toEqual({ "/tmp": {} });
  });
});

describe("claudeCodeAdapter.defaultPaths", () => {
  it("points at ~/.claude.json", () => {
    expect(claudeCodeAdapter.defaultPaths()[0]).toMatch(/\.claude\.json$/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm --filter drawio-mcp-server run build
NODE_OPTIONS=--experimental-vm-modules pnpm --filter drawio-mcp-server test -- build/install/hosts/claude-code.test.js
```

Expected: FAIL.

- [ ] **Step 3: Implement `claude-code.ts`**

Create `packages/drawio-mcp-server/src/install/hosts/claude-code.ts`:

```ts
import { existsSync, promises as fs } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { applyEdits, modify } from "jsonc-parser";
import type { HostAdapter, McpEntry } from "../types.js";

export const claudeCodeAdapter: HostAdapter = {
  id: "claude-code",
  displayName: "Claude Code (user scope)",
  defaultPaths() {
    return [join(homedir(), ".claude.json")];
  },
  async detect() {
    return existsSync(claudeCodeAdapter.defaultPaths()[0]) ? "installed" : "absent";
  },
  async read(path: string) {
    return existsSync(path) ? fs.readFile(path, "utf8") : "";
  },
  merge(source, entry, name, { uninstall }) {
    const text = source.trim() === "" ? "{}\n" : source;
    const value = uninstall ? undefined : {
      type: entry.transport,
      command: entry.command,
      args: entry.args,
      ...(Object.keys(entry.env).length ? { env: entry.env } : {}),
    };
    const edits = modify(text, ["mcpServers", name], value, { formattingOptions: { insertSpaces: true, tabSize: 2 } });
    return applyEdits(text, edits);
  },
  diffLabel() {
    return claudeCodeAdapter.defaultPaths()[0];
  },
};
```

- [ ] **Step 4: Register + run tests + commit**

Update `packages/drawio-mcp-server/src/install/hosts/index.ts` to include `claudeCodeAdapter`.

Run:

```bash
pnpm --filter drawio-mcp-server run build
NODE_OPTIONS=--experimental-vm-modules pnpm --filter drawio-mcp-server test -- build/install/hosts/claude-code.test.js
pnpm --filter drawio-mcp-server lint
pnpm --filter drawio-mcp-server format
```

Expected: PASS (4 tests).

Commit:

```bash
GIT_AUTHOR_NAME=claude-code-anthropic-opus-4-7 \
GIT_AUTHOR_EMAIL=claude-code-anthropic-opus-4-7@opencode.ai \
git add packages/drawio-mcp-server/src/install/
git commit -m "$(cat <<'EOF'
feat(install): add claude-code adapter (~/.claude.json merge)

Adds mcpServers.<name> to Claude Code's user-scope config. Preserves
other top-level fields (`projects`, etc.) and other MCP entries.
`claude mcp add-json` shim intentionally not used here in v1 — direct
file merge is deterministic and testable.

Co-Authored-By: Ladislav Gazo <ladislav.gazo@gmail.com>
EOF
)"
```

---

## Task 7: `all` host + integration test

**Files:**

- Modify: `packages/drawio-mcp-server/src/install/index.ts`
- Create: `packages/drawio-mcp-server/src/install/install.integration.test.ts`

**Interfaces:**

- Consumes: every adapter registered so far.
- Produces: `all` host that iterates every non-absent adapter.

- [ ] **Step 1: Write failing integration test**

Create `packages/drawio-mcp-server/src/install/install.integration.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const BIN = join(__dirname, "..", "..", "build", "index.js");

function run(args: string[]) {
  return spawnSync("node", [BIN, "install", ...args], { encoding: "utf8" });
}

describe("install subcommand — end to end", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "drawio-e2e-")); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

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
    expect(r.stdout).toContain("\"context_servers\"");
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
    const modified = readFileSync(target, "utf8").replace("drawio-mcp-server", "drawio-mcp-server-old");
    require("node:fs").writeFileSync(target, modified);
    const second = run(["codex", "--config-path", target]);
    expect(second.status).toBe(4);
    expect(second.stderr).toContain("Re-run with --yes");
  });

  it("all with per-host config paths writes to each", () => {
    const codexPath = join(dir, "codex.toml");
    const zedPath = join(dir, "zed.json");
    const r = run(["all", "--yes",
      "--config-path", `codex=${codexPath}`,
      "--config-path", `zed=${zedPath}`,
    ]);
    expect(r.status).toBe(0);
    expect(existsSync(codexPath)).toBe(true);
    expect(existsSync(zedPath)).toBe(true);
  });

  it("returns exit 1 on unknown host", () => {
    const r = run(["bogus"]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("unknown host");
  });
});
```

Note the last-but-one case: for `all`, `--config-path` accepts a `host=path` form so tests can point each adapter at a temp file. Adapters called from `all` without a mapping use their own `defaultPaths()`.

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm --filter drawio-mcp-server run build
NODE_OPTIONS=--experimental-vm-modules pnpm --filter drawio-mcp-server test -- build/install/install.integration.test.js
```

Expected: FAIL (`all` case + `host=path` parsing not implemented).

- [ ] **Step 3: Extend argv parser to accept `host=path`**

In `packages/drawio-mcp-server/src/install/index.ts`, change the `--config-path` case to accumulate a map:

```ts
// In InstallOptions, replace `configPath?: string` with:
//   configPath?: string;
//   configPathByHost: Record<string, string>;
```

Update `parseArgs` and the default object accordingly:

```ts
case "--config-path": {
  const raw = argv[++i];
  const eq = raw.indexOf("=");
  if (eq > 0) {
    opts.configPathByHost[raw.slice(0, eq)] = raw.slice(eq + 1);
  } else {
    opts.configPath = raw;
  }
  break;
}
```

Also update the default-shape test in Task 1 (the initial `parseArgs` case): add `configPathByHost: {}` alongside `configPath: undefined`.

- [ ] **Step 4: Implement `all` orchestration**

Extend `runInstall` in `packages/drawio-mcp-server/src/install/index.ts`:

```ts
async function applyAll(opts: InstallOptions): Promise<number> {
  let exitCode = 0;
  for (const [id, adapter] of Object.entries(HOST_ADAPTERS)) {
    const detect = await adapter.detect();
    const explicit = opts.configPathByHost[id];
    if (detect === "absent" && !explicit) {
      process.stderr.write(`skip ${id}: not installed\n`);
      continue;
    }
    const perHostOpts: InstallOptions = { ...opts, host: id, configPath: explicit ?? opts.configPath };
    const code = await applySingle(adapter, perHostOpts);
    if (code !== 0) exitCode = code;
  }
  return exitCode;
}

// In runInstall, replace the placeholder for `opts.host === "all"`:
if (opts.host === "all") return applyAll(opts);
```

- [ ] **Step 5: Run tests to verify they pass**

Run:

```bash
pnpm --filter drawio-mcp-server run build
NODE_OPTIONS=--experimental-vm-modules pnpm --filter drawio-mcp-server test -- build/install/
```

Expected: PASS (all install tests, including integration).

- [ ] **Step 6: Lint + format + commit**

```bash
pnpm --filter drawio-mcp-server lint
pnpm --filter drawio-mcp-server format

GIT_AUTHOR_NAME=claude-code-anthropic-opus-4-7 \
GIT_AUTHOR_EMAIL=claude-code-anthropic-opus-4-7@opencode.ai \
git add packages/drawio-mcp-server/src/install/
git commit -m "$(cat <<'EOF'
feat(install): support `all` host and per-host --config-path=host=path

Iterates every registered adapter, skipping absent hosts by default.
Adds a spawn-based integration test that covers --print, --dry-run,
--yes, refuse-overwrite (exit 4), and the `all` fan-out.

Co-Authored-By: Ladislav Gazo <ladislav.gazo@gmail.com>
EOF
)"
```

---

## Task 8: Plugin package skeleton + `plugin.json` + `package.json`

**Files:**

- Create: `packages/drawio-mcp-claude-plugin/package.json`
- Create: `packages/drawio-mcp-claude-plugin/tsconfig.json`
- Create: `packages/drawio-mcp-claude-plugin/jest.config.js`
- Create: `packages/drawio-mcp-claude-plugin/biome.json`
- Create: `packages/drawio-mcp-claude-plugin/.claude-plugin/plugin.json`
- Create: `packages/drawio-mcp-claude-plugin/README.md`
- Modify: `pnpm-workspace.yaml` (only if new catalog entry required — none in this task)

**Interfaces:**

- Consumes: nothing from the server package.
- Produces: a valid Claude Code plugin skeleton that Claude Code will accept.

- [ ] **Step 1: Create `package.json`**

Create `packages/drawio-mcp-claude-plugin/package.json`:

```json
{
  "name": "drawio-mcp-claude-plugin",
  "version": "0.1.0",
  "private": true,
  "description": "Claude Code plugin for the Draw.io MCP server",
  "type": "module",
  "scripts": {
    "lint": "biome check .",
    "lint:fix": "biome check --write .",
    "test": "NODE_OPTIONS=--experimental-vm-modules jest"
  },
  "devDependencies": {
    "@biomejs/biome": "catalog:",
    "@jest/globals": "30.2.0",
    "@types/jest": "30.0.0",
    "ajv": "8.17.1",
    "gray-matter": "4.0.3",
    "jest": "30.2.0",
    "jest-environment-node": "30.2.0",
    "ts-jest": "29.4.9",
    "typescript": "catalog:"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

Create `packages/drawio-mcp-claude-plugin/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "outDir": "build",
    "rootDir": ".",
    "types": ["jest", "node"]
  },
  "include": ["tests/**/*.ts"]
}
```

- [ ] **Step 3: Create `jest.config.js`**

Create `packages/drawio-mcp-claude-plugin/jest.config.js`:

```js
export default {
  preset: "ts-jest/presets/default-esm",
  testEnvironment: "node",
  extensionsToTreatAsEsm: [".ts"],
  moduleNameMapper: { "^(\\.{1,2}/.*)\\.js$": "$1" },
  testMatch: ["<rootDir>/tests/**/*.test.ts"],
};
```

- [ ] **Step 4: Create `biome.json`**

Create `packages/drawio-mcp-claude-plugin/biome.json`:

```json
{
  "$schema": "https://biomejs.dev/schemas/2.4.13/schema.json",
  "extends": [],
  "files": { "includes": ["tests/**/*.ts", "*.json"] }
}
```

- [ ] **Step 5: Create `plugin.json`**

Create `packages/drawio-mcp-claude-plugin/.claude-plugin/plugin.json`:

```json
{
  "name": "drawio",
  "version": "0.1.0",
  "description": "Draw.io MCP: built-in editor, page/layer tools, AWS/GCP/Azure/Cisco stencils",
  "mcpServers": {
    "drawio": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "drawio-mcp-server", "--editor"]
    }
  }
}
```

- [ ] **Step 6: Create `README.md`**

Create `packages/drawio-mcp-claude-plugin/README.md`:

```markdown
# Draw.io MCP — Claude Code plugin

Installs the Draw.io MCP server and two slash commands into Claude Code.

## Install

```
/plugin marketplace add lgazo/drawio-mcp-server
/plugin install drawio@drawio-mcp-server
```

## What's inside

- MCP server `drawio` (runs `npx -y drawio-mcp-server --editor`; editor at http://localhost:3000).
- `/drawio-open <file-or-url>` — imports a diagram into the connected client and opens the editor URL.
- `/drawio-status` — shows server health and every connected document.

See the top-level [PLUGINS.md](../../docs/PLUGINS.md) for full reference.
```

- [ ] **Step 7: Install and verify the workspace picks it up**

Run:

```bash
pnpm install
pnpm --filter drawio-mcp-claude-plugin exec biome check .
```

Expected: install succeeds, biome reports 0 errors.

- [ ] **Step 8: Commit**

```bash
GIT_AUTHOR_NAME=claude-code-anthropic-opus-4-7 \
GIT_AUTHOR_EMAIL=claude-code-anthropic-opus-4-7@opencode.ai \
git add packages/drawio-mcp-claude-plugin/ pnpm-lock.yaml
git commit -m "$(cat <<'EOF'
feat(plugin): scaffold drawio-mcp-claude-plugin package

Adds plugin.json declaring the drawio MCP server (npx -y
drawio-mcp-server --editor), TS/jest/biome tooling, and a
user-facing README. Slash commands land in the next task.

Co-Authored-By: Ladislav Gazo <ladislav.gazo@gmail.com>
EOF
)"
```

---

## Task 9: `/drawio-open` and `/drawio-status` slash commands

**Files:**

- Create: `packages/drawio-mcp-claude-plugin/commands/drawio-open.md`
- Create: `packages/drawio-mcp-claude-plugin/commands/drawio-status.md`

**Interfaces:**

- Consumes: MCP tools `list-documents`, `import-diagram` (already exported by the server); `Bash`, `Read`, `WebFetch` in the plugin runtime.
- Produces: two slash commands discoverable by Claude Code once the plugin is enabled.

- [ ] **Step 1: Create `drawio-open.md`**

Create `packages/drawio-mcp-claude-plugin/commands/drawio-open.md`:

```markdown
---
description: Open a Draw.io file (path or URL) in the connected editor or extension.
allowed-tools:
  - Read
  - WebFetch
  - Bash(xdg-open:*)
  - Bash(open:*)
  - Bash(cmd /c start:*)
  - mcp__drawio__list-documents
  - mcp__drawio__import-diagram
argument-hint: <file-or-url>
---

You are opening a Draw.io diagram from an argument.

**Argument:** `$ARGUMENTS`

Steps:

1. Determine argument type:
   - Starts with `http://` or `https://` → fetch the body with WebFetch.
   - Otherwise treat it as a local file path and Read it. For `.png` you must base64-encode.
2. Call `mcp__drawio__list-documents`.
3. Pick the target document:
   - If the result contains 1+ connected documents, use the first one's `id` as `target_document`.
   - If 0 → skip step 4; the server is probably running with `--editor` only.
4. Call `mcp__drawio__import-diagram` with the content, appropriate format (`xml` | `svg` | `png`), and `target_document` when known.
5. Open the editor URL in the browser:
   - Read env vars: `DRAWIO_MCP_HOST` (default `localhost`), `DRAWIO_MCP_HTTP_PORT` (default `3000`), `DRAWIO_MCP_TLS` (`true` → `https`, else `http`).
   - Build `URL = <scheme>://<host>:<port>/`.
   - Launch: `xdg-open "$URL"` on Linux, `open "$URL"` on macOS, `cmd /c start "" "$URL"` on Windows. Detect OS via `uname -s` or Node `process.platform` via Bash `node -e 'console.log(process.platform)'`.
6. Report to the user:
   - Mode used (extension-import vs editor-only).
   - Which document (if any) received the import.
   - The URL that was opened.

Error handling:
- File not found → tell the user which path failed.
- Server unreachable → suggest they run `npx drawio-mcp-server --editor` or check the port.
- Import fails → surface the MCP tool's error verbatim.
```

- [ ] **Step 2: Create `drawio-status.md`**

Create `packages/drawio-mcp-claude-plugin/commands/drawio-status.md`:

```markdown
---
description: Show server health and every connected Draw.io document.
allowed-tools:
  - Bash(curl:*)
  - mcp__drawio__list-documents
---

You are producing a status snapshot of the Draw.io MCP server.

Steps:

1. Build the base URL from env vars:
   - `HOST=${DRAWIO_MCP_HOST:-localhost}`, `PORT=${DRAWIO_MCP_HTTP_PORT:-3000}`, `SCHEME=https` if `DRAWIO_MCP_TLS=true` else `http`.
2. `curl -sf ${SCHEME}://${HOST}:${PORT}/health` — if this fails, report `Server: DOWN` and stop.
3. Call `mcp__drawio__list-documents`.
4. Render:

```
Server:  UP  (<url>, TLS <on|off>)
Clients: <N> connected
  ├─ <connection-id-1>  (<transport>)  doc: <label>   <pages> pages
  └─ <connection-id-2>  (<transport>)  doc: <label>   <pages> pages
```

If `list-documents` returns 0 clients:

```
Server:  UP  (<url>, TLS <on|off>)
Clients: 0 connected
```

And add the hint: "Open Draw.io in your browser, or start the server with `--editor`."
```

- [ ] **Step 3: Commit**

```bash
GIT_AUTHOR_NAME=claude-code-anthropic-opus-4-7 \
GIT_AUTHOR_EMAIL=claude-code-anthropic-opus-4-7@opencode.ai \
git add packages/drawio-mcp-claude-plugin/commands/
git commit -m "$(cat <<'EOF'
feat(plugin): add /drawio-open and /drawio-status slash commands

/drawio-open imports a file or URL via the connected extension and
opens the editor URL cross-platform. /drawio-status reports server
health plus every connected document.

Co-Authored-By: Ladislav Gazo <ladislav.gazo@gmail.com>
EOF
)"
```

---

## Task 10: Plugin tests (manifest + command frontmatter)

**Files:**

- Create: `packages/drawio-mcp-claude-plugin/tests/manifest.test.ts`
- Create: `packages/drawio-mcp-claude-plugin/tests/commands.test.ts`
- Create: `packages/drawio-mcp-claude-plugin/tests/fixtures/plugin.schema.json`

**Interfaces:**

- Consumes: `ajv` for JSON schema validation, `gray-matter` for frontmatter parsing.
- Produces: green test suite for the plugin package.

- [ ] **Step 1: Add a minimal internal plugin schema fixture**

Create `packages/drawio-mcp-claude-plugin/tests/fixtures/plugin.schema.json`:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["name", "version", "description"],
  "properties": {
    "name": { "type": "string", "minLength": 1 },
    "version": { "type": "string", "pattern": "^\\d+\\.\\d+\\.\\d+$" },
    "description": { "type": "string", "minLength": 1 },
    "mcpServers": {
      "type": "object",
      "additionalProperties": {
        "type": "object",
        "required": ["command"],
        "properties": {
          "type": { "type": "string", "enum": ["stdio", "http", "sse"] },
          "command": { "type": "string" },
          "args": { "type": "array", "items": { "type": "string" } },
          "env": { "type": "object", "additionalProperties": { "type": "string" } }
        }
      }
    }
  }
}
```

Rationale: pinning to Claude Code's live schema is deferred to Open Items in the spec; this fixture asserts the shape our plugin.json commits to.

- [ ] **Step 2: Write `manifest.test.ts`**

Create `packages/drawio-mcp-claude-plugin/tests/manifest.test.ts`:

```ts
import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Ajv from "ajv";

describe("plugin manifest", () => {
  const manifest = JSON.parse(readFileSync(join(__dirname, "..", ".claude-plugin", "plugin.json"), "utf8"));
  const schema = JSON.parse(readFileSync(join(__dirname, "fixtures", "plugin.schema.json"), "utf8"));

  it("validates against internal schema", () => {
    const ajv = new Ajv();
    const validate = ajv.compile(schema);
    const ok = validate(manifest);
    expect({ ok, errors: validate.errors }).toEqual({ ok: true, errors: null });
  });

  it("declares the drawio MCP server", () => {
    expect(manifest.mcpServers.drawio).toEqual({
      type: "stdio",
      command: "npx",
      args: ["-y", "drawio-mcp-server", "--editor"],
    });
  });
});
```

- [ ] **Step 3: Write `commands.test.ts`**

Create `packages/drawio-mcp-claude-plugin/tests/commands.test.ts`:

```ts
import { describe, it, expect } from "@jest/globals";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import matter from "gray-matter";

const CMD_DIR = join(__dirname, "..", "commands");

describe("commands", () => {
  const files = readdirSync(CMD_DIR).filter((f) => f.endsWith(".md"));

  it("has drawio-open and drawio-status", () => {
    expect(files.sort()).toEqual(["drawio-open.md", "drawio-status.md"]);
  });

  for (const f of files) {
    const parsed = matter(readFileSync(join(CMD_DIR, f), "utf8"));

    it(`${f} has non-empty description`, () => {
      expect(typeof parsed.data.description).toBe("string");
      expect(parsed.data.description.length).toBeGreaterThan(0);
    });

    it(`${f} declares allowed-tools as a non-empty list`, () => {
      expect(Array.isArray(parsed.data["allowed-tools"])).toBe(true);
      expect((parsed.data["allowed-tools"] as unknown[]).length).toBeGreaterThan(0);
    });

    it(`${f} has non-empty body`, () => {
      expect(parsed.content.trim().length).toBeGreaterThan(20);
    });
  }
});
```

- [ ] **Step 4: Run tests**

Run:

```bash
pnpm --filter drawio-mcp-claude-plugin test
```

Expected: PASS.

- [ ] **Step 5: Lint + commit**

```bash
pnpm --filter drawio-mcp-claude-plugin lint

GIT_AUTHOR_NAME=claude-code-anthropic-opus-4-7 \
GIT_AUTHOR_EMAIL=claude-code-anthropic-opus-4-7@opencode.ai \
git add packages/drawio-mcp-claude-plugin/tests/
git commit -m "$(cat <<'EOF'
test(plugin): validate manifest schema + command frontmatter

Adds a Jest suite that schema-validates plugin.json and asserts every
command has a description, allowed-tools list, and non-empty body.

Co-Authored-By: Ladislav Gazo <ladislav.gazo@gmail.com>
EOF
)"
```

---

## Task 11: Marketplace manifest at top of repo

**Files:**

- Create: `.claude-plugin/marketplace.json`
- Create: `packages/drawio-mcp-claude-plugin/tests/marketplace.test.ts`
- Modify: `packages/drawio-mcp-claude-plugin/tests/fixtures/plugin.schema.json` (add a sibling `marketplace.schema.json` fixture)

**Interfaces:**

- Consumes: plugin package at `./packages/drawio-mcp-claude-plugin`.
- Produces: a marketplace users can subscribe to via `/plugin marketplace add lgazo/drawio-mcp-server`.

- [ ] **Step 1: Create `.claude-plugin/marketplace.json`**

Create `.claude-plugin/marketplace.json`:

```json
{
  "name": "drawio-mcp-server",
  "owner": { "name": "lgazo", "url": "https://github.com/lgazo" },
  "plugins": [
    {
      "name": "drawio",
      "source": "./packages/drawio-mcp-claude-plugin",
      "description": "Draw.io MCP server + built-in editor + slash commands",
      "version": "0.1.0",
      "homepage": "https://github.com/lgazo/drawio-mcp-server",
      "keywords": ["drawio", "mcp", "diagrams", "diagramming", "architecture"],
      "license": "MIT"
    }
  ]
}
```

- [ ] **Step 2: Add marketplace schema fixture**

Create `packages/drawio-mcp-claude-plugin/tests/fixtures/marketplace.schema.json`:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["name", "owner", "plugins"],
  "properties": {
    "name": { "type": "string", "minLength": 1 },
    "owner": {
      "type": "object",
      "required": ["name"],
      "properties": { "name": { "type": "string" }, "url": { "type": "string" } }
    },
    "plugins": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "required": ["name", "source", "version"],
        "properties": {
          "name": { "type": "string" },
          "source": { "type": "string" },
          "version": { "type": "string", "pattern": "^\\d+\\.\\d+\\.\\d+$" },
          "description": { "type": "string" },
          "homepage": { "type": "string" },
          "keywords": { "type": "array", "items": { "type": "string" } },
          "license": { "type": "string" }
        }
      }
    }
  }
}
```

- [ ] **Step 3: Add `marketplace.test.ts`**

Create `packages/drawio-mcp-claude-plugin/tests/marketplace.test.ts`:

```ts
import { describe, it, expect } from "@jest/globals";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import Ajv from "ajv";

describe("marketplace manifest", () => {
  const marketplacePath = join(__dirname, "..", "..", "..", ".claude-plugin", "marketplace.json");
  const schemaPath = join(__dirname, "fixtures", "marketplace.schema.json");

  it("exists at the repo root", () => {
    expect(existsSync(marketplacePath)).toBe(true);
  });

  it("validates against the marketplace schema", () => {
    const manifest = JSON.parse(readFileSync(marketplacePath, "utf8"));
    const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
    const ajv = new Ajv();
    const validate = ajv.compile(schema);
    const ok = validate(manifest);
    expect({ ok, errors: validate.errors }).toEqual({ ok: true, errors: null });
  });

  it("plugin source resolves to the plugin package directory", () => {
    const manifest = JSON.parse(readFileSync(marketplacePath, "utf8"));
    const plug = manifest.plugins.find((p: { name: string }) => p.name === "drawio");
    expect(plug).toBeTruthy();
    const abs = join(marketplacePath, "..", "..", plug.source);
    expect(existsSync(join(abs, ".claude-plugin", "plugin.json"))).toBe(true);
  });

  it("plugin version matches package plugin.json version", () => {
    const marketplace = JSON.parse(readFileSync(marketplacePath, "utf8"));
    const pluginManifest = JSON.parse(
      readFileSync(join(__dirname, "..", ".claude-plugin", "plugin.json"), "utf8"),
    );
    const plug = marketplace.plugins.find((p: { name: string }) => p.name === "drawio");
    expect(plug.version).toBe(pluginManifest.version);
  });
});
```

- [ ] **Step 4: Run tests**

Run:

```bash
pnpm --filter drawio-mcp-claude-plugin test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
GIT_AUTHOR_NAME=claude-code-anthropic-opus-4-7 \
GIT_AUTHOR_EMAIL=claude-code-anthropic-opus-4-7@opencode.ai \
git add .claude-plugin/marketplace.json packages/drawio-mcp-claude-plugin/tests/
git commit -m "$(cat <<'EOF'
feat(marketplace): add .claude-plugin/marketplace.json + tests

Users install via `/plugin marketplace add lgazo/drawio-mcp-server`
then `/plugin install drawio`. Tests validate the manifest schema
and confirm the plugin source path resolves.

Co-Authored-By: Ladislav Gazo <ladislav.gazo@gmail.com>
EOF
)"
```

---

## Task 12: New CI workflow `claude-plugin-ci.yml`

**Files:**

- Create: `.github/workflows/claude-plugin-ci.yml`

**Interfaces:**

- Consumes: `packages/drawio-mcp-claude-plugin/**` and `.claude-plugin/**`.
- Produces: PR/push CI job that lints + tests + audits.

- [ ] **Step 1: Create workflow**

Create `.github/workflows/claude-plugin-ci.yml`:

```yaml
name: Claude Plugin CI

on:
  push:
    branches: [main]
    paths:
      - 'packages/drawio-mcp-claude-plugin/**'
      - '.claude-plugin/**'
      - '.github/workflows/claude-plugin-ci.yml'
  pull_request:
    branches: [main]
    paths:
      - 'packages/drawio-mcp-claude-plugin/**'
      - '.claude-plugin/**'
      - '.github/workflows/claude-plugin-ci.yml'
  workflow_dispatch:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - name: Install pnpm
        uses: pnpm/action-setup@v5
      - name: Use Node.js 24.x
        uses: actions/setup-node@v5
        with:
          node-version: "24.x"
          cache: "pnpm"
          cache-dependency-path: pnpm-lock.yaml
      - name: Install dependencies
        run: pnpm install
      - name: Audit dependencies
        run: pnpm audit --audit-level=moderate
      - name: Lint plugin package
        run: pnpm --filter drawio-mcp-claude-plugin lint
      - name: Run plugin tests
        run: pnpm --filter drawio-mcp-claude-plugin test
```

- [ ] **Step 2: Locally simulate the audit step**

Run:

```bash
pnpm audit --audit-level=moderate
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
GIT_AUTHOR_NAME=claude-code-anthropic-opus-4-7 \
GIT_AUTHOR_EMAIL=claude-code-anthropic-opus-4-7@opencode.ai \
git add .github/workflows/claude-plugin-ci.yml
git commit -m "$(cat <<'EOF'
ci: add claude-plugin-ci workflow

Runs biome + jest for the plugin package on any change to the plugin
sources or the marketplace manifest.

Co-Authored-By: Ladislav Gazo <ladislav.gazo@gmail.com>
EOF
)"
```

---

## Task 13: `docs/PLUGINS.md`

**Files:**

- Create: `docs/PLUGINS.md`

- [ ] **Step 1: Write the doc**

Create `docs/PLUGINS.md`:

```markdown
# Draw.io MCP: Claude Code Plugin & Install Subcommand

## TL;DR

- **Claude Code:** `/plugin marketplace add lgazo/drawio-mcp-server` then `/plugin install drawio`.
- **Other hosts:** `npx drawio-mcp-server install <host>` — supports `claude-code`, `claude-desktop`, `codex`, `zed`, `opencode`, and `all`.

## Claude Code plugin

Installing the plugin registers the `drawio` MCP server (invoked as `npx -y drawio-mcp-server --editor`) and enables two slash commands:

- `/drawio-open <file-or-url>` — imports a diagram file (XML, SVG, or PNG) or URL into the connected client and opens the editor at `http://localhost:3000/`.
- `/drawio-status` — pings the server's `/health` endpoint and lists every connected document.

The plugin sources live in [`packages/drawio-mcp-claude-plugin`](../packages/drawio-mcp-claude-plugin/).

## Marketplace

Marketplace ref: `lgazo/drawio-mcp-server` (this repo). Manifest at `.claude-plugin/marketplace.json`. Users can pin a specific commit or tag via Claude Code's `/plugin marketplace` UI.

## `drawio-mcp-server install <host>`

The install subcommand ships with the `drawio-mcp-server` npm package. It writes/updates/removes the MCP entry in each host's own config file, using format-preserving parsers (`jsonc-parser` for JSON, `smol-toml` for TOML).

### Common examples

```bash
# Claude Code (~/.claude.json)
npx drawio-mcp-server install claude-code --yes

# Claude Desktop (per-OS path)
npx drawio-mcp-server install claude-desktop --yes

# Codex (~/.codex/config.toml)
npx drawio-mcp-server install codex --yes

# Zed (~/.config/zed/settings.json)
npx drawio-mcp-server install zed --yes

# OpenCode (project ./opencode.json first, else ~/.config/opencode/opencode.json)
npx drawio-mcp-server install opencode --yes

# All installed hosts at once
npx drawio-mcp-server install all --yes
```

### Flags

| Flag | Default | Purpose |
|---|---|---|
| `--name <id>` | `drawio` | key under which the entry is stored |
| `--editor` / `--no-editor` | `--editor` on | pass `--editor` to the server |
| `--http-port <n>` | `3000` | pass through the HTTP port |
| `--extra-arg <a>` | none, repeatable | append arg to the server command |
| `--env KEY=VAL` | none, repeatable | set env var on the entry |
| `--config-path <path>` | host default | override the config file |
| `--config-path <host>=<path>` | none | override per-host path when using `all` |
| `--print` | off | write the resulting file to stdout without touching disk |
| `--dry-run` | off | show a unified diff without writing |
| `--uninstall` | off | remove the entry |
| `--yes` | off | apply changes, overwriting an existing entry with different content |

### Safety

- Atomic writes: temp file in the same directory → `fs.rename`.
- Backup on first write: `<file>.bak-<epoch>`.
- Refuses to overwrite an existing entry with different content unless `--yes` (exit code `4`).
- `--print` and `--dry-run` never touch disk.

### Uninstall

```bash
npx drawio-mcp-server install codex --uninstall --yes
```

## Contributing

### Adding a new host adapter

Implement `HostAdapter` from `packages/drawio-mcp-server/src/install/types.ts`, register it in `packages/drawio-mcp-server/src/install/hosts/index.ts`, and add colocated tests. The `HostAdapter.merge` function is pure — the entry point owns filesystem I/O — so unit tests exercise only string-in/string-out.

### Releasing the plugin

Marketplace + plugin share a version (`.claude-plugin/marketplace.json` and `packages/drawio-mcp-claude-plugin/.claude-plugin/plugin.json`). Bump both together, commit, tag, push. Users pulling `lgazo/drawio-mcp-server` main see the new version on their next `/plugin marketplace add` refresh.

The install subcommand ships with `drawio-mcp-server` itself. Bumping the server version publishes the current install code alongside.
```

- [ ] **Step 2: Commit**

```bash
GIT_AUTHOR_NAME=claude-code-anthropic-opus-4-7 \
GIT_AUTHOR_EMAIL=claude-code-anthropic-opus-4-7@opencode.ai \
git add docs/PLUGINS.md
git commit -m "$(cat <<'EOF'
docs(plugins): add docs/PLUGINS.md covering plugin, marketplace, install

Full reference for Claude Code plugin install, marketplace layout,
`install <host>` subcommand with every flag, safety guarantees,
uninstall, and contributor notes for adding new adapters.

Co-Authored-By: Ladislav Gazo <ladislav.gazo@gmail.com>
EOF
)"
```

---

## Task 14: README pointer + CONFIG cross-link

**Files:**

- Modify: `README.md`
- Modify: `CONFIG.md`

**Interfaces:** none.

- [ ] **Step 1: Replace multi-host collapsibles in `README.md`**

In `README.md`, replace the section starting with `### 1. Configure your MCP host` down to the closing `</details>` of the OpenCode block with:

```markdown
### 1. Configure your MCP host

**Fastest path:**

- **Claude Code:** `/plugin marketplace add lgazo/drawio-mcp-server` then `/plugin install drawio`.
- **Any other host:** `npx drawio-mcp-server install <host>` where `<host>` is `claude-code`, `claude-desktop`, `codex`, `zed`, `opencode`, or `all`.

See [docs/PLUGINS.md](./docs/PLUGINS.md) for the full reference, flags, and uninstall.

<details>
  <summary>Manual install (JSON snippet, Claude Desktop example)</summary>

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "drawio": {
      "command": "npx",
      "args": ["-y", "drawio-mcp-server", "--editor"]
    }
  }
}
```

</details>
```

- [ ] **Step 2: Add "Install subcommand" cross-link to `CONFIG.md`**

Append at the end of `CONFIG.md`:

```markdown
## Install subcommand

`drawio-mcp-server install <host>` writes and removes the MCP entry in each host's config file. Full reference in [docs/PLUGINS.md](./docs/PLUGINS.md).
```

- [ ] **Step 3: Commit**

```bash
GIT_AUTHOR_NAME=claude-code-anthropic-opus-4-7 \
GIT_AUTHOR_EMAIL=claude-code-anthropic-opus-4-7@opencode.ai \
git add README.md CONFIG.md
git commit -m "$(cat <<'EOF'
docs(readme): point to plugin marketplace + install subcommand

README's per-host collapsibles collapse into a one-line pointer plus a
single manual-install fallback. CONFIG.md cross-links to PLUGINS.md.

Co-Authored-By: Ladislav Gazo <ladislav.gazo@gmail.com>
EOF
)"
```

---

## Self-review notes

- **Spec coverage:** Task 1 covers dispatch + config-io + argv. Tasks 2–6 cover the five host adapters. Task 7 covers `all` + integration + refuse-overwrite (exit 4). Task 8 covers plugin skeleton. Task 9 covers commands. Task 10 covers plugin unit tests. Task 11 covers marketplace + version-parity test. Task 12 covers the missing CI job. Tasks 13–14 cover docs. Non-goals from the spec (no skill bundling, no auto-migration, no server-publish `paths:` fix) remain out of this plan.
- **Placeholders scanned.** None left. Every step shows exact file contents or exact commands.
- **Type consistency.** `HostAdapter`, `McpEntry`, `InstallOptions`, `buildEntry`, `applySingle`, and `applyAll` are named consistently across every task that references them. `configPath` (single) and `configPathByHost` (map) added in Task 7 and used in the `all` path.
- **Open items** carried forward: swap `smol-toml` for `@iarna/toml` if comment loss is observed; pin Claude Code's live marketplace schema when it stabilizes (currently uses internal fixture).
