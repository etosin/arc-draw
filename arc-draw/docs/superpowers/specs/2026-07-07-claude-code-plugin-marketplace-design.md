# Draw.io MCP: Claude Code plugin + marketplace + multi-host install subcommand

**Date:** 2026-07-07
**Status:** Design (approved sections 1–4; awaiting user review of this spec).
**Scope:** Ship a Claude Code plugin marketplace, one plugin that installs the Draw.io MCP server into Claude Code, and a `drawio-mcp-server install <host>` subcommand that covers Claude Desktop, Codex, Zed, and OpenCode. Add user-facing docs.

## Goals

1. One-command install for Claude Code users (marketplace + plugin).
2. One-command install for every other supported host (install subcommand).
3. Two useful slash commands (`/drawio-open`, `/drawio-status`) shipped in the plugin.
4. Documentation on `docs/PLUGINS.md`; README trimmed to a pointer.
5. Zero regressions to existing users who copy JSON snippets from the README.

## Non-goals (v1)

- No skill bundling in the plugin.
- No auto-migration of existing entries when the server version changes (users re-run `install`).
- No Claude Desktop restart automation.
- No Windows-specific installer polish beyond correct path resolution.
- No new npm publish flow for the plugin — marketplace is git-hosted.
- No fix to the pre-existing invalid `paths:` filter on `server-publish.yml` release trigger; noted for a follow-up.

## Architecture

Three deliverables, all in this monorepo:

### 1. Marketplace manifest (top of repo)

```
.claude-plugin/
  marketplace.json
```

Users install via:

```
/plugin marketplace add lgazo/drawio-mcp-server
/plugin install drawio@drawio-mcp-server
```

`marketplace.json`:

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

### 2. Claude Code plugin package

```
packages/drawio-mcp-claude-plugin/
  .claude-plugin/plugin.json
  commands/
    drawio-open.md
    drawio-status.md
  README.md
  package.json                # private:true, not npm-published
  tests/
    manifest.test.ts
    commands.test.ts
```

`plugin.json`:

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

Commands directory is auto-discovered by Claude Code (`.md` files with YAML frontmatter). No entry needed in `plugin.json`.

### 3. Install subcommand inside `drawio-mcp-server`

```
packages/drawio-mcp-server/src/install/
  index.ts
  config-io.ts
  hosts/
    claude-code.ts
    claude-desktop.ts
    codex.ts
    zed.ts
    opencode.ts
  hosts/{claude-code,claude-desktop,codex,zed,opencode}.test.ts
  config-io.test.ts
  index.test.ts
  install.integration.test.ts
```

Dispatch in `src/index.ts` before any transport boot:

```ts
if (process.argv[2] === "install") {
  const { runInstall } = await import("./install/index.js");
  const code = await runInstall(process.argv.slice(3));
  process.exit(code);
}
```

Runs before `createDrawioMcpApp`, uses `fatalLog` for pre-app diagnostics, then swaps to the standard `mcp_console_logger` (stderr) once the install context is set up. Never opens the stdio MCP transport, never writes to stdout except when `--print` is passed.

## Slash commands

Slash commands are markdown files with YAML frontmatter declaring `allowed-tools`. Claude Code executes the body as a prompt with those tools scoped.

### `/drawio-open <file-or-url>`

`commands/drawio-open.md` — `allowed-tools: Read, WebFetch, Bash(xdg-open:*), Bash(open:*), Bash(cmd /c start:*), mcp__drawio__import-diagram, mcp__drawio__list-documents`.

Prompt logic (Claude executes):

1. Resolve arg: URL → `WebFetch`, local path → `Read` (XML/SVG text; base64 for PNG).
2. Call `list-documents`.
3. If ≥1 connected extension client → call `import-diagram` on the first; if 0 → assume built-in editor mode.
4. Open browser at `http[s]://<host>:<port>/` respecting `DRAWIO_MCP_HTTP_PORT`, `DRAWIO_MCP_TLS`, `DRAWIO_MCP_HOST`. Launcher per OS: `xdg-open` (Linux), `open` (macOS), `cmd /c start ""` (Windows).
5. Report mode used, document that received the import, URL opened.

Errors handled: file not found, port unreachable, no connection + editor not running (hint the user to enable `--editor`).

### `/drawio-status`

`commands/drawio-status.md` — `allowed-tools: Bash(curl:*), mcp__drawio__list-documents`.

Prompt logic:

1. `curl -sf http://${DRAWIO_MCP_HOST:-localhost}:${DRAWIO_MCP_HTTP_PORT:-3000}/health` (or `https` if TLS on).
2. Call `list-documents`; per connection surface: connection ID, transport (WebSocket / built-in editor), document instance ID, page title/count if provided.
3. Render like the extension's overlay:

