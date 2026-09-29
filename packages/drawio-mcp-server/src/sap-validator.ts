/**
 * Checks a draw.io diagram against the SAP BTP Solution Diagram rules that the
 * ARC-DRAW constitution teaches the agent (constitution/sap-btp-diagram.md).
 *
 * Pure functions, no I/O: the `check-sap-diagram` tool feeds it XML from the
 * live canvas, a file or a string.
 *
 * Structural problems are *errors*, SAP-style problems are *warnings*, and
 * rules that SAP's own examples do not always follow are *info* suggestions.
 * A rule must not fire on SAP's own reference diagrams; that is how the rules
 * were calibrated (and why there is, for example, no rule about titles).
 */
import { inflateRawSync } from "node:zlib";

export type Severity = "error" | "warning" | "info";

export type Finding = {
  severity: Severity;
  rule: string;
  message: string;
  /** Page name, when the file has several pages. */
  page?: string;
  /** Ids of the cells involved (at most a few). */
  cells?: string[];
  hint?: string;
};

export type Report = {
  pages: number;
  cells: number;
  findings: Finding[];
};

type Geometry = { x: number; y: number; width: number; height: number };

type Cell = {
  id: string;
  label: string;
  styleRaw: string;
  style: Map<string, string>;
  flags: Set<string>;
  vertex: boolean;
  edge: boolean;
  parent?: string;
  source?: string;
  target?: string;
  geometry?: Geometry;
};

/** Colours in the constitution (section 1). */
const CONSTITUTION_COLOURS = [
  "#0070F2", "#EBF8FF", "#475E75", "#F5F6F7", "#1D2D3E", "#556B82",
  "#188918", "#F5FAE5", "#C35500", "#FFF8D6", "#D20A0A", "#FFEAF4",
  "#07838F", "#DAFDF5", "#5D36FF", "#F1ECFF", "#CC00DC", "#FFF0FA",
  "#FFFFFF",
];

/**
 * Colours that appear in SAP's own reference diagrams and templates
 * (SAP/btp-solution-diagrams, Apache-2.0) but are not in section 1: near
 * duplicates such as #475E74, dark text shades, and the tints of the numbered
 * markers and legends. Without them, SAP's own diagrams would be flagged.
 */
const SAP_TEMPLATE_COLOURS = [
  "#002A86", "#1A2733", "#266F3A", "#354A5F", "#4628EC", "#470BED",
  "#475E74", "#475F75", "#595959", "#5B738B", "#7F00FF", "#C5761C",
  "#C87515", "#D5DADD", "#D79B00", "#EAECEE", "#EAF8FF", "#ECF8FF",
  "#EDEFF0", "#EDF8FF", "#FCFCFC", "#FFE6CC",
];

const ALLOWED_COLOURS = new Set(
  [...CONSTITUTION_COLOURS, ...SAP_TEMPLATE_COLOURS].map((c) =>
    c.toUpperCase(),
  ),
);

/** draw.io's default palette: its presence means SAP styling was not applied. */
const DRAWIO_DEFAULT_COLOURS = new Set([
  "#DAE8FC", "#6C8EBF", "#D5E8D4", "#82B366", "#FFF2CC", "#D6B656",
  "#F8CECC", "#B85450", "#E1D5E7", "#9673A6",
]);

/** Solid, saturated fills that the constitution forbids for boxes and areas. */
const SATURATED_FILLS = new Set([
  "#0070F2", "#0A6ED1", "#0854A0", "#1E5AA8", "#002A86",
]);

const SEMANTIC_LINE_COLOURS = new Set(["#CC00DC", "#188918", "#5D36FF"]);

const COLOUR_KEYS = [
  "fillColor",
  "strokeColor",
  "fontColor",
  "gradientColor",
  "labelBackgroundColor",
  "labelBorderColor",
];

// ---------------------------------------------------------------- parsing

function unescapeXml(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&#xa;|&#10;/gi, "\n")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function parseAttrs(tag: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of tag.matchAll(/([\w:.-]+)="([^"]*)"/g)) {
    const name = m[1];
    const value = m[2];
    if (name !== undefined && value !== undefined) {
      out.set(name, unescapeXml(value));
    }
  }
  return out;
}

