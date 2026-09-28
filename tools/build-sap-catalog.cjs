#!/usr/bin/env node
/**
 * Regenerate the bundled SAP shape catalog for the drawio MCP plugin.
 *
 * Input : SAP BTP draw.io mxlibrary XML export(s) (the *.xml you exported from
 *         draw.io, category comments like <!-- Foundation Icons --> preserved).
 * Output: packages/drawio-mcp-plugin/src/sap-catalog.json  (name/category/style)
 *         (sap-shapes.ts reads this file; no second copy is generated)
 *
 * Usage:  node tools/build-sap-catalog.cjs sap-all-M.xml [more.xml ...]
 *
 * This is the only step you rerun when SAP ships new BTP icons: re-export the
 * mxlibrary from draw.io, drop it in, run this, rebuild the plugin.
 */
const fs = require("fs");
const path = require("path");

const OUT_DIR = path.resolve(
  __dirname,
  "../packages/drawio-mcp-plugin/src",
);

const SRCS = process.argv.slice(2);
if (!SRCS.length) {
  console.error("usage: node tools/build-sap-catalog.cjs <mxlibrary.xml> [...]");
  process.exit(1);
}

const decode = (s) =>
  s
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");

const slug = (s) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

let entries = [];
function pushChunk(cat, chunk) {
  const objRe = /\{\s*"xml":[\s\S]*?"title":\s*"(.*?)"\s*\}/g;
  let m;
  while ((m = objRe.exec(chunk))) {
    let obj;
    try { obj = JSON.parse(m[0]); } catch { continue; }
    const xml = decode(obj.xml || "");
    // Pick the cell that actually carries the icon. Some library entries wrap
    // the icon in a group ("group;aspect=fixed;") whose first style is NOT the
    // image; taking the first style= blindly produced an empty shape.
    const cells = [...xml.matchAll(/<mxCell\b([^>]*)>/g)].map((c) => c[1]);
    const iconCell =
      cells.find((a) => /style="[^"]*image=data:image\//.test(a)) ||
      cells.find((a) => /style="/.test(a)) ||
      "";
    const nameM = iconCell.match(/value="([^"]*)"/) || xml.match(/value="([^"]+)"/);
    const styleM = iconCell.match(/style="([^"]*)"/);
    if (!styleM || !/image=data:image\//.test(styleM[1])) {
      console.warn(`warning: no embedded icon found for "${obj.title}"`);
    }
    let name = nameM ? decode(nameM[1]) : (obj.title || "");
    name = name.replace(/&#10;/g, " ").replace(/\s+/g, " ").trim() || obj.title;
    entries.push({
      name,
      internal: obj.title,
      category: cat,
      w: obj.w, h: obj.h,
      style: styleM ? styleM[1] : "",
    });
  }
}

for (const src of SRCS) {
  const raw = fs.readFileSync(src, "utf8");
  const parts = raw.split(/<!--\s*(.*?)\s*Icons\s*-->/);
  for (let i = 1; i < parts.length; i += 2) pushChunk(parts[i], parts[i + 1] || "");
}

// de-dup by name
const seen = new Set();
entries = entries.filter((e) => (seen.has(e.name) ? false : seen.add(e.name)));

// write the catalog (single source of truth for the SAP icons)
fs.writeFileSync(
  path.join(OUT_DIR, "sap-catalog.json"),
  JSON.stringify(entries, null, 0),
);

// sap-shapes.ts derives the runtime map from sap-catalog.json at build time,
// so only the JSON is written here (no duplicated icon data).
const map = {};
for (const e of entries) {
  map["sap." + slug(e.name)] = { category: "sap." + slug(e.category || "misc") };
}

const byCat = {};
for (const v of Object.values(map)) byCat[v.category] = (byCat[v.category] || 0) + 1;
console.log(`wrote ${Object.keys(map).length} shapes`);
console.log("by category:", JSON.stringify(byCat, null, 0));