```
Server:  UP  (http://localhost:3000, TLS off)
Clients: 2 connected
  ├─ ext-a3f9  (WebSocket)  doc: architecture.drawio     3 pages
  └─ edt-1     (built-in)   doc: (untitled)              1 page
```

4. If `list-documents` returns 0 → hint: "Open Draw.io in your browser, or start the server with `--editor`."

There is no `/drawio-install`. Users install into other hosts via `drawio-mcp-server install <host>` from a shell.

## Install subcommand

### CLI

```
drawio-mcp-server install <host> [options]

hosts:  claude-code | claude-desktop | codex | zed | opencode | all
options:
  --name <id>              server key in host config (default: "drawio")
  --editor / --no-editor   include --editor flag (default: on)
  --http-port <n>          set DRAWIO_MCP_HTTP_PORT (default: 3000)
  --extra-arg <a>          append arg (repeatable)
  --env KEY=VAL            add env var (repeatable)
  --config-path <path>     override host config file (advanced/tests)
  --print                  write snippet to stdout, no filesystem writes
  --dry-run                show unified diff, no write
  --uninstall              remove the entry
  --yes                    skip confirm prompt
```

Exit codes: `0` success or no-op, `1` user aborted, `2` host not detected, `3` config parse/write error, `4` overlapping entry with different content and `--yes` not passed.

### Adapter contract

```ts
interface HostAdapter {
  id: string;
  displayName: string;
  defaultPaths(): string[];
  detect(): Promise<DetectResult>;                       // "installed", "config-present", "absent"
  read(path: string): Promise<HostConfig>;
  merge(cfg: HostConfig, entry: McpEntry, name: string): HostConfig;
  render(cfg: HostConfig): string;                       // format-preserving serialize
  write(path: string, contents: string): Promise<void>;  // atomic: tmp + rename
}
```

`McpEntry` is a normalized `{ command, args, env, transport }` object per adapter's needs.

### Per-host behavior

- **claude-code** — prefers `claude mcp add-json <name> '<json>'` if `claude` is on `$PATH`. Falls back to editing `~/.claude.json` (user scope) or writing `.mcp.json` in the current directory (`--scope project`).
- **claude-desktop** — path resolution: macOS `~/Library/Application Support/Claude/claude_desktop_config.json`, Windows `%APPDATA%/Claude/claude_desktop_config.json`, Linux `~/.config/Claude/claude_desktop_config.json`. JSONC round-trip preserves comments (`jsonc-parser`).
- **codex** — `~/.codex/config.toml`. Format-preserving TOML via `smol-toml`. Inserts `[mcp_servers.<name>]`.
- **zed** — `~/.config/zed/settings.json`. Adds `context_servers.<name>`.
- **opencode** — project first (`./opencode.json` or `./opencode.jsonc`), else `~/.config/opencode/opencode.json`. Adds `mcp.<name>` with `type: "local"`.
- **all** — run every adapter whose `detect()` returns `installed`; skip absent hosts with a one-line note. Non-zero exit if any concrete failure; absence alone is not a failure.

### Safety

- Atomic write: temp file in the same directory → `fs.rename`.
- One-time backup: on first write to a given file, copy it to `<file>.bak-<epoch>`.
- Refuse to overwrite an existing entry with the same `--name` unless `--yes` is passed or the on-disk content already matches what we would write. Print a unified diff and exit `4` otherwise.
- `--print` and `--dry-run` never touch disk.
- Never write secrets; only literal `npx`, `-y`, `drawio-mcp-server`, and the requested flags.
- Refuse to run if `process.stdout.isTTY === false` **and** `--print` is not passed and stdin looks like an MCP JSON-RPC pipe (belt-and-braces against being invoked accidentally by a hosting MCP client). Guard is enforced by an integration test.

## Testing

Unit and integration tests live next to sources as `*.test.ts` per project convention.

Unit:

- `hosts/claude-code.test.ts` — merge into fresh + existing config, uninstall, `--scope project` vs user, `claude` CLI fallback stub.
- `hosts/claude-desktop.test.ts` — per-OS path resolution, JSONC comment preservation, atomic-rename on failure.
- `hosts/codex.test.ts` — TOML round-trip preserves comments/order; add + update + remove `[mcp_servers.drawio]`.
- `hosts/zed.test.ts` — settings.json merge under `context_servers`.
- `hosts/opencode.test.ts` — project-first vs global path resolution.
- `config-io.test.ts` — atomic write, backup creation, refuse-overwrite behavior, unified-diff output.
- `index.test.ts` — argv parsing, `--print`, `--dry-run` diff output, `all` skips absent hosts, exit code table.

