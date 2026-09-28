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
