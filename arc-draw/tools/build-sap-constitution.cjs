#!/usr/bin/env node
/**
 * Generate packages/drawio-mcp-server/src/sap-constitution.ts from:
 *   constitution/instructions-preamble.md  (short "how to behave" header)
 *   constitution/sap-btp-diagram.md        (the drawing grammar)
 *
 * The result is injected as the MCP server `instructions`, so every client
 * loads the SAP grammar on connect. Edit the .md files, never the .ts.
 *
 * Usage:
 *   node tools/build-sap-constitution.cjs          # write the .ts
 *   node tools/build-sap-constitution.cjs --check  # exit 1 if the .ts is stale (CI)
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PREAMBLE = path.join(ROOT, "constitution/instructions-preamble.md");
const GRAMMAR = path.join(ROOT, "constitution/sap-btp-diagram.md");
const OUT = path.join(ROOT, "packages/drawio-mcp-server/src/sap-constitution.ts");

const text =
  fs.readFileSync(PREAMBLE, "utf8") + fs.readFileSync(GRAMMAR, "utf8");

const ts =
  "// AUTO-GENERATED from constitution/sap-btp-diagram.md — do not edit by hand.\n" +
  "// Injected as the MCP server `instructions` so every client loads it on connect.\n" +
  "\n" +
  "export const SAP_DIAGRAM_INSTRUCTIONS: string = " +
  JSON.stringify(text) +
  ";\n";

if (process.argv.includes("--check")) {
  const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8") : "";
  if (current !== ts) {
    console.error(
      "sap-constitution.ts is out of date with constitution/*.md.\n" +
        "Run: node tools/build-sap-constitution.cjs",
    );
    process.exit(1);
  }
  console.log("sap-constitution.ts is up to date.");
} else {
  fs.writeFileSync(OUT, ts);
  console.log(`wrote ${path.relative(ROOT, OUT)} (${text.length} chars)`);
}
