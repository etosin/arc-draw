import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";

import {
  add_cell_of_shape,
  get_shape_by_name,
} from "./drawio-tools";
import { setRuntimeCatalog, suggestShapeIds } from "./shape-library";

const CATALOG = new Map([
  [
    "mxgraph.sap.generic_icons.adapter_highlight",
    {
      style: "shape=image;image=data:image/svg+xml,x;",
      category: "mxgraph.sap.generic_icons",
      name: "Adapter Highlight",
    },
  ],
  [
    "sap.cloud_integration",
    {
      style: "shape=image;image=data:image/svg+xml,y;",
      category: "sap.integration_suite",
      name: "Cloud Integration",
    },
  ],
]);

beforeEach(() => {
  setRuntimeCatalog(new Map(CATALOG));
});

afterEach(() => {
  setRuntimeCatalog(new Map());
});

describe("suggestShapeIds", () => {
  it("finds the id when given the exact display title", () => {
    expect(suggestShapeIds("Adapter Highlight")).toContain(
      "mxgraph.sap.generic_icons.adapter_highlight",
    );
  });

  it("finds the id when given the last dotted segment", () => {
    expect(suggestShapeIds("cloud_integration")).toContain(
      "sap.cloud_integration",
    );
  });

  it("is case- and separator-insensitive", () => {
    expect(suggestShapeIds("adapter-HIGHLIGHT")).toContain(
      "mxgraph.sap.generic_icons.adapter_highlight",
    );
  });

  it("returns nothing for an empty or unrelated name", () => {
    expect(suggestShapeIds("")).toEqual([]);
    expect(suggestShapeIds("totally_unrelated_xyz")).toEqual([]);
  });
});

describe("get_shape_by_name: not found", () => {
  it("reports found:false with a suggestion instead of a bare null", () => {
    const result = get_shape_by_name(null, { shape_name: "Adapter Highlight" });
    expect(result).toMatchObject({
      found: false,
      shape_name: "Adapter Highlight",
    });
    expect(result.suggestions).toContain(
      "mxgraph.sap.generic_icons.adapter_highlight",
    );
    expect(result.message).toContain(
      "mxgraph.sap.generic_icons.adapter_highlight",
    );
  });

  it("still resolves a shape that exists by its exact id", () => {
    const result = get_shape_by_name(null, {
      shape_name: "mxgraph.sap.generic_icons.adapter_highlight",
    });
    expect(result.id).toBe("mxgraph.sap.generic_icons.adapter_highlight");
    expect(result.style).toContain("shape=image");
  });
});

describe("add_cell_of_shape: not found", () => {
  function fakeUi() {
    return { editor: { graph: { getDefaultParent: () => "default" } } };
  }

  it("throws (does not silently no-op) for an unknown shape_name", () => {
    expect(() =>
      add_cell_of_shape(fakeUi(), { shape_name: "Adapter Highlight" }),
    ).toThrow(/No shape named "Adapter Highlight"/);
  });

  it("suggests the exact id in the error message", () => {
    expect(() =>
      add_cell_of_shape(fakeUi(), { shape_name: "Adapter Highlight" }),
    ).toThrow(/mxgraph\.sap\.generic_icons\.adapter_highlight/);
  });

  it("throws for a completely unrelated name too, without a suggestion list", () => {
    expect(() =>
      add_cell_of_shape(fakeUi(), { shape_name: "totally_unrelated_xyz" }),
    ).toThrow(/No shape named "totally_unrelated_xyz"/);
  });
});
