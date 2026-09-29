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

  it("tells the agent to pick a diagram level matching the audience", () => {
    const instructions = client.getInstructions() ?? "";
    expect(instructions).toContain("Match the level of detail to the audience");
    expect(instructions).toMatch(/L0.*L1.*L2/s);
  });

  it("tells the agent NOT to announce the level unless asked", () => {
    // A live test found the model narrating "drawing in L2" unprompted, which
    // most users asking for "a diagram" neither understand nor want. The level
    // still governs styling/detail (checked below), it just should not be
    // announced on its own.
    const instructions = client.getInstructions() ?? "";
    expect(instructions).toMatch(
      /do\s+not\s+announce\s+the\s+level.*unless\s+they\s+bring/is,
    );
  });

  it("puts the level decision as the first step of the compose order, before create-page", () => {
    const instructions = client.getInstructions() ?? "";
    const composeIdx = instructions.indexOf("Compose order");
    expect(composeIdx).toBeGreaterThan(-1);
    const decideLevelIdx = instructions.indexOf(
      "Decide the level before drawing anything",
      composeIdx,
    );
    const createPageIdx = instructions.indexOf("create-page", composeIdx);
    expect(decideLevelIdx).toBeGreaterThan(composeIdx);
    expect(decideLevelIdx).toBeLessThan(createPageIdx);
  });

  it("registers the SAP tools", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "get-sap-examples",
        "get-sap-guideline",
        "check-sap-diagram",
      ]),
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

describe("check-sap-diagram", () => {
  let app: DrawioMcpApp;
  let client: Client;

  const SAP_XML =
    '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>' +
    '<mxCell id="a" value="" style="" vertex="1" parent="1">' +
    '<mxGeometry width="1" height="1" as="geometry"/></mxCell>' +
    "</root></mxGraphModel>";

  beforeEach(async () => {
    app = createDrawioMcpApp({
      config: { ...defaultConfig(), logger: "console" },
      log: new MemoryLogger(),
    });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const server = app.createMcpServer();
    client = new Client({ name: "check-sap-diagram-test", version: "1.0.0" });
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);
  });

  afterEach(async () => {
    await client?.close();
    await app?.close();
  });

  it("checks a diagram passed directly as xml", async () => {
    const res = (await client.callTool({
      name: "check-sap-diagram",
      arguments: { xml: SAP_XML },
    })) as TextResult;
    expect(res.content[0].text).toContain("SAP diagram check:");
    expect(res.content[0].text).toContain("0 error(s)");
  });

  it("checks a .drawio file by path", async () => {
    const fs = await import("node:fs");
    const os = await import("node:os");
    const path = await import("node:path");
    const file = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), "arc-draw-")),
      "diagram.drawio",
    );
    fs.writeFileSync(file, SAP_XML, "utf-8");

    const res = (await client.callTool({
      name: "check-sap-diagram",
      arguments: { file_path: file },
    })) as TextResult;
    expect(res.content[0].text).toContain("SAP diagram check:");
  });

  it("rejects a file_path outside .drawio/.xml", async () => {
    const res = (await client.callTool({
      name: "check-sap-diagram",
      arguments: { file_path: "/tmp/whatever.txt" },
    })) as { content: Array<{ type: string; text: string }>; isError?: boolean };
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain(".drawio or .xml");
  });

  it("rejects a relative file_path", async () => {
    const res = (await client.callTool({
      name: "check-sap-diagram",
      arguments: { file_path: "diagram.drawio" },
    })) as { content: Array<{ type: string; text: string }>; isError?: boolean };
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("absolute");
  });

  it("rejects xml and file_path given together", async () => {
    const res = (await client.callTool({
      name: "check-sap-diagram",
      arguments: { xml: SAP_XML, file_path: "/tmp/x.drawio" },
    })) as { content: Array<{ type: string; text: string }>; isError?: boolean };
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("only one of");
  });
});
