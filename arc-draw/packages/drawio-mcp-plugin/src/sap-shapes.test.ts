import { describe, expect, it } from "@jest/globals";

import catalog from "./sap-catalog.json";
import { buildSapShapes, mergeSapShapes, SAP_SHAPES } from "./sap-shapes";

// Expected distribution of the bundled SAP BTP icon set. Update deliberately
// when the catalog is regenerated (tools/build-sap-catalog.cjs).
const EXPECTED_BY_CATEGORY: Record<string, number> = {
  "sap.foundation": 43,
  "sap.integration_suite": 15,
  "sap.app_dev_and_automation": 17,
  "sap.data_and_analytics": 8,
  "sap.btp_saas": 17,
  "sap.ai": 11,
};

describe("SAP shape catalog", () => {
  it("exposes 111 shapes keyed sap.<slug>", () => {
    const keys = Object.keys(SAP_SHAPES);
    expect(keys).toHaveLength(111);
    for (const k of keys) expect(k).toMatch(/^sap\.[a-z0-9_]+$/);
  });

  it("keeps the expected per-category distribution", () => {
    const byCat: Record<string, number> = {};
    for (const s of Object.values(SAP_SHAPES)) {
      byCat[s.category] = (byCat[s.category] ?? 0) + 1;
    }
    expect(byCat).toEqual(EXPECTED_BY_CATEGORY);
  });

  it("resolves the icons the constitution and README rely on", () => {
    for (const id of [
      "sap.cloud_integration",
      "sap.sap_build",
      "sap.api_management",
      "sap.sap_ai_core",
      "sap.sap_btp_cloud_foundry_runtime",
    ]) {
      expect(SAP_SHAPES[id]).toBeDefined();
    }
  });

  it("every shape carries an embedded image style", () => {
    for (const [k, s] of Object.entries(SAP_SHAPES)) {
      expect(s.style).toContain("shape=image");
      expect(s.style).toMatch(/image=data:image\//);
      expect(s.name.length).toBeGreaterThan(0);
      expect(k).toBeTruthy();
    }
  });

  it("buildSapShapes matches the raw catalog one-to-one", () => {
    const rebuilt = buildSapShapes(catalog);
    expect(Object.keys(rebuilt)).toHaveLength(catalog.length);
    expect(rebuilt).toEqual(SAP_SHAPES);
  });

  it("mergeSapShapes adds SAP shapes without dropping existing entries", () => {
    const target = new Map([
      ["mxgraph.aws4.lambda", { style: "x", category: "aws", name: "Lambda" }],
    ]);
    const out = mergeSapShapes(target);
    expect(out.get("mxgraph.aws4.lambda")?.name).toBe("Lambda");
    expect(out.size).toBe(1 + 111);
  });
});
