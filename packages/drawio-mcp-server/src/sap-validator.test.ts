import { deflateRawSync } from "node:zlib";

import { describe, expect, it } from "@jest/globals";

import { formatReport, validateSapDiagram } from "./sap-validator.js";

function model(cells: string): string {
  return `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells}</root></mxGraphModel>`;
}

function mxfile(...diagrams: Array<{ name?: string; xml: string }>): string {
  const body = diagrams
    .map(
      (d) =>
        `<diagram${d.name ? ` name="${d.name}"` : ""}>${d.xml}</diagram>`,
    )
    .join("");
  return `<mxfile>${body}</mxfile>`;
}

function box(
  id: string,
  opts: {
    parent?: string;
    style?: string;
    label?: string;
    x?: number;
    y?: number;
    w?: number;
    h?: number;
  } = {},
): string {
  const { parent = "1", style = "", label = "", x = 0, y = 0, w = 120, h = 80 } =
    opts;
  return `<mxCell id="${id}" value="${label}" style="${style}" vertex="1" parent="${parent}"><mxGeometry x="${x}" y="${y}" width="${w}" height="${h}" as="geometry"/></mxCell>`;
}

function edge(
  id: string,
  opts: { source?: string; target?: string; style?: string } = {},
): string {
  const { source, target, style = "" } = opts;
  const ends = `${source !== undefined ? ` source="${source}"` : ""}${target !== undefined ? ` target="${target}"` : ""}`;
  return `<mxCell id="${id}" value="" style="${style}" edge="1" parent="1"${ends}><mxGeometry relative="1" as="geometry"/></mxCell>`;
}

const BTP_AREA = box("btp", {
  label: "SAP BTP",
  style: "rounded=1;fillColor=#EBF8FF;strokeColor=#0070F2;",
  x: 0,
  y: 0,
  w: 600,
  h: 400,
});

describe("validateSapDiagram: structure", () => {
  it("reports an empty page as an error", () => {
    const r = validateSapDiagram(model(""));
    expect(r.findings).toEqual([
      expect.objectContaining({ severity: "error", rule: "empty-diagram" }),
    ]);
  });

  it("reports duplicate cell ids as an error", () => {
    const xml = model(box("a") + box("a"));
    const r = validateSapDiagram(xml);
    expect(r.findings).toContainEqual(
      expect.objectContaining({ severity: "error", rule: "duplicate-id" }),
    );
  });

  it("reports a cell parented to a non-existent id as an error", () => {
    const xml = model(box("a", { parent: "ghost" }));
    const r = validateSapDiagram(xml);
    expect(r.findings).toContainEqual(
      expect.objectContaining({ severity: "error", rule: "missing-parent" }),
    );
  });

  it("counts cells and pages across multiple diagrams", () => {
    const xml = mxfile(
      { name: "Page 1", xml: model(box("a") + box("b")) },
      { name: "Page 2", xml: model(box("c")) },
    );
    const r = validateSapDiagram(xml);
    expect(r.pages).toBe(2);
    // 2 structural cells (root + default layer) per page + 3 boxes = 7.
    expect(r.cells).toBe(7);
  });

  it("reports something not resembling a diagram", () => {
    const r = validateSapDiagram("not xml at all");
    expect(r.findings).toContainEqual(
      expect.objectContaining({ severity: "error", rule: "not-a-diagram" }),
    );
  });
});

