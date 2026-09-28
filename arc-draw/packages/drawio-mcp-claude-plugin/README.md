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
