import { afterEach, describe, expect, it } from "@jest/globals";

import {
  extractShapesFromSidebar,
  parseSingleCellTemplate,
} from "./shape-extractor";

// Minimal stand-in for drawio's Sidebar: each vendor adder calls
// addPaletteFunctions with entries built by createVertexTemplateEntry,
// mirroring js/diagramly/sidebar/Sidebar-*.js.
function installFakeSidebar(adders: Record<string, (this: any) => void>) {
  function Sidebar() {}
  Object.assign(Sidebar.prototype, adders, {
    getTagsForStencil: () => [],
    // Same shape as grapheditor/Sidebar.js: a data entry defers to
    // createVertexTemplateFromData when its closure is evaluated.
    addDataEntry(
      this: any,
      tags: string,
      w: number,
      h: number,
      title: string,
      data: string,
    ) {
      return this.addEntry(tags, () =>
        this.createVertexTemplateFromData(data, w, h, title),
      );
    },
  });
  (globalThis as any).window = { Sidebar };
  return { sidebar: {} };
}

const SAP_ST =
  "shape=mxgraph.sap.icon;labelPosition=center;verticalLabelPosition=bottom;aspect=fixed;SAPIcon=";

// draw.io compresses templates and decodes them with Graph.decompress. That is
// draw.io's own code, so the tests treat it as a black box: the "compressed"
// data here is the XML itself and decompress is the identity. Decoding the real
// compressed data was checked separately against draw.io's Sidebar-SAP.js.
const pack = (xml: string): string => xml;

function installGraphDecompress() {
  (globalThis as any).window.Graph = { decompress: (d: string) => d };
}

const wrap = (cells: string) =>
  `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells}</root></mxGraphModel>`;

const VERTEX = (style: string, w = 24, h = 24) =>
  wrap(
    `<mxCell id="2" value="" style="${style}" vertex="1" parent="1"><mxGeometry width="${w}" height="${h}" as="geometry"/></mxCell>`,
  );

const EDGE = (style: string) =>
  wrap(
    `<mxCell id="2" value="" style="${style}" edge="1" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>`,
  );

afterEach(() => {
  delete (globalThis as any).window;
});

describe("extractShapesFromSidebar — SAP native palette", () => {
  it("keys each SAP icon by SAPIcon instead of collapsing on mxgraph.sap.icon", () => {
    const ui = installFakeSidebar({
      addSAPPalette(this: any) {
        this.setCurrentSearchEntryLibrary("sap", "sapFoundations");
        this.addPaletteFunctions("sapFoundations", "SAP / Foundational", false, [
          this.createVertexTemplateEntry(SAP_ST + "SAP_Audit_Log_Service", 50, 50, "", "SAP Audit Log Service"),
          this.createVertexTemplateEntry(SAP_ST + "SAP_BTP,_Cloud_Foundry_runtime", 50, 50, "", "SAP BTP, Cloud Foundry Runtime"),
        ]);
        this.setCurrentSearchEntryLibrary("sap", "sapIntegration Suite");
        this.addPaletteFunctions("sapIntegration Suite", "SAP / Integration Suite", false, [
          this.createVertexTemplateEntry(SAP_ST + "Cloud_Integration", 50, 50, "", "Cloud Integration"),
        ]);
      },
    });

    const map = extractShapesFromSidebar(ui);

    expect(map.has("mxgraph.sap.icon")).toBe(false);
    expect(map.get("mxgraph.sap.sap_audit_log_service")?.name).toBe("SAP Audit Log Service");
    expect(map.get("mxgraph.sap.sap_btp_cloud_foundry_runtime")?.name).toBe(
      "SAP BTP, Cloud Foundry Runtime",
    );
    expect(map.get("mxgraph.sap.cloud_integration")?.category).toBe(
      "mxgraph.sap.integration_suite",
    );
    expect(map.get("mxgraph.sap.sap_audit_log_service")?.category).toBe(
      "mxgraph.sap.foundations",
    );
  });

  it("skips gracefully when the drawio build has no SAP palette", () => {
    const ui = installFakeSidebar({});
    expect(() => extractShapesFromSidebar(ui)).not.toThrow();
    expect(extractShapesFromSidebar(ui).size).toBe(0);
  });
});

