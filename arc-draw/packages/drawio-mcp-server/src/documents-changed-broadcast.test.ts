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
          current_page: {
            index: 0,
            id: "p1",
            name: "Page-1",
            is_current: true,
          },
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