function parseStyle(raw: string): {
  style: Map<string, string>;
  flags: Set<string>;
} {
  const style = new Map<string, string>();
  const flags = new Set<string>();
  for (const part of raw.split(";")) {
    const piece = part.trim();
    if (!piece) continue;
    const eq = piece.indexOf("=");
    if (eq < 0) flags.add(piece);
    else style.set(piece.slice(0, eq), piece.slice(eq + 1));
  }
  return { style, flags };
}

function stripHtml(label: string): string {
  return unescapeXml(label.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]*>/g, ""))
    .replace(/\s+/g, " ")
    .trim();
}

function decodeCompressed(payload: string): string {
  const inflated = inflateRawSync(Buffer.from(payload, "base64")).toString(
    "utf8",
  );
  return decodeURIComponent(inflated);
}

type Model = { name?: string; xml: string };

function extractModels(xml: string, findings: Finding[]): Model[] {
  const models: Model[] = [];
  let foundDiagram = false;
  for (const m of xml.matchAll(/<diagram\b([^>]*)>([\s\S]*?)<\/diagram>/g)) {
    foundDiagram = true;
    const name = parseAttrs(m[1] ?? "").get("name");
    const inner = (m[2] ?? "").trim();
    if (inner.startsWith("<")) {
      models.push({ name, xml: inner });
    } else if (inner) {
      try {
        models.push({ name, xml: decodeCompressed(inner) });
      } catch {
        findings.push({
          severity: "error",
          rule: "undecodable-page",
          page: name,
          message: "The page content is compressed and could not be decoded.",
        });
      }
    }
  }
  if (!foundDiagram) {
    for (const m of xml.matchAll(/<mxGraphModel\b[\s\S]*?<\/mxGraphModel>/g)) {
      models.push({ xml: m[0] });
    }
  }
  return models;
}

function parseCells(modelXml: string): Cell[] {
  const cells: Cell[] = [];
  let wrapper: Map<string, string> | null = null;
  let current: Cell | null = null;

  const tokens = modelXml.matchAll(
    /<(\/?)(object|UserObject|mxCell|mxGeometry)\b([^>]*?)(\/?)>/g,
  );
  for (const t of tokens) {
    const closing = t[1] === "/";
    const name = t[2];
    const attrText = t[3] ?? "";
    const selfClosing = t[4] === "/";

    if (name === "object" || name === "UserObject") {
      wrapper = closing ? null : parseAttrs(attrText);
      continue;
    }

    if (name === "mxCell") {
      if (closing) {
        if (current) cells.push(current);
        current = null;
        continue;
      }
      const a = parseAttrs(attrText);
      const styleRaw = a.get("style") ?? "";
      const { style, flags } = parseStyle(styleRaw);
      const id = wrapper?.get("id") ?? a.get("id") ?? "";
      const cell: Cell = {
        id,
        label: stripHtml(wrapper?.get("label") ?? a.get("value") ?? ""),
        styleRaw,
        style,
        flags,
        vertex: a.get("vertex") === "1",
        edge: a.get("edge") === "1",
        parent: a.get("parent"),
        source: a.get("source"),
        target: a.get("target"),
      };
      if (selfClosing) cells.push(cell);
      else current = cell;
      continue;
    }

    if (name === "mxGeometry" && current && !closing) {
      const a = parseAttrs(attrText);
      if ((a.get("as") ?? "geometry") === "geometry") {
        current.geometry = {
          x: Number(a.get("x") ?? 0) || 0,
          y: Number(a.get("y") ?? 0) || 0,
          width: Number(a.get("width") ?? 0) || 0,
          height: Number(a.get("height") ?? 0) || 0,
        };
      }
    }
  }
  return cells;
}

// --------------------------------------------------------------- geometry

type Box = { x: number; y: number; width: number; height: number };