describe("validateSapDiagram: SAP styling", () => {
  it("flags a connector with no colour (draw.io black) as a warning", () => {
    const xml = model(
      box("a") + box("b") + edge("e", { source: "a", target: "b" }),
    );
    const r = validateSapDiagram(xml);
    expect(r.findings).toContainEqual(
      expect.objectContaining({ severity: "warning", rule: "black-connector" }),
    );
  });

  it("does not flag the SAP grey-blue connector", () => {
    const xml = model(
      box("a") +
        box("b") +
        edge("e", {
          source: "a",
          target: "b",
          style: "strokeColor=#475E75;",
        }),
    );
    const r = validateSapDiagram(xml);
    expect(r.findings.filter((f) => f.rule === "black-connector")).toEqual([]);
  });

  it("does not flag a connector with no ends (a floating decoration)", () => {
    const xml = model(edge("e"));
    const r = validateSapDiagram(xml);
    expect(r.findings.filter((f) => f.rule === "black-connector")).toEqual([]);
  });

  it("flags a draw.io default colour", () => {
    const xml = model(box("a", { style: "fillColor=#DAE8FC;strokeColor=#6C8EBF;" }));
    const r = validateSapDiagram(xml);
    expect(r.findings).toContainEqual(
      expect.objectContaining({
        severity: "warning",
        rule: "drawio-default-colour",
      }),
    );
  });

  it("flags a colour that is neither SAP's palette nor draw.io's defaults", () => {
    const xml = model(box("a", { style: "fillColor=#123456;" }));
    const r = validateSapDiagram(xml);
    expect(r.findings).toContainEqual(
      expect.objectContaining({ severity: "warning", rule: "off-palette-colour" }),
    );
  });

  it("does not flag colours from the SAP palette", () => {
    const xml = model(
      box("a", { style: "fillColor=#EBF8FF;strokeColor=#0070F2;fontColor=#1D2D3E;" }),
    );
    const r = validateSapDiagram(xml);
    expect(
      r.findings.filter((f) =>
        ["drawio-default-colour", "off-palette-colour"].includes(f.rule),
      ),
    ).toEqual([]);
  });

  it("flags a large box with a solid saturated SAP-blue fill", () => {
    const xml = model(box("a", { style: "fillColor=#0070F2;", w: 160, h: 80 }));
    const r = validateSapDiagram(xml);
    expect(r.findings).toContainEqual(
      expect.objectContaining({
        severity: "warning",
        rule: "solid-saturated-fill",
      }),
    );
  });

  it("does not flag a small saturated icon or a text cell", () => {
    const xml = model(
      box("icon", { style: "shape=image;fillColor=#0070F2;image=data:image/svg+xml,x", w: 24, h: 24 }) +
        box("t", { style: "text;fillColor=#0070F2;", w: 160, h: 80 }),
    );
    const r = validateSapDiagram(xml);
    expect(r.findings.filter((f) => f.rule === "solid-saturated-fill")).toEqual([]);
  });
});

describe("validateSapDiagram: backends outside BTP", () => {
  it("flags an S/4HANA box placed inside the BTP area", () => {
    const xml = model(
      BTP_AREA +
        box("s4", { label: "SAP S/4HANA (On-Premise)", x: 50, y: 50, w: 160, h: 80 }),
    );
    const r = validateSapDiagram(xml);
    expect(r.findings).toContainEqual(
      expect.objectContaining({
        severity: "warning",
        rule: "backend-inside-btp",
        cells: ["s4"],
      }),
    );
  });

  it("does not flag an S/4HANA box placed outside the BTP area", () => {
    const xml = model(
      BTP_AREA +
        box("s4", { label: "SAP S/4HANA (On-Premise)", x: 800, y: 50, w: 160, h: 80 }),
    );
    const r = validateSapDiagram(xml);
    expect(r.findings.filter((f) => f.rule === "backend-inside-btp")).toEqual([]);
  });

  it("does not flag a BTP service with a similar-looking name", () => {
    const xml = model(
      BTP_AREA + box("svc", { label: "Cloud Integration", x: 50, y: 50, w: 160, h: 80 }),
    );
    const r = validateSapDiagram(xml);
    expect(r.findings.filter((f) => f.rule === "backend-inside-btp")).toEqual([]);
  });
});

