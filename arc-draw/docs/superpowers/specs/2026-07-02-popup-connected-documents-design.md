# Show connected documents in extension popup

## Problem

The extension popup surfaces WebSocket connection state and a static
"Supported Features" list, but gives no visibility into which drawio
documents the server currently has under management. When multiple
drawio tabs are open, users have no way to see what `target_document.id`
values are available for MCP tool calls, nor to confirm the server sees
each tab.

The server already tracks this information via
`DocumentRouting.list_documents() → ConnectedDocumentInfo[]` and the
`list-documents` MCP tool. Nothing exposes it to the popup UI.

## Goal

Display the list of currently-connected drawio documents in the popup,
sourced from the server (authoritative), pushed on change, with copy
of the full instance id available per row. Remove the static
`Supported Features` section — the space is more valuable for live data.

## Data flow

```
[drawio tab] --content port--> [background] --WS--> [server]
                                                       │
                                                       │ on any doc lifecycle change:
                                                       │   docs = list_documents()
                                                       │   ws.send({ __control: "documents-changed",
                                                       │             documents: docs })
                                                       ▼
[popup] <--runtime.sendMessage--- [background]  <-----(inbound WS frame)
        DOCUMENTS_UPDATE / GET_DOCUMENTS reply       cache = documents
```

The server is the single source of truth. Background caches the last
received snapshot so a popup that opens between pushes still sees the
current state.

## Wire protocol

New outbound control frame (server → each connected extension WS):

```json
{
  "__control": "documents-changed",
  "documents": ConnectedDocumentInfo[]
}
```

`ConnectedDocumentInfo` shape is already defined in
`packages/drawio-mcp-server/src/types.ts` and is not changed:

```ts
type ConnectedDocumentInfo = {
  id: string;
  title: string | null;
  mode: string | null;
  hash: string | null;
  file_url: string | null;
  page_count: number;
  current_page: CurrentDocumentPageInfo | null;
};
```

The frame has no `target_document.id`, so background's
`dispatchServerMessage` will treat it as a control frame (not routed to
a single content port).

Server emits `documents-changed` on:
- inbound `__control: "document-state"` frame that adds a new
  document id OR mutates metadata of an existing one;
- inbound `__control: "document-removed"` frame;
- extension WS client disconnect that removes documents owned by that
  client (if the server tracks per-client ownership).

Idempotency: the server may emit even when the observable list is
unchanged — the extension diff is cheap and simpler than a dirty check.

## Server changes (`packages/drawio-mcp-server/`)

1. Extend the code path that owns `DocumentRouting`'s internal state
   (whichever module in `src/real-environment/` or equivalent already
   handles `document-state` / `document-removed` inbound frames) with
   a broadcast helper:

   ```ts
   async function broadcast_documents_changed(): Promise<void> {
     const documents = await context.document_routing.list_documents();
     for (const client of connected_extension_clients) {
       client.send({ __control: "documents-changed", documents });
     }
   }
   ```

2. Call `broadcast_documents_changed()` at every mutation trigger
   listed above.

3. Logging is via the injected `AppLogger` — no `console.*` in
   `packages/drawio-mcp-server/src/**` per the stdout discipline
   rules in `AGENTS.md`.

4. The existing `list-documents` MCP tool is unchanged.

## Extension background changes (`entrypoints/background.ts`)

New state:

```ts
let currentDocumentsSnapshot: ConnectedDocumentInfo[] = [];
```

`ConnectedDocumentInfo` type is duplicated in
`packages/drawio-mcp-extension/types.ts` — the extension already
duplicates `CompatState` in the same way, and no shared types package
exists yet. Keeping the duplication local avoids introducing a new
workspace boundary for one type.

New branch in `dispatchServerMessage`, before the existing
`target_document.id` routing:

```ts
if (payload?.__control === "documents-changed" && Array.isArray(payload?.documents)) {
  currentDocumentsSnapshot = payload.documents;
  browser.runtime
    .sendMessage({ type: "DOCUMENTS_UPDATE", documents: currentDocumentsSnapshot })
    .catch(() => {});
  return;
}
```

Malformed frame handling: if `__control === "documents-changed"` but
`documents` is missing or not an array, log via `console.debug` and
ignore (browser packages are exempt from the stdout rules).