function makeAbsoluteBox(byId: Map<string, Cell>) {
  const cache = new Map<string, Box | null>();
  const resolve = (cell: Cell, depth = 0): Box | null => {
    if (cache.has(cell.id)) return cache.get(cell.id) ?? null;
    if (!cell.geometry || depth > 50) return null;
    let { x, y } = cell.geometry;
    const parent = cell.parent ? byId.get(cell.parent) : undefined;
    if (parent?.vertex) {
      const p = resolve(parent, depth + 1);
      if (p) {
        x += p.x;
        y += p.y;
      }
    }
    const box = { x, y, width: cell.geometry.width, height: cell.geometry.height };
    cache.set(cell.id, box);
    return box;
  };
  return resolve;
}

function centre(b: Box): { x: number; y: number } {
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

function contains(outer: Box, point: { x: number; y: number }): boolean {
  return (
    point.x >= outer.x &&
    point.x <= outer.x + outer.width &&
    point.y >= outer.y &&
    point.y <= outer.y + outer.height
  );
}

// ----------------------------------------------------------------- rules

function isImage(c: Cell): boolean {
  return (
    c.style.get("shape") === "image" ||
    c.styleRaw.includes("image=data:image") ||
    c.styleRaw.includes("SAPIcon=") ||
    c.styleRaw.includes("shape=mxgraph.sap.icon")
  );
}

function isText(c: Cell): boolean {
  return c.flags.has("text") || c.style.get("shape") === "text";
}

function hex(v: string | undefined): string | null {
  return v && /^#[0-9a-fA-F]{6}$/.test(v) ? v.toUpperCase() : null;
}

function firstIds(cells: Cell[], n = 4): string[] {
  return cells.slice(0, n).map((c) => c.id);
}

function checkPage(cells: Cell[], page: string | undefined): Finding[] {
  const findings: Finding[] = [];
  const add = (f: Omit<Finding, "page">) => findings.push({ ...f, page });

  const byId = new Map<string, Cell>();
  const seen = new Set<string>();
  const duplicated = new Set<string>();
  for (const c of cells) {
    if (seen.has(c.id)) duplicated.add(c.id);
    seen.add(c.id);
    byId.set(c.id, c);
  }
  const vertices = cells.filter((c) => c.vertex);
  const edges = cells.filter((c) => c.edge);

  // ---- structure (errors)
  if (vertices.length + edges.length === 0) {
    add({
      severity: "error",
      rule: "empty-diagram",
      message: "The page has no shapes or connectors.",
    });
    return findings;
  }
  if (duplicated.size > 0) {
    add({
      severity: "error",
      rule: "duplicate-id",
      message: `Cell ids used more than once: ${[...duplicated].slice(0, 5).join(", ")}.`,
      cells: [...duplicated].slice(0, 5),
    });
  }
  const dangling = cells.filter(
    (c) => c.parent !== undefined && c.parent !== "" && !byId.has(c.parent),
  );
  if (dangling.length > 0) {
    add({
      severity: "error",
      rule: "missing-parent",
      message: `${dangling.length} cell(s) point to a parent that does not exist.`,
      cells: firstIds(dangling),
    });
  }
  const brokenEdges = edges.filter(
    (e) =>
      (e.source !== undefined && !byId.has(e.source)) ||
      (e.target !== undefined && !byId.has(e.target)),
  );
  if (brokenEdges.length > 0) {
    add({
      severity: "warning",
      rule: "missing-edge-end",
      message: `${brokenEdges.length} connector(s) start or end at a cell that does not exist, so they render detached.`,
      cells: firstIds(brokenEdges),
    });
  }

  // ---- connectors (constitution section 3)
  const blackEdges = edges.filter((e) => {
    // Loops onto the same cell and connectors with no ends draw nothing; SAP's
    // own files contain a few, so they are not worth a warning.
    if (e.source !== undefined && e.source === e.target) return false;
    if (e.source === undefined && e.target === undefined) return false;
    const stroke = e.style.get("strokeColor");
    return !stroke || stroke === "default" || hex(stroke) === "#000000";
  });
  if (blackEdges.length > 0) {
    add({
      severity: "warning",
      rule: "black-connector",
      message: `${blackEdges.length} connector(s) use the draw.io default black instead of SAP grey-blue.`,
      cells: firstIds(blackEdges),
      hint: "Use strokeColor=#475E75 (section 3), or a semantic colour.",
    });
  }

  // ---- palette (section 1)
  const offPalette = new Map<string, Cell[]>();
  const drawioDefaults = new Map<string, Cell[]>();
  for (const c of cells) {
    for (const key of COLOUR_KEYS) {
      const colour = hex(c.style.get(key));
      if (!colour) continue;
      if (DRAWIO_DEFAULT_COLOURS.has(colour)) {
        drawioDefaults.set(colour, [...(drawioDefaults.get(colour) ?? []), c]);
      } else if (!ALLOWED_COLOURS.has(colour)) {
        offPalette.set(colour, [...(offPalette.get(colour) ?? []), c]);
      }
    }
  }
  for (const [colour, list] of drawioDefaults) {
    add({
      severity: "warning",
      rule: "drawio-default-colour",
      message: `${colour} is a draw.io default colour, so SAP styling was not applied (${list.length} cell(s)).`,
      cells: firstIds(list),
      hint: "Use the SAP palette in section 1 of the constitution.",
    });
  }
  for (const [colour, list] of offPalette) {
    add({
      severity: "warning",
      rule: "off-palette-colour",
      message: `${colour} is not in the SAP palette (${list.length} cell(s)).`,
      cells: firstIds(list),
      hint: "Do not invent palette (section 0, rule 2).",
    });
  }

  // ---- solid saturated fills (section 2)
  const saturated = vertices.filter((c) => {
    const fill = hex(c.style.get("fillColor"));
    if (!fill || !SATURATED_FILLS.has(fill)) return false;
    if (isImage(c) || isText(c)) return false;
    const g = c.geometry;
    return !!g && g.width >= 100 && g.height >= 50;
  });
  if (saturated.length > 0) {
    add({
      severity: "warning",
      rule: "solid-saturated-fill",
      message: `${saturated.length} box(es) use a solid saturated fill.`,
      cells: firstIds(saturated),
      hint: "SAP elements are light fill + blue border: fillColor=#EBF8FF;strokeColor=#0070F2.",
    });
  }

  // ---- fake icon styles (section 6: icons are resolved from the library,
  // never hand-authored). A cell that declares shape=image without a real
  // embedded SVG payload is exactly what an agent produces when it invents a
  // style instead of calling get-shapes-in-category / get-shape-by-name: it
  // renders as a flat coloured box, and — because isImage() below correctly
  // treats "shape=image" as an icon — it would otherwise dodge the
  // solid-saturated-fill check too, hiding the very symptom that gives it away.
  const fakeIcons = vertices.filter((c) => {
    if (c.style.get("shape") !== "image") return false;
    return !/image=data:image\/[a-z0-9+.-]+,/i.test(c.styleRaw);
  });
  if (fakeIcons.length > 0) {
    add({
      severity: "warning",
      rule: "fake-icon-style",
      message: `${fakeIcons.length} cell(s) declare shape=image without an embedded icon (no image=data:... payload) — this looks like an invented style rather than a resolved SAP icon.`,
      cells: firstIds(fakeIcons),
      hint: "Resolve the icon via get-shapes-in-category / get-shape-by-name and use its exact style (section 6); never hand-author shape=image.",
    });
  }

  // ---- backends outside BTP (sections 2a, 6a)
  const abs = makeAbsoluteBox(byId);
  const btpAreas = vertices.filter((c) => {
    const g = c.geometry;
    return (
      /^(SAP BTP|SAP Business Technology Platform)\b/i.test(c.label) &&
      !!g &&
      g.width >= 200 &&
      g.height >= 120
    );
  });
  if (btpAreas.length > 0) {
    const inside: Cell[] = [];
    for (const c of vertices) {
      if (btpAreas.includes(c) || isImage(c) || isText(c)) continue;
      if (!/S\/?4\s?HANA|\bECC\b|on[- ]?prem/i.test(c.label)) continue;
      const box = abs(c);
      if (!box) continue;
      const middle = centre(box);
      if (
        btpAreas.some((a) => {
          const ab = abs(a);
          return !!ab && contains(ab, middle);
        })
      ) {
        inside.push(c);
      }
    }
    if (inside.length > 0) {
      add({
        severity: "warning",
        rule: "backend-inside-btp",
        message: `${inside.length} backend system(s) sit inside the BTP boundary: ${inside
          .slice(0, 3)
          .map((c) => `"${c.label}"`)
          .join(", ")}.`,
        cells: firstIds(inside),
        hint: "S/4HANA, ECC and on-premise systems go outside the BTP area (sections 2a and 6a).",
      });
    }
  }

  // ---- legend (section 7)
  // Only semantic colours and thick lines trigger it: dashed connectors alone
  // appear in SAP's own L0 diagrams, which need no legend. It is a suggestion
  // because SAP's own L1 example uses semantic colours without a legend.
  const usesSemantics = edges.some((e) => {
    const stroke = hex(e.style.get("strokeColor"));
    const width = Number(e.style.get("strokeWidth") ?? 0);
    return (
      (stroke !== null && SEMANTIC_LINE_COLOURS.has(stroke)) || width >= 4
    );
  });
  const hasLegend = cells.some((c) =>
    /\blegend\b|\bsynchronous\b|\basynchronous\b/i.test(c.label),
  );
  if (usesSemantics && !hasLegend) {
    add({
      severity: "info",
      rule: "legend-missing",
      message:
        "Semantic-colour or thick connectors are used, but no legend was found.",
      hint: "List every line style and colour used (section 7). L0 diagrams use neutral connectors and need no legend.",
    });
  }

  // ---- numbered steps (section 4)
  const numbers = new Set<number>();
  for (const c of vertices) {
    if (/^\d{1,2}$/.test(c.label)) numbers.add(Number(c.label));
  }
  if (numbers.size >= 2) {
    const max = Math.max(...numbers);
    const missing: number[] = [];
    for (let n = 1; n <= max; n++) if (!numbers.has(n)) missing.push(n);
    if (missing.length > 0) {
      add({
        severity: "warning",
        rule: "number-gap",
        message: `The numbered steps skip ${missing.slice(0, 5).join(", ")}.`,
        hint: "Number the path 1..n without gaps (section 4).",
      });
    }
  }

  return findings;
}

// ----------------------------------------------------------------- public

export function validateSapDiagram(xml: string): Report {
  const findings: Finding[] = [];
  const models = extractModels(xml, findings);
  if (models.length === 0 && findings.length === 0) {
    findings.push({
      severity: "error",
      rule: "not-a-diagram",
      message: "No draw.io diagram (mxfile or mxGraphModel) found in the input.",
    });
  }

  let cellCount = 0;
  for (const model of models) {
    const cells = parseCells(model.xml);
    cellCount += cells.length;
    findings.push(...checkPage(cells, model.name));
  }
  return { pages: models.length, cells: cellCount, findings };
}

export function formatReport(report: Report): string {
  const errors = report.findings.filter((f) => f.severity === "error");
  const warnings = report.findings.filter((f) => f.severity === "warning");
  const info = report.findings.filter((f) => f.severity === "info");
  const head = `SAP diagram check: ${errors.length} error(s), ${warnings.length} warning(s), ${info.length} suggestion(s) in ${report.pages} page(s), ${report.cells} cell(s).`;
  if (report.findings.length === 0) {
    return `${head}\nNo problems found. Note that this checks the rules that can be verified from the file; it does not judge the layout.`;
  }
  const lines = report.findings.map((f) => {
    const where = f.page ? ` [page "${f.page}"]` : "";
    const cells = f.cells?.length ? ` (cells: ${f.cells.join(", ")})` : "";
    const hint = f.hint ? `\n    Fix: ${f.hint}` : "";
    const label = f.severity === "info" ? "SUGGESTION" : f.severity.toUpperCase();
    return `- ${label} ${f.rule}${where}: ${f.message}${cells}${hint}`;
  });
  return `${head}\n${lines.join("\n")}`;
}
