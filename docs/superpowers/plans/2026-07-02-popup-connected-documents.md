# Popup Connected Documents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the server-tracked list of connected drawio documents in the extension popup, refreshed via a push-based control frame.

**Architecture:** Server emits a new `__control: "documents-changed"` WebSocket frame carrying `ConnectedDocumentInfo[]` on every doc lifecycle mutation. Background caches the last snapshot and forwards it to the popup via `browser.runtime.sendMessage`. Popup renders one row per document and removes the static Supported Features section.

**Tech Stack:** TypeScript, React (popup), `ws` (server WebSocket), Jest (server tests), WXT (extension bundler), Biome (server lint).

## Global Constraints

- Stdout discipline — `packages/drawio-mcp-server/src/**` outside the allowlist in `AGENTS.md` MUST NOT use `console.*`. Use the injected `AppLogger` (available as `getLog()` inside `createDrawioMcpApp`).
- Extension packages (`packages/drawio-mcp-extension/**`) are exempt and may use `console.*` freely.
- Existing `sendControlMessage(entry, control)` only sends `{ __control: control }` with no payload — the new frame needs a payload, so it MUST be sent directly via `entry.ws.send(...)` and gated on `entry.ws.readyState === WebSocket.OPEN`.
- Do not alter published `ConnectedDocumentInfo` shape in `src/types.ts` — new frame reuses it verbatim.
- Biome lint gates server changes: run `pnpm --filter drawio-mcp-server lint` before commit.

Spec: `docs/superpowers/specs/2026-07-02-popup-connected-documents-design.md`.

---

## File Structure

- **Modify** `packages/drawio-mcp-server/src/index.ts` — add `broadcastDocumentsChanged()`, call at 4 mutation sites.
- **Create** `packages/drawio-mcp-server/src/documents-changed-broadcast.test.ts` — integration test over WS.
- **Modify** `packages/drawio-mcp-extension/types.ts` — duplicate `ConnectedDocumentInfo` / `CurrentDocumentPageInfo` types.
- **Modify** `packages/drawio-mcp-extension/entrypoints/background.ts` — snapshot state, dispatch branch, message handler, close reset.
- **Modify** `packages/drawio-mcp-extension/entrypoints/popup/App.tsx` — new state + effect, new card, remove Supported Features.
- **Modify** `packages/drawio-mcp-extension/entrypoints/popup/App.css` — new row/list rules, remove `.features-*` rules.

---

## Task 1: Server broadcast on document lifecycle

**Files:**
- Modify: `packages/drawio-mcp-server/src/index.ts` — add helper near `sendControlMessage` (~ line 523); call at lines 890, 900, and inside ws `close`/`error` (~ lines 917 and 926) after `conns.delete`.
- Create: `packages/drawio-mcp-server/src/documents-changed-broadcast.test.ts`

**Interfaces:**
- Consumes (existing): `conns: Map<string, ConnectionEntry>`, `listKnownDocuments()`, `WebSocket` from `ws`, `getLog()`.
- Produces (new outbound WS frame consumed by Task 2):
  ```json
  { "__control": "documents-changed", "documents": ConnectedDocumentInfo[] }
  ```

- [ ] **Step 1: Write the failing integration test**

Create `packages/drawio-mcp-server/src/documents-changed-broadcast.test.ts`:

```ts
import WebSocket from "ws";

import { createDrawioMcpApp, type DrawioMcpApp } from "./index.js";
import { MemoryLogger } from "./real-environment/logger.js";

const HOST = "127.0.0.1";

async function waitForMessage(
  ws: WebSocket,
  predicate: (payload: any) => boolean,
  timeoutMs = 2000,
): Promise<any> {
  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off("message", onMessage);
      reject(new Error("timeout waiting for matching WebSocket message"));
    }, timeoutMs);

    function onMessage(data: WebSocket.RawData) {
      const text = typeof data === "string" ? data : data.toString();
      let json: any;
      try {
        json = JSON.parse(text);
      } catch {
        return;
      }
      if (predicate(json)) {
        clearTimeout(timer);
        ws.off("message", onMessage);
        resolve(json);
      }
    }

    ws.on("message", onMessage);
  });
}

async function openClient(port: number): Promise<WebSocket> {
  const ws = new WebSocket(`ws://${HOST}:${port}`);
  await new Promise<void>((resolve, reject) => {
    ws.once("open", () => resolve());
    ws.once("error", reject);
  });
  // Server sends `sync-document-state` on connect; ignore it here.
  return ws;
}

