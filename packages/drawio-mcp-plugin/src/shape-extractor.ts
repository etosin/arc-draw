/**
 * Runtime shape extractor.
 *
 * Builds a throwaway dummy object inheriting `Sidebar.prototype`, overrides
 * the methods that drawio's vendor palette adders call, then invokes each
 * adder. Captures every (style, w, h, name, paletteId, sectionTitle) tuple
 * so the plugin can answer `get-shape-*` tools for vendors drawio ships
 * (AWS, GCP, Azure, Cisco19, CiscoSafe, SAP) without hand-curating the catalog.
 */

export type ExtractedShape = {
  style: string;
  width: number;
  height: number;
  name: string;
  paletteId: string;
  category: string;
  /** Explicit catalog key, for shapes whose style cannot identify them. */
  key?: string;
};

const ADDER_TO_PALETTE: Record<string, string> = {
  addAWS4Palette: "aws4",
  addGCP2Palette: "gcp2",
  addAzure2Palette: "azure2",
  addCisco19Palette: "cisco19",
  addCiscoSafePalette: "cisco_safe",
  // ARC-DRAW: draw.io >= 24.7.5 ships a native SAP BTP palette
  // (js/diagramly/sidebar/Sidebar-SAP.js). Its icons use the stencil
  // `shape=mxgraph.sap.icon;SAPIcon=<Name>` and are keyed mxgraph.sap.<name>.
  // They complement (do not replace) the bundled sap.* catalog.
  addSAPPalette: "sap",
};

