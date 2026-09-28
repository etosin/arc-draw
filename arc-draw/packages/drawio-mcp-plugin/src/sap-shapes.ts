// SAP BTP shape catalog for the draw.io plugin.
//
// Source of truth: ./sap-catalog.json (regenerate with
//   node tools/build-sap-catalog.cjs sap-all-M.xml sap-ai-M.xml   — pass ALL libraries).
// This module only derives the runtime map from it, so the icon data exists once
// in the repo. esbuild inlines the JSON into the plugin bundle at build time.

import catalog from "./sap-catalog.json";

export type SapShape = { style: string; category: string; name: string };

type CatalogEntry = {
  name: string;
  internal?: string;
  category?: string;
  w?: number;
  h?: number;
  style: string;
};

export function sapSlug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

/** Build the keyed runtime map: sap.<slug(name)> -> { style, category, name }. */
export function buildSapShapes(
  entries: readonly CatalogEntry[],
): Record<string, SapShape> {
  const map: Record<string, SapShape> = {};
  for (const e of entries) {
    map[`sap.${sapSlug(e.name)}`] = {
      style: e.style,
      category: `sap.${sapSlug(e.category || "misc")}`,
      name: e.name,
    };
  }
  return map;
}

export const SAP_SHAPES: Record<string, SapShape> = buildSapShapes(
  catalog as CatalogEntry[],
);

/** Merge SAP shapes into an existing runtime catalog map (mutates and returns it). */
export function mergeSapShapes(
  target: Map<string, { style: string; category: string; name: string }>,
): Map<string, { style: string; category: string; name: string }> {
  for (const [k, v] of Object.entries(SAP_SHAPES)) target.set(k, v);
  return target;
}