describe("documents-changed broadcast", () => {
  let app: DrawioMcpApp;
  let logger: MemoryLogger;
  let port: number;

  beforeEach(async () => {
    logger = new MemoryLogger();
    app = createDrawioMcpApp({ log: logger });
    const wsServer = await app.startWebSocketServer(0, HOST);
    port = (wsServer.address() as { port: number }).port;
  });

  afterEach(async () => {
    await app.close();
  });

  it("emits documents-changed after inbound document-state", async () => {
    const ws = await openClient(port);
    const received = waitForMessage(
      ws,
      (json) => json?.__control === "documents-changed",
    );
    ws.send(
      JSON.stringify({
        __control: "document-state",
        document: {
          id: "doc-a",
          title: "Alpha",
          mode: "device",
          hash: null,
          file_url: null,
          page_count: 1,
          current_page: { index: 0, id: "p1", name: "Page-1", is_current: true },
        },
      }),
    );
    const payload = await received;
    expect(payload.documents).toHaveLength(1);
    expect(payload.documents[0].id).toBe("doc-a");
    expect(payload.documents[0].title).toBe("Alpha");
    ws.close();
  });

  it("emits documents-changed after inbound document-removed", async () => {
    const ws = await openClient(port);
    ws.send(
      JSON.stringify({
        __control: "document-state",
        document: {
          id: "doc-b",
          title: "Beta",
          mode: "device",
          hash: null,
          file_url: null,
          page_count: 1,
          current_page: null,
        },
      }),
    );
    await waitForMessage(
      ws,
      (json) =>
        json?.__control === "documents-changed" && json.documents.length === 1,
    );

    const removed = waitForMessage(
      ws,
      (json) =>
        json?.__control === "documents-changed" && json.documents.length === 0,
    );
    ws.send(
      JSON.stringify({
        __control: "document-removed",
        document_id: "doc-b",
      }),
    );
    const payload = await removed;
    expect(payload.documents).toEqual([]);
    ws.close();
  });

  it("emits documents-changed to remaining clients after peer disconnect", async () => {
    const clientA = await openClient(port);
    const clientB = await openClient(port);

    clientA.send(
      JSON.stringify({
        __control: "document-state",
        document: {
          id: "doc-c",
          title: "Gamma",
          mode: "device",
          hash: null,
          file_url: null,
          page_count: 1,
          current_page: null,
        },
      }),
    );
    await waitForMessage(
      clientB,
      (json) =>
        json?.__control === "documents-changed" && json.documents.length === 1,
    );

    const drained = waitForMessage(
      clientB,
      (json) =>
        json?.__control === "documents-changed" && json.documents.length === 0,
    );
    clientA.close();
    const payload = await drained;
    expect(payload.documents).toEqual([]);
    clientB.close();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter drawio-mcp-server test -- --testPathPattern documents-changed-broadcast`

Expected: all three tests FAIL (timeout waiting for `documents-changed`).

- [ ] **Step 3: Add the broadcast helper**

In `packages/drawio-mcp-server/src/index.ts`, insert immediately after `sendControlMessage` (currently ends at line 534):

```ts
  function broadcastDocumentsChanged() {
    const documents = listKnownDocuments();
    const frame = JSON.stringify({
      __control: "documents-changed",
      documents,
    });
    for (const entry of conns.values()) {
      if (entry.ws.readyState !== WebSocket.OPEN) {
        continue;
      }
      try {
        entry.ws.send(frame);
      } catch (error) {
        getLog().debug(`[ws] documents-changed send failed`, error);
      }
    }
  }
```

- [ ] **Step 4: Invoke helper on `document-state`**

In the `ws.on("message", ...)` handler in `index.ts`, replace the existing `document-state` block (currently lines 886-894):

```ts
          if (json?.__control === "document-state") {
            const document = normalizeDocumentState(json.document);
            if (document) {
              entry.documents.set(document.id, document);
            }
            entry.updated_at = Date.now();
            flushSyncWaiters(entry);
            broadcastDocumentsChanged();
            return;
          }
```

- [ ] **Step 5: Invoke helper on `document-removed`**

In the same handler, replace the existing `document-removed` block (currently lines 896-903):

```ts
          if (json?.__control === "document-removed") {
            const removedId = normalizeOptionalString(json.document_id);
            if (removedId) {
              entry.documents.delete(removedId);
              entry.updated_at = Date.now();
              broadcastDocumentsChanged();
            }
            return;
          }
```

- [ ] **Step 6: Invoke helper on WebSocket `close` and `error`**

Replace the existing `ws.on("close", ...)` and `ws.on("error", ...)` blocks (currently lines 916-928):

```ts
      ws.on("close", (code) => {
        flushSyncWaiters(entry);
        conns.delete(connection_id);
        broadcastDocumentsChanged();
        getLog().debug(
          `[ws_handler] WebSocket client ${connection_id} closed with code ${code}`,
        );
      });

      ws.on("error", (error) => {
        getLog().debug(`[ws_handler] WebSocket client error`, error);
        flushSyncWaiters(entry);
        conns.delete(connection_id);
        broadcastDocumentsChanged();
      });
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `pnpm --filter drawio-mcp-server test -- --testPathPattern documents-changed-broadcast`

Expected: all three tests PASS.

- [ ] **Step 8: Run full server suite + lint**

Run: `pnpm --filter drawio-mcp-server test`

Expected: pre-existing suites (including `stdio-transport-purity.test.ts`) still PASS.

Run: `pnpm --filter drawio-mcp-server lint`

Expected: PASS (Biome allows no new `console.*` — the helper uses `getLog()`).

- [ ] **Step 9: Commit**

```bash
git add packages/drawio-mcp-server/src/index.ts \
        packages/drawio-mcp-server/src/documents-changed-broadcast.test.ts
git commit -m "feat(server): broadcast documents-changed on doc lifecycle events"
```

---

## Task 2: Extension background — snapshot cache and dispatch branch

**Files:**
- Modify: `packages/drawio-mcp-extension/types.ts` — add `CurrentDocumentPageInfo`, `ConnectedDocumentInfo`.
- Modify: `packages/drawio-mcp-extension/entrypoints/background.ts` — snapshot state, `dispatchServerMessage` branch, `GET_DOCUMENTS` handler, WS close reset.

**Interfaces:**
- Consumes (Task 1): inbound WS frame `{ __control: "documents-changed", documents: ConnectedDocumentInfo[] }`.
- Produces (consumed by Task 3):
  - `browser.runtime.sendMessage({ type: "GET_DOCUMENTS" }) → { documents: ConnectedDocumentInfo[] }`
  - Broadcast `browser.runtime.sendMessage({ type: "DOCUMENTS_UPDATE", documents: ConnectedDocumentInfo[] })`

- [ ] **Step 1: Add types to `packages/drawio-mcp-extension/types.ts`**

Append to the existing file (after the `bus_reply_stream` const):

```ts
export type CurrentDocumentPageInfo = {
  index: number;
  id: string;
  name: string;
  is_current: true;
};

export type ConnectedDocumentInfo = {
  id: string;
  title: string | null;
  mode: string | null;
  hash: string | null;
  file_url: string | null;
  page_count: number;
  current_page: CurrentDocumentPageInfo | null;
};
```

- [ ] **Step 2: Import the new type in `background.ts`**

Add to the top of `packages/drawio-mcp-extension/entrypoints/background.ts` (below the existing config import):

```ts
import type { ConnectedDocumentInfo } from '../types';
```

- [ ] **Step 3: Add snapshot state inside `defineBackground(() => { ... })`**

Insert next to the existing `currentCompatState` declaration (currently around line 26):

```ts
  let currentDocumentsSnapshot: ConnectedDocumentInfo[] = [];
```

- [ ] **Step 4: Add branch in `dispatchServerMessage`**

Modify `dispatchServerMessage` in `background.ts` (currently starts at line 246). Insert this block at the top of the function body, before the existing `targetDocumentId` handling:

```ts
    if (
      payload?.__control === "documents-changed" &&
      Array.isArray(payload?.documents)
    ) {
      currentDocumentsSnapshot = payload.documents as ConnectedDocumentInfo[];
      browser.runtime
        .sendMessage({
          type: "DOCUMENTS_UPDATE",
          documents: currentDocumentsSnapshot,
        })
        .catch(() => {
          // no popup listening — swallow
        });
      return;
    }
```

- [ ] **Step 5: Handle `GET_DOCUMENTS` in the popup message listener**

In the existing `browser.runtime.onMessage.addListener((message, _sender, sendResponse) => { ... })` block (currently starts at line 314), add a new `if` sibling to the existing `GET_COMPAT_STATE` handler:

```ts
    if (message.type === "GET_DOCUMENTS") {
      sendResponse({ documents: currentDocumentsSnapshot });
    }
```

- [ ] **Step 6: Reset snapshot on WebSocket close**

Modify the existing `socket.addEventListener("close", ...)` handler in `connect()` (currently around line 177). Add the reset lines before the existing `broadcastToContentScripts` call:

```ts
      socket.addEventListener("close", (event) => {
        console.debug("[background] WebSocket connection closed", event);
        setExtensionIcon("disconnected");
        currentDocumentsSnapshot = [];
        browser.runtime
          .sendMessage({ type: "DOCUMENTS_UPDATE", documents: [] })
          .catch(() => {});
        broadcastToContentScripts({ type: "WS_STATUS", connected: false });
        attemptReconnect();
      });
```

- [ ] **Step 7: Build the extension**

Run: `pnpm --filter drawio-mcp-extension build`

Expected: no TypeScript errors, `.output/` populated.

- [ ] **Step 8: Commit**

```bash
git add packages/drawio-mcp-extension/types.ts \
        packages/drawio-mcp-extension/entrypoints/background.ts
git commit -m "feat(extension): cache documents-changed snapshot in background"
```

---

## Task 3: Popup Connected Documents card + remove Supported Features

**Files:**
- Modify: `packages/drawio-mcp-extension/entrypoints/popup/App.tsx`
- Modify: `packages/drawio-mcp-extension/entrypoints/popup/App.css`

**Interfaces:**
- Consumes (Task 2):
  - `browser.runtime.sendMessage({ type: "GET_DOCUMENTS" }) → { documents: ConnectedDocumentInfo[] }`
  - Inbound message `{ type: "DOCUMENTS_UPDATE", documents: ConnectedDocumentInfo[] }`
- Produces: no downstream consumers.

- [ ] **Step 1: Import `ConnectedDocumentInfo` in `App.tsx`**

Replace the existing import block at the top of `App.tsx` with:

```tsx
import { useState, useEffect } from "react";
import "./App.css";
import { getWebSocketUrl } from "../../config";
import type { ConnectedDocumentInfo } from "../../types";
import { CompatBanner } from "./CompatBanner.js";
```

- [ ] **Step 2: Replace `App` component**

Overwrite the entire `App` function in `App.tsx` (lines 15-161) with the version below. Removes `featuresExpanded` state and the Supported Features JSX; adds `documents` state + effect + card:

```tsx
function App() {
  const [connectionState, setConnectionState] = useState<ConnectionState>("disconnected");
  const [compatState, setCompatState] = useState<CompatState>({ kind: "unknown" });
  const [documents, setDocuments] = useState<ConnectedDocumentInfo[]>([]);
  const [currentUrl, setCurrentUrl] = useState<string>("");

  useEffect(() => {
    getWebSocketUrl()
      .then(setCurrentUrl)
      .catch(error => console.error("Error loading config:", error));

    browser.runtime.sendMessage({ type: "GET_CONNECTION_STATE" })
      .then((response) => {
        if (response && response.state) {
          setConnectionState(response.state);
        }
      })
      .catch(error => console.error("Error getting connection state:", error));

    const listener = (message: any) => {
      if (message.type === "CONNECTION_STATE_UPDATE") {
        setConnectionState(message.state);
      }
      return true;
    };

    browser.runtime.onMessage.addListener(listener);
    return () => browser.runtime.onMessage.removeListener(listener);
  }, []);

  useEffect(() => {
    browser.runtime.sendMessage({ type: "GET_COMPAT_STATE" })
      .then((response) => { if (response?.state) setCompatState(response.state); })
      .catch((error) => console.error("compat state fetch failed:", error));

    const listener = (message: any) => {
      if (message.type === "COMPAT_STATE_UPDATE") setCompatState(message.state);
      return true;
    };
    browser.runtime.onMessage.addListener(listener);
    return () => browser.runtime.onMessage.removeListener(listener);
  }, []);

  useEffect(() => {
    browser.runtime.sendMessage({ type: "GET_DOCUMENTS" })
      .then((response) => {
        if (response?.documents) setDocuments(response.documents);
      })
      .catch((error) => console.error("documents fetch failed:", error));

    const listener = (message: any) => {
      if (message.type === "DOCUMENTS_UPDATE" && Array.isArray(message.documents)) {
        setDocuments(message.documents);
      }
      return true;
    };
    browser.runtime.onMessage.addListener(listener);
    return () => browser.runtime.onMessage.removeListener(listener);
  }, []);

  const logoSrc = `/icon/logo_${connectionState}_128.png`;

  const copyId = (id: string) => {
    navigator.clipboard.writeText(id).catch((err) =>
      console.error("clipboard write failed:", err),
    );
  };

  return (
    <>
      <CompatBanner state={compatState} />
      <div>
        <a href="https://github.com/lgazo/drawio-mcp-server" target="_blank">
          <img src={logoSrc} className="logo" alt="Draw.io MCP logo" />
        </a>
      </div>
      <h1>Draw.io MCP</h1>
      <div className="header-actions">
        <button
          onClick={() => browser.runtime.openOptionsPage()}
          className="settings-button"
          title="Open Settings"
        >
          ⚙️ Settings
        </button>
      </div>
      <div className="connection-status">
        <div className={`status-indicator ${connectionState}`}></div>
        <span>Status: {connectionState.charAt(0).toUpperCase() + connectionState.slice(1)}</span>
      </div>
      <div className="card">
        <p>
          The WebSocket connection is currently <strong>{connectionState}</strong>
          {currentUrl && (
            <>
              {" at "}
              <strong className="connection-url">{currentUrl}</strong>
            </>
          )}
          .
        </p>
        {connectionState !== "connected" && (
          <p>
            {connectionState === "connecting"
              ? "Attempting to connect to the MCP server..."
              : "Not connected to the MCP server. The server may be offline."}
          </p>
        )}
      </div>

      <div className="card">
        <div className="button-container">
          <button
            onClick={() => {
              browser.runtime.sendMessage({ type: "SEND_PING_TO_SERVER" })
                .catch(error => console.error("Error sending ping:", error));
            }}
            disabled={connectionState !== "connected"}
            className="ping-button"
          >
            Ping Server
          </button>

          {connectionState === "disconnected" && (
            <button
              onClick={() => {
                browser.runtime.sendMessage({ type: "RECONNECT_TO_SERVER" })
                  .catch(error => console.error("Error reconnecting:", error));
              }}
              className="connect-button"
            >
              Connect
            </button>
          )}
        </div>
      </div>

      <div className="card">
        <p>Please open <a href="https://app.diagrams.net/" target="_blank">Draw.io</a> website to use MCP features</p>
      </div>

      <div className="card align-left documents-section">
        <h3 className="documents-heading">
          Connected Documents ({documents.length})
        </h3>
        {documents.length === 0 ? (
          <p className="empty">No documents connected</p>
        ) : (
          <ul className="documents-list">
            {documents.map((doc) => (
              <li key={doc.id} className="document-row">
                <div className="document-title-line">
                  <strong>{doc.title ?? "(untitled)"}</strong>
                  <span className="document-id" title={doc.id}>
                    {doc.id.slice(0, 8)}…
                  </span>
                  <button
                    type="button"
                    className="copy-id-button"
                    title="Copy full id"
                    onClick={() => copyId(doc.id)}
                  >
                    📋
                  </button>
                </div>
                <div className="document-meta">
                  mode: {doc.mode ?? "—"} · {doc.page_count} pages · current:{" "}
                  {doc.current_page?.name ?? "—"}
                </div>
                {doc.file_url && (
                  <div className="document-url" title={doc.file_url}>
                    <code>{doc.file_url}</code>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

export default App;
```

- [ ] **Step 3: Update `App.css`**

Remove the Features section block (currently lines 165-204, everything from `/* Features section styles */` down to the closing `}` of `.features-list` — including the `@keyframes fadeIn` block that only serves it).

Append the new Documents section styles to the end of `App.css`:

```css
/* Documents section styles */
.documents-section {
  margin-top: 1em;
}

.documents-heading {
  margin-bottom: 0.5em;
}

.documents-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.document-row {
  padding: 0.5em 0;
  border-bottom: 1px solid #eee;
}

.document-row:last-child {
  border-bottom: none;
}

.document-title-line {
  display: flex;
  align-items: center;
  gap: 0.5em;
}

.document-id {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.8em;
  color: #666;
}

.copy-id-button {
  border: none;
  background: transparent;
  cursor: pointer;
  padding: 0 0.25em;
  font-size: 0.9em;
}

.copy-id-button:hover {
  background-color: #f0f0f0;
  border-radius: 3px;
}

.document-meta {
  font-size: 0.85em;
  color: #555;
  margin-top: 0.15em;
}

.document-url {
  font-size: 0.8em;
  color: #888;
  margin-top: 0.15em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.empty {
  color: #999;
  font-style: italic;
  margin: 0.5em 0;
}
```

- [ ] **Step 4: Build the extension**

Run: `pnpm --filter drawio-mcp-extension build`

Expected: no TypeScript errors, `.output/` populated with updated bundle.

- [ ] **Step 5: Manual verification**

Load the built extension in a browser, start the server via `pnpm --filter drawio-mcp-server dev` (or the project's usual command). Then:

1. Open popup with no drawio tabs — "No documents connected" appears.
2. Open `https://app.diagrams.net/` in a new tab — a row appears within ~2 seconds.
3. Rename a page in drawio — the row's `current: ...` updates.
4. Close the drawio tab — the row disappears.
5. Stop the server — WS closes, list clears immediately.
6. Restart the server, reopen popup — list repopulates once drawio tab reconnects.
7. Click 📋 on a row — paste elsewhere to confirm clipboard contains the full id.
8. Confirm Supported Features section is gone from the popup.

- [ ] **Step 6: Commit**

```bash
git add packages/drawio-mcp-extension/entrypoints/popup/App.tsx \
        packages/drawio-mcp-extension/entrypoints/popup/App.css
git commit -m "feat(extension): show connected documents in popup"
```
