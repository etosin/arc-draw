import { useState, useEffect } from "react";
import "./App.css";
import { getWebSocketUrl } from "../../config";
import type { ConnectedDocumentInfo } from "../../types";
import { CompatBanner } from "./CompatBanner.js";

type ConnectionState = "connected" | "connecting" | "disconnected";

type CompatState =
  | { kind: "unknown" }
  | { kind: "ok"; version: string }
  | { kind: "below-floor"; version: string; floor: string }
  | { kind: "above-window"; version: string; lastSupportedMin: string }
  | { kind: "no-version"; reason: "missing" | "unparseable" };

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