function unescapeXml(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function xmlAttr(tag: string, name: string): string | null {
  const m = new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(tag);
  return m ? unescapeXml(m[1]) : null;
}

/**
 * draw.io stores many palette entries as compressed XML "data entries".
 * Returns the style and size when the decoded template is exactly one plain
 * cell: one vertex (a generic icon...) or one edge (a default connector).
 * Multi-cell groups return null, since they cannot be placed as one shape.
 */
export function parseSingleCellTemplate(
  xml: string,
): { style: string; width: number; height: number } | null {
  const vertexTags = xml.match(/<mxCell\b[^>]*\bvertex="1"[^>]*>/g) ?? [];
  const edgeTags = xml.match(/<mxCell\b[^>]*\bedge="1"[^>]*>/g) ?? [];
  if (vertexTags.length + edgeTags.length !== 1) return null;

  const cellTag = vertexTags[0] ?? edgeTags[0];
  if (!cellTag) return null;
  const style = xmlAttr(cellTag, "style");
  if (!style) return null;

  const after = xml.slice(xml.indexOf(cellTag) + cellTag.length);
  const geometry = /<mxGeometry\b[^>]*>/.exec(after)?.[0] ?? "";
  const width = Number(xmlAttr(geometry, "width")) || 0;
  const height = Number(xmlAttr(geometry, "height")) || 0;
  return { style, width, height };
}

export function extractShapesFromSidebar(
  ui: any,
): Map<string, ExtractedShape> {
  const Sidebar = (window as any).Sidebar;
  if (!Sidebar?.prototype) {
    throw new Error("drawio Sidebar prototype not available on window");
  }
  if (!ui?.sidebar) {
    throw new Error("ui.sidebar not constructed yet");
  }

  const recorded: ExtractedShape[] = [];
  let currentPalette = "unknown";
  let currentSection = "";

  const dummy: any = Object.assign(
    Object.create(Sidebar.prototype),
    ui.sidebar,
    {
      taglist: {},
      palettes: {},
      entries: [],

      createVertexTemplateEntry(
        style: string,
        w: number,
        h: number,
        _value: any,
        title: string,
      ) {
        recorded.push({
          style,
          width: w,
          height: h,
          name: String(title ?? ""),
          paletteId: currentPalette,
          category: `mxgraph.${currentPalette}.${slug(currentSection || "default")}`,
        });
        return () => null;
      },

      addPalette(
        _id: string,
        title: string,
        _expanded: boolean,
        onInit: (container: any) => void,
      ) {
        if (title && currentPalette !== "sap") currentSection = title;
        try {
          onInit({ appendChild() {} });
        } catch {}
      },

      addPaletteFunctions(
        _id: string,
        title: string,
        _expanded: boolean,
        fns: Array<(container: any) => any>,
      ) {
        // SAP announces its sections through setCurrentSearchEntryLibrary
        // (below); its palette titles would only rename them too late.
        if (title && currentPalette !== "sap") currentSection = title;
        const fake = { appendChild() {} };
        for (const fn of fns) {
          try {
            fn(fake);
          } catch {}
        }
      },

      // drawio evaluates the createVertexTemplateEntry(...) array *before*
      // addPaletteFunctions receives its title, so the title arrives too late
      // to label those entries. Sidebar-SAP.js announces each sub-palette via
      // setCurrentSearchEntryLibrary('sap', 'sapFoundations') first, so for SAP
      // we take the section from there. Other vendors keep upstream behaviour.
      setCurrentSearchEntryLibrary(id?: string, lib?: string) {
        if (currentPalette === "sap" && id && lib) {
          currentSection = lib.startsWith(id) ? lib.slice(id.length) : lib;
        }
      },

      // drawio's addDataEntry() ends up here with the compressed template.
      // Only SAP is captured this way (generic icons, default connectors).
      // Many SAP data entries (areas, accents, text) have no title at all and
      // are skipped: a shape without a name cannot be asked for by name.
      createVertexTemplateFromData(
        data: string,
        w: number,
        h: number,
        title: string,
      ) {
        if (currentPalette !== "sap" || !title) return null;
        const decompress = (window as any).Graph?.decompress;
        if (typeof decompress !== "function") return null;
        try {
          const parsed = parseSingleCellTemplate(decompress(data));
          if (!parsed) return null;
          const category = `mxgraph.sap.${slug(currentSection || "default")}`;
          recorded.push({
            style: parsed.style,
            width: parsed.width || w,
            height: parsed.height || h,
            name: String(title),
            paletteId: currentPalette,
            category,
            key: `${category}.${slug(title)}`,
          });
        } catch {}
        return null;
      },

      createEdgeTemplateEntry: () => () => null,
      addEntry: (_tags: any, fn: any) => fn,
      createTitle: () =>
        typeof document !== "undefined"
          ? document.createElement("div")
          : ({} as any),
    },
  );

  // addSAPPalette() calls ~20 sub-palettes in sequence. Isolate each one so a
  // failure in one does not discard every palette that follows it.
  for (const name of Object.getOwnPropertyNames(Sidebar.prototype)) {
    if (!/^addSAP\w+Palette$/.test(name) || name === "addSAPPalette") continue;
    const original = Sidebar.prototype[name];
    if (typeof original !== "function") continue;
    dummy[name] = function (this: unknown, ...args: unknown[]) {
      try {
        return original.apply(this, args);
      } catch (err) {
        console.warn(`[shape-extractor] ${name} threw; skipping it`, err);
        return undefined;
      }
    };
  }

  for (const [adder, paletteId] of Object.entries(ADDER_TO_PALETTE)) {
    if (typeof dummy[adder] !== "function") {
      console.warn(
        `[shape-extractor] Sidebar.prototype.${adder} missing — vendor '${paletteId}' skipped`,
      );
      continue;
    }
    currentPalette = paletteId;
    currentSection = "";
    try {
      dummy[adder]();
    } catch (err) {
      console.warn(`[shape-extractor] ${adder} threw during extraction`, err);
    }
  }

  // A title that repeats inside one section (for example the coloured
  // connectors, which differ only by colour) is ambiguous: drop all of them
  // rather than let the agent guess.
  const explicitCount = new Map<string, number>();
  for (const s of recorded) {
    if (s.key) explicitCount.set(s.key, (explicitCount.get(s.key) ?? 0) + 1);
  }

  const out = new Map<string, ExtractedShape>();
  for (const s of recorded) {
    if (s.key) {
      if ((explicitCount.get(s.key) ?? 0) > 1) continue;
      if (!out.has(s.key)) out.set(s.key, s);
      continue;
    }
    const key = deriveKey(s.style);
    if (key) out.set(key, s);
  }

  for (const v of Object.values(ADDER_TO_PALETTE)) {
    const n = [...out.keys()].filter((k) =>
      k.startsWith(`mxgraph.${v}.`),
    ).length;
    if (n === 0) {
      console.warn(`[shape-extractor] captured 0 shapes for vendor '${v}'`);
    }
  }

  return out;
}

function deriveKey(style: string): string | null {
  if (!style) return null;

  // 0) SAP native stencil: shape=mxgraph.sap.icon;...;SAPIcon=Cloud_Integration
  //    Every SAP icon shares shape=mxgraph.sap.icon, so the key must come from
  //    SAPIcon or all of them would collapse into one entry.
  const sapIcon = /SAPIcon=([^;]+)/.exec(style);
  if (sapIcon && /shape=mxgraph\.sap\./i.test(style)) {
    return `mxgraph.sap.${slug(sapIcon[1])}`;
  }

  // 1) AWS4 resourceIcon: shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.lambda
  const res = /resIcon=([^;]+)/.exec(style);
  if (res && res[1].startsWith("mxgraph.")) return res[1];

  // 2) Cisco19-style: shape=mxgraph.<vendor>.rect;prIcon=l2_switch
  const shapeMatch = /shape=mxgraph\.([a-z0-9_]+)\.([a-z0-9_]+)/i.exec(style);
  const prIconMatch = /prIcon=([a-z0-9_]+)/i.exec(style);
  if (shapeMatch && prIconMatch) {
    return `mxgraph.${shapeMatch[1].toLowerCase()}.${prIconMatch[1].toLowerCase()}`;
  }

  // 3) Direct shape=mxgraph.<vendor>.<icon>
  if (shapeMatch) {
    return `mxgraph.${shapeMatch[1].toLowerCase()}.${shapeMatch[2].toLowerCase()}`;
  }

  // 4) image-based: image=img/lib/<vendor>/<sub>/<file>.svg|png
  const imgMatch =
    /image=img\/lib\/([^/;]+)\/(?:(.+)\/)?([^/;]+?)\.(?:svg|png|jpe?g)/i.exec(
      style,
    );
  if (imgMatch) {
    const vendor = slug(imgMatch[1]);
    const middle = imgMatch[2] ? slug(imgMatch[2]) : "";
    const file = slug(imgMatch[3]);
    if (!vendor || !file) return null;
    return middle
      ? `mxgraph.${vendor}.${middle}.${file}`
      : `mxgraph.${vendor}.${file}`;
  }

  return null;
}

function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "") || "default"
  );
}
