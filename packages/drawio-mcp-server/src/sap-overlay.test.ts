import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { defaultConfig } from "./config.js";
import { createDrawioMcpApp, type DrawioMcpApp } from "./index.js";
import { MemoryLogger } from "./real-environment/logger.js";
import { SAP_DIAGRAM_INSTRUCTIONS } from "./sap-constitution.js";
import { SAP_EXAMPLES, SAP_GUIDELINE_TOPICS } from "./sap-reference.js";

type TextResult = { content: Array<{ type: string; text: string }> };

describe("ARC-DRAW SAP overlay (MCP surface)", () => {
  let app: DrawioMcpApp;
  let client: Client;

  beforeEach(async () => {
    app = createDrawioMcpApp({
      config: { ...defaultConfig(), logger: "console" },
      log: new MemoryLogger(),
    });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const server = app.createMcpServer();
    client = new Client({ name: "sap-overlay-test", version: "1.0.0" });
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);
  });

  afterEach(async () => {
    await client?.close();
    await app?.close();
  });

  it("auto-loads the SAP constitution as server instructions", () => {
    const instructions = client.getInstructions() ?? "";
    expect(instructions).toBe(SAP_DIAGRAM_INSTRUCTIONS);
    expect(instructions).toContain("SAP BTP Solution Diagram");
    expect(instructions).toContain("get-sap-examples");
  });

  it("registers the SAP tools", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining(["get-sap-examples", "get-sap-guideline"]),
    );
  });

  it("get-sap-examples returns the canonical patterns", async () => {
    const res = (await client.callTool({
      name: "get-sap-examples",
      arguments: {},
    })) as TextResult;
    expect(res.content[0].text).toBe(SAP_EXAMPLES);
  });

  it("get-sap-guideline answers every advertised topic", async () => {
    expect(SAP_GUIDELINE_TOPICS.length).toBeGreaterThan(0);
    for (const topic of SAP_GUIDELINE_TOPICS) {
      const res = (await client.callTool({
        name: "get-sap-guideline",
        arguments: { topic },
      })) as TextResult;
      expect(res.content[0].text).not.toMatch(/^Unknown topic/);
      expect(res.content[0].text.length).toBeGreaterThan(20);
    }
  });

  it("get-sap-guideline normalises topic names and rejects unknown ones", async () => {
    const ok = (await client.callTool({
      name: "get-sap-guideline",
      arguments: { topic: "Product Names" },
    })) as TextResult;
    expect(ok.content[0].text).not.toMatch(/^Unknown topic/);

    const bad = (await client.callTool({
      name: "get-sap-guideline",
      arguments: { topic: "does-not-exist" },
    })) as TextResult;
    expect(bad.content[0].text).toMatch(/^Unknown topic/);
  });

  it("every topic listed in the instructions exists", () => {
    const listed = [
      "areas", "connectors", "foundation", "icons", "numbers",
      "product_names", "component_groups", "big_picture", "examples",
      "intro", "atomic", "text",
    ];
    for (const t of listed) expect(SAP_GUIDELINE_TOPICS).toContain(t);
  });
});