describe("parseSingleCellTemplate", () => {
  it("reads style and size of a single vertex", () => {
    expect(parseSingleCellTemplate(VERTEX("shape=image;aspect=fixed;", 24, 24))).toEqual({
      style: "shape=image;aspect=fixed;",
      width: 24,
      height: 24,
    });
  });

  it("accepts a single edge (a connector) and unescapes the style", () => {
    const r = parseSingleCellTemplate(EDGE("endArrow=blockThin;a=&amp;b;"));
    expect(r?.style).toBe("endArrow=blockThin;a=&b;");
    expect(r?.width).toBe(0);
  });

  it("rejects groups of several cells and empty templates", () => {
    const two = wrap(
      '<mxCell id="2" style="a" vertex="1" parent="1"><mxGeometry width="1" height="1" as="geometry"/></mxCell><mxCell id="3" style="b" vertex="1" parent="1"><mxGeometry width="1" height="1" as="geometry"/></mxCell>',
    );
    expect(parseSingleCellTemplate(two)).toBeNull();
    expect(parseSingleCellTemplate(wrap(""))).toBeNull();
  });
});

describe("extractShapesFromSidebar: SAP data entries", () => {
  function sapWith(entries: (self: any) => any[]) {
    return installFakeSidebar({
      addSAPPalette(this: any) {
        this.setCurrentSearchEntryLibrary("sap", "sapGeneric Icons");
        this.addPaletteFunctions("sapGeneric Icons", "SAP / Generic Icons", false, entries(this));
        this.setCurrentSearchEntryLibrary("sap", "sapDefault Connectors");
        this.addPaletteFunctions("sapDefault Connectors", "SAP / Default Connectors", false, [
          this.addDataEntry("", 120, 0, "Direct one-directional", pack(EDGE("endArrow=blockThin;strokeColor=#475e75;"))),
        ]);
      },
    });
  }

  it("captures titled single-cell templates under the announced section", () => {
    const ui = sapWith((self) => [
      self.addDataEntry("", 24, 24, "Adapter SAP", pack(VERTEX("shape=image;image=data:image/svg+xml,AAAA;"))),
      self.addDataEntry("", 24, 24, "Admin SAP", pack(VERTEX("shape=image;image=data:image/svg+xml,BBBB;"))),
    ]);
    installGraphDecompress();

    const map = extractShapesFromSidebar(ui);

    expect(map.get("mxgraph.sap.generic_icons.adapter_sap")?.category).toBe(
      "mxgraph.sap.generic_icons",
    );
    expect(map.get("mxgraph.sap.generic_icons.admin_sap")?.style).toContain("BBBB");
    expect(map.get("mxgraph.sap.default_connectors.direct_one_directional")?.style).toContain(
      "strokeColor=#475e75",
    );
  });

  it("skips untitled entries, multi-cell groups and duplicated titles", () => {
    const group = wrap(
      '<mxCell id="2" style="a" vertex="1" parent="1"><mxGeometry width="1" height="1" as="geometry"/></mxCell><mxCell id="3" style="b" vertex="1" parent="1"><mxGeometry width="1" height="1" as="geometry"/></mxCell>',
    );
    const ui = sapWith((self) => [
      self.addDataEntry("", 24, 24, "", pack(VERTEX("untitled;"))),
      self.addDataEntry("", 24, 24, "Group", pack(group)),
      self.addDataEntry("", 24, 24, "Error", pack(VERTEX("red;"))),
      self.addDataEntry("", 24, 24, "Error", pack(VERTEX("green;"))),
      self.addDataEntry("", 24, 24, "Unique", pack(VERTEX("ok;"))),
    ]);
    installGraphDecompress();

    const keys = [...extractShapesFromSidebar(ui).keys()].filter((k) =>
      k.startsWith("mxgraph.sap.generic_icons."),
    );

    expect(keys).toEqual(["mxgraph.sap.generic_icons.unique"]);
  });

  it("does not crash when Graph.decompress is unavailable", () => {
    const ui = sapWith((self) => [
      self.addDataEntry("", 24, 24, "Adapter SAP", pack(VERTEX("x;"))),
    ]);

    expect(() => extractShapesFromSidebar(ui)).not.toThrow();
  });

  it("keeps extracting the other SAP sub-palettes when one throws", () => {
    const ui = installFakeSidebar({
      addSAPBrokenPalette(this: any) {
        throw new Error("boom");
      },
      addSAPWorkingPalette(this: any) {
        this.addPaletteFunctions("x", "SAP / Working", false, [
          this.createVertexTemplateEntry(
            "shape=mxgraph.sap.icon;SAPIcon=Cloud_Integration",
            50,
            50,
            "",
            "Cloud Integration",
          ),
        ]);
      },
      addSAPPalette(this: any) {
        this.addSAPBrokenPalette();
        this.addSAPWorkingPalette();
      },
    });

    const map = extractShapesFromSidebar(ui);

    expect(map.has("mxgraph.sap.cloud_integration")).toBe(true);
  });
});
