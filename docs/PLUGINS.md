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

The install subcommand ships with the `drawio-mcp-server` npm package. It writes/updates/removes the MCP entry in each host's own config file, using format-preserving parsers (`jsonc-parser` for JSON, a block-splicing merger backed by `smol-toml` for TOML rendering).

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