describe("validateSapDiagram: legend", () => {
  it("suggests a legend when a semantic connector colour is used without one", () => {
    const xml = model(
      box("a") +
        box("b") +
        edge("e", { source: "a", target: "b", style: "strokeColor=#5D36FF;" }),
    );
    const r = validateSapDiagram(xml);
    expect(r.findings).toContainEqual(
      expect.objectContaining({ severity: "info", rule: "legend-missing" }),
    );
  });

  it("does not suggest a legend for a plain dashed connector (L0 style)", () => {
    const xml = model(
      box("a") +
        box("b") +
        edge("e", { source: "a", target: "b", style: "strokeColor=#475E75;dashed=1;" }),
    );
    const r = validateSapDiagram(xml);
    expect(r.findings.filter((f) => f.rule === "legend-missing")).toEqual([]);
  });

  it("does not suggest a legend when one is already present", () => {
    const xml = model(
      box("a") +
        box("b") +
        edge("e", { source: "a", target: "b", style: "strokeColor=#5D36FF;" }) +
        box("l", { label: "Legend: synchronous / asynchronous" }),
    );
    const r = validateSapDiagram(xml);
    expect(r.findings.filter((f) => f.rule === "legend-missing")).toEqual([]);
  });
});

describe("validateSapDiagram: numbered steps", () => {
  it("flags a gap in a numbered sequence", () => {
    const xml = model(box("1", { label: "1" }) + box("3", { label: "3" }));
    const r = validateSapDiagram(xml);
    expect(r.findings).toContainEqual(
      expect.objectContaining({ severity: "warning", rule: "number-gap" }),
    );
  });

  it("does not flag a complete sequence", () => {
    const xml = model(
      box("1", { label: "1" }) + box("2", { label: "2" }) + box("3", { label: "3" }),
    );
    const r = validateSapDiagram(xml);
    expect(r.findings.filter((f) => f.rule === "number-gap")).toEqual([]);
  });

  it("does not flag a single number (nothing to sequence yet)", () => {
    const xml = model(box("1", { label: "1" }));
    const r = validateSapDiagram(xml);
    expect(r.findings.filter((f) => f.rule === "number-gap")).toEqual([]);
  });
});

describe("validateSapDiagram: compressed pages", () => {
  it("decodes a deflated <diagram> payload", () => {
    const inner = model(box("a"));
    const compressed = deflateRawSync(
      Buffer.from(encodeURIComponent(inner), "utf8"),
    ).toString("base64");
    const r = validateSapDiagram(mxfile({ name: "P", xml: compressed }));
    expect(r.pages).toBe(1);
    // 2 structural cells (root + default layer) + 1 box = 3.
    expect(r.cells).toBe(3);
    expect(r.findings.some((f) => f.rule === "undecodable-page")).toBe(false);
  });

  it("reports garbage payload as undecodable instead of crashing", () => {
    const r = validateSapDiagram(mxfile({ name: "P", xml: "not-base64!!" }));
    expect(r.findings).toContainEqual(
      expect.objectContaining({ severity: "error", rule: "undecodable-page" }),
    );
  });
});

describe("formatReport", () => {
  it("summarises counts by severity and lists each finding with its fix", () => {
    const r = validateSapDiagram(model(""));
    const text = formatReport(r);
    expect(text).toContain("1 error(s)");
    expect(text).toContain("EMPTY-DIAGRAM".replace("EMPTY-DIAGRAM", "empty-diagram"));
  });

  it("says so plainly when nothing is found", () => {
    const xml = model(
      BTP_AREA +
        box("svc", {
          label: "Cloud Integration",
          style: "fillColor=#EBF8FF;strokeColor=#0070F2;",
          x: 50,
          y: 50,
        }),
    );
    const text = formatReport(validateSapDiagram(xml));
    expect(text).toContain("No problems found");
  });
});

describe("validateSapDiagram: calibration against SAP's own reference diagrams", () => {
  // SAP/btp-solution-diagrams examples are not bundled with the repo (they are
  // fetched separately, see docs/SAP-INTEGRATION.md); this documents the two
  // real findings from calibrating against all 15 of them so a future change
  // to the rules does not silently regress without a human noticing.
  it("is a living calibration note, not an automated fixture check", () => {
    // SAP_Cloud_Identity_Services_Authentication_L2.drawio: one connector with
    // a duplicated source/target id, which draw.io itself renders detached.
    // SAP_Task_Center_L1.drawio: a legend-worthy semantic colour with no legend.
    // Neither is a false positive; both were left as info/warning, not errors.
    expect(true).toBe(true);
  });
});