New handler in the `browser.runtime.onMessage.addListener`:

```ts
if (message.type === "GET_DOCUMENTS") {
  sendResponse({ documents: currentDocumentsSnapshot });
}
```

WS `close` listener additions:

```ts
currentDocumentsSnapshot = [];
browser.runtime
  .sendMessage({ type: "DOCUMENTS_UPDATE", documents: [] })
  .catch(() => {});
```

No changes to per-document port routing — the new frame has no
`target_document.id` and never enters the routing map.

## Extension popup UI (`entrypoints/popup/`)

### `App.tsx`

New state:

```ts
const [documents, setDocuments] = useState<ConnectedDocumentInfo[]>([]);
```

New effect (parallels the existing compat / connection effects):

```ts
browser.runtime.sendMessage({ type: "GET_DOCUMENTS" })
  .then(r => { if (r?.documents) setDocuments(r.documents); })
  .catch(err => console.error("documents fetch failed:", err));

const listener = (message: any) => {
  if (message.type === "DOCUMENTS_UPDATE") setDocuments(message.documents);
  return true;
};
browser.runtime.onMessage.addListener(listener);
return () => browser.runtime.onMessage.removeListener(listener);
```

### Popup section order

Replaces the current order — the `Supported Features` card is removed,
along with `featuresExpanded` state:

1. CompatBanner
2. logo + title
3. Settings button
4. connection-status
5. connection card + ping/reconnect
6. drawio hint card
7. **Connected Documents card** (new)

### Connected Documents card

```
Connected Documents (N)
────────────────────────────────
▸ Untitled Diagram         [4f2a…] 📋
   mode: google · 3 pages · current: Overview
   https://drive.google.com/…
▸ Flowchart                [8c11…] 📋
   mode: device · 1 page · current: Page-1
────────────────────────────────
```

Row structure per document:
- **Line 1** — `title ?? "(untitled)"` in bold, then short id
  `id.slice(0, 8) + "…"` in monospace with a 📋 button
  (`title="Copy full id"`).
- **Line 2** — `mode: {mode ?? "—"} · {page_count} pages · current:
  {current_page?.name ?? "—"}`.
- **Line 3** (rendered only if `file_url` non-null) — the URL in
  `<code>` with CSS ellipsis; `title={file_url}` for full value on
  hover. No click-through.

Empty state: `<p className="empty">No documents connected</p>`.

Copy button:

```ts
onClick={() => navigator.clipboard.writeText(doc.id)}
```

No visible feedback beyond the native clipboard write. If the clipboard
API rejects, log via `console.error`.

### CSS (`App.css`)

Add rules for `.documents-list`, `.document-row`, `.document-meta`,
`.document-url`, `.copy-id-button`, `.empty`. Compact spacing;
monospace font for id and url; ellipsis on url overflow.

Remove rules that only serve the deleted `Supported Features` section:
`.features-section`, `.features-heading`, `.expand-icon`,
`.features-list`.

## Testing

Server (`packages/drawio-mcp-server/`):
- Unit — the module owning `DocumentRouting` state emits
  `documents-changed` when a `document-state` frame adds or mutates a
  document, and when `document-removed` fires.
- Integration — feed a `document-state` frame into the WS layer, assert
  the outbound `documents-changed` frame has the expected shape and
  contains the newly-added document.
- Regression — `stdio-transport-purity.test.ts` continues to pass (no
  new `console.*` in server sources).

Extension:
- Manual verification checklist (no test harness exists for background
  or popup today; introducing one is out of scope):
  1. Open popup with no drawio tabs — empty state shown.
  2. Open a drawio tab — row appears in popup within a couple of
     seconds (push).
  3. Rename a page in drawio — row's `current` field updates.
  4. Close the drawio tab — row disappears.
  5. Stop the server — WS closes, list clears.
  6. Restart the server — list repopulates.
  7. Click the 📋 button — full instance id in clipboard.

## Non-goals

- Focus / activate the browser tab from a popup click.
- Open `file_url` in a new tab.
- Pagination — the list is small (one row per open drawio doc).
- i18n changes.
- Extracting `ConnectedDocumentInfo` into a shared workspace package.
