import { afterEach, describe, expect, it } from "@jest/globals";

import { extractShapesFromSidebar } from "./shape-extractor";

// Minimal stand-in for drawio's Sidebar: each vendor adder calls
// addPaletteFunctions with entries built by createVertexTemplateEntry,
// mirroring js/diagramly/sidebar/Sidebar-*.js.
function installFakeSidebar(adders: Record<string, (this: any) => void>) {
  function Sidebar() {}
  Object.assign(Sidebar.prototype, adders, {
    getTagsForStencil: () => [],
  });
  (globalThis as any).window = { Sidebar };
  return { sidebar: {} };
}

const SAP_ST =
  "shape=mxgraph.sap.icon;labelPosition=center;verticalLabelPosition=bottom;aspect=fixed;SAPIcon=";

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
