---
description: Open a Draw.io file (path or URL) in the connected editor or extension.
allowed-tools:
  - Read
  - WebFetch
  - Bash(node:*)
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
   - Launch via a Node spawn that argv-passes the URL (never shell-interpolate it into a command string, since `$URL` may contain characters from `$ARGUMENTS`):
     ```
     node -e 'const {spawn}=require("child_process"); const url=process.argv[1]; const cmd = process.platform==="darwin"?"open":process.platform==="win32"?"cmd":"xdg-open"; const args = process.platform==="win32"?["/c","start","",url]:[url]; spawn(cmd,args,{detached:true,stdio:"ignore"}).unref();' "$URL"
     ```
     `$URL` becomes `argv[1]` to `node`, not part of the shell command, so shell metacharacters in it are inert.
6. Report to the user:
   - Mode used (extension-import vs editor-only).
   - Which document (if any) received the import.
   - The URL that was opened.

Error handling:
- File not found → tell the user which path failed.
- Server unreachable → suggest they run `npx drawio-mcp-server --editor` or check the port.
- Import fails → surface the MCP tool's error verbatim.