Integration:

- `install.integration.test.ts` — spawn `node dist/index.js install codex --print --config-path <tmp>`; assert TOML on stdout parses and includes the expected block. Repeat for each host with a per-host temp config path.
- Extend the pattern used by `stdio-transport-purity.test.ts` with a case verifying `install` never opens the stdio transport (spawn `install --print` and assert no MCP frame is written to stdout).

Plugin/marketplace:

- `packages/drawio-mcp-claude-plugin/tests/manifest.test.ts` — JSON-schema-validate `plugin.json` and `.claude-plugin/marketplace.json` against Claude Code's published schema (pinned URL, cached under `tests/fixtures/`).
- `packages/drawio-mcp-claude-plugin/tests/commands.test.ts` — parse each command's frontmatter, assert allowed-tools list matches expected and body is non-empty.

## CI

Existing workflow cross-check (2026-07-07 audit):

- **`server-ci.yml`** — path filter includes `packages/drawio-mcp-server/**`; new install code and its tests fall under this filter. No workflow edit required.
- **`server-publish.yml`** — publishes `drawio-mcp-server`; install subcommand ships with it. No workflow edit required. Pre-existing bug noted: the release trigger uses `paths:`, which release events ignore; out of scope for this spec.
- **`extension-ci.yml` / `extension-package.yml` / `extension-publish.yml`** — unrelated to new work.

New workflow (fills the gap for plugin + marketplace):

```
.github/workflows/claude-plugin-ci.yml
```

Triggers: push and PR to `main` filtered on `packages/drawio-mcp-claude-plugin/**`, `.claude-plugin/**`, and the workflow file itself. Also `workflow_dispatch`.

Steps (single Node 24.x, ubuntu-latest):

1. Checkout, install pnpm, setup Node 24.x with pnpm cache.
2. `pnpm install`.
3. `pnpm audit --audit-level=moderate` (scoped to the plugin package via workspace).
4. `pnpm --filter drawio-mcp-claude-plugin test`.
5. `pnpm --filter drawio-mcp-claude-plugin lint` (Biome, same style as server).
6. Manifest schema validation (also part of the test suite; duplicated as a top-level step for CI clarity).

Release/versioning:

- Marketplace and plugin share a version, tracked in `.claude-plugin/marketplace.json` and `packages/drawio-mcp-claude-plugin/.claude-plugin/plugin.json`. Bumped manually before tagging. Documented under "Releasing" in `docs/PLUGINS.md`.
- Install subcommand ships in the next `drawio-mcp-server` minor (e.g. `2.2.0`). No separate publish.
- Future (not v1): optional `claude-plugin-publish.yml` verifying `plugin.json.version` equals the release tag on `release: created`.

## Documentation

### `docs/PLUGINS.md` (new)

Sections:

1. Quick install (Claude Code marketplace one-liner).
2. What the plugin ships (MCP server + `/drawio-open`, `/drawio-status`).
3. Install subcommand reference — every flag with an example per host.
4. Uninstall and troubleshooting.
5. Contributing: how to add a new host adapter; how to bump versions; local development against the marketplace via `--print` / `--config-path`.

### `README.md` diff

- Replace the multi-host collapsibles with a short pointer:
  > Fastest install: Claude Code → `/plugin marketplace add lgazo/drawio-mcp-server` then `/plugin install drawio`. Other hosts: `npx drawio-mcp-server install <host>`. See [PLUGINS.md](./docs/PLUGINS.md).
- Retain one Claude Desktop JSON snippet under a "Manual install (fallback)" collapsible so long-time readers don't lose the copy-paste path.

### `CONFIG.md`

- Add a short "Install subcommand" section that cross-links `PLUGINS.md`.

### `packages/drawio-mcp-claude-plugin/README.md`

- Short user-facing readme; the marketplace surfaces its first paragraph as the plugin description.

## Release / versioning

- Marketplace and plugin: `0.1.0` on first release; bump in lockstep with server minor releases.
- Install subcommand ships in `drawio-mcp-server` next minor.
- No breaking change to existing users — README's manual JSON snippet still works.

## Open items to resolve during plan writing

- Confirm the exact Claude Code marketplace schema URL to pin under `tests/fixtures/`.
- Verify Windows Claude Desktop path against the current app (`%APPDATA%` vs `%LOCALAPPDATA%`).
- Confirm `smol-toml` remains audit-clean at `--audit-level=moderate`; fallback to `@iarna/toml` if not.
- Multi-document target selection for `/drawio-open` — v1 uses the first connected document; v2 (out of scope) may support interactive picking.
