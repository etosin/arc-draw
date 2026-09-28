# SAP overlay — how it plugs into drawio-mcp-server

ARC-DRAW is `drawio-mcp-server` (upstream base: v2.3.0) plus an SAP layer. The
layer is kept small and additive so upstream releases can be merged with few
conflicts.

## Pieces

| Piece | Where | Role |
|---|---|---|
| Bundled SAP icons (`sap.*`) | `packages/drawio-mcp-plugin/src/sap-catalog.json` → `sap-shapes.ts` | 111 SAP BTP icons with embedded SVG, always available |
| Native SAP palette (`mxgraph.sap.*`) | `packages/drawio-mcp-plugin/src/shape-extractor.ts` | Extracts draw.io's own SAP palette (draw.io ≥ 24.7.5) at runtime |
| Drawing grammar | `constitution/*.md` → `packages/drawio-mcp-server/src/sap-constitution.ts` | Sent to every client as MCP server `instructions` |
| On-demand reference | `packages/drawio-mcp-server/src/sap-reference.ts` | Served by `get-sap-examples` and `get-sap-guideline` |

## Touch points in upstream files

Keep these in mind when merging a new upstream release.

**`packages/drawio-mcp-plugin/src/bootstrap.ts`** — three edits:

```ts
import { mergeSapShapes } from "./sap-shapes";          // (a) import
// ...
setRuntimeCatalog(mergeSapShapes(new Map()));           // (b) before `if (enableShapeExtraction)`
// ...
setRuntimeCatalog(mergeSapShapes(runtime));             // (c) inside tryExtractShapes
```

`setRuntimeCatalog` *replaces* the catalog: (b) makes SAP available even when
vendor extraction is off or fails, (c) keeps SAP when extraction succeeds.

**`packages/drawio-mcp-plugin/src/shape-extractor.ts`** — `addSAPPalette` in
`ADDER_TO_PALETTE`, a `SAPIcon=` rule at the top of `deriveKey`, and
`setCurrentSearchEntryLibrary` records the SAP sub-palette as the section.

**`packages/drawio-mcp-server/src/index.ts`** — `instructions: SAP_DIAGRAM_INSTRUCTIONS`.

**`packages/drawio-mcp-server/src/tools/index.ts`** — registers the two SAP tools.

**`packages/drawio-mcp-server/package.json`** — `sap:constitution` scripts,
`build`/`lint` run them; `shx` for cross-platform build scripts; no
`drawio-mcp-dev-proxy`.

## Merging a new upstream release

This repository does not share git history with upstream, so `git merge` will not work.
Merge by applying upstream's diff between the tag we are based on and the new tag
(the base is recorded in `upstreamBase` in the root `package.json` and in `NOTICE.md`):

```bash
# in a separate clone of upstream
git clone https://github.com/lgazo/drawio-mcp-server.git ../drawio-upstream
cd ../drawio-upstream
git diff v2.3.0 vX.Y.Z > ../upstream-vX.Y.Z.patch

# in this repository, on a new branch
git checkout -b sync/upstream-vX.Y.Z
git apply --3way ../upstream-vX.Y.Z.patch     # resolve conflicts at the touch points above
pnpm install                                  # refresh pnpm-lock.yaml
pnpm -r build && pnpm -r test
```

Then update `upstreamBase` and the base version in `NOTICE.md`.

Upstream's `drawio-mcp-dev-proxy` package and its CI/publish workflows will reappear in the
diff; delete them again (the dev-proxy postinstall breaks `pnpm install` on some Windows
machines, and the publish workflows must not run from this fork).

## Verifying after build (`--editor`)

- `get-shape-categories` lists `sap.foundation`, `sap.integration_suite`,
  `sap.app_dev_and_automation`, `sap.data_and_analytics`, `sap.btp_saas`,
  `sap.ai` — and, with a recent draw.io, `mxgraph.sap.*` categories.
- `get-shapes-in-category { "category_id": "sap.integration_suite" }` → 15 shapes.
- `add-cell-of-shape { "shape_name": "sap.cloud_integration", "x": 200, "y": 160 }`
  places the SAP Cloud Integration icon.

Expected bundled counts (111): foundation 43 · integration_suite 15 ·
app_dev_and_automation 17 · data_and_analytics 8 · btp_saas 17 · ai 11.
`packages/drawio-mcp-plugin/src/sap-shapes.test.ts` enforces them.

## Refreshing the bundled icons

```bash
node tools/build-sap-catalog.cjs sap-all-M.xml sap-ai-M.xml   # pass ALL libraries
pnpm --filter drawio-mcp-plugin build
pnpm --filter drawio-mcp-plugin test
```

The libraries are published in
https://github.com/SAP/btp-solution-diagrams (Apache-2.0) under
`assets/shape-libraries-and-editable-presets/draw.io/`.
