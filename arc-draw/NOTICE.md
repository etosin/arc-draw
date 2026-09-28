# NOTICE

This product is a derivative work ("fork") and includes third-party material.

## Upstream project

**drawio-mcp-server**
Copyright (c) 2025 Ladislav Gazo
Licensed under the MIT License, see `LICENSE.md`.
Source: https://github.com/lgazo/drawio-mcp-server (base: v2.3.0)

All MCP server, draw.io plugin, browser extension and diagram-manipulation
functionality is the work of the upstream project and its contributors. The
original README is preserved as `README.upstream.md`.

## Additions in this fork

Copyright (c) 2026 Emerson Tosin and ARC-DRAW contributors, released under the
same MIT License.

The SAP layer consists of:
- `packages/drawio-mcp-plugin/src/sap-catalog.json`: the SAP BTP icon catalog
  (single source of truth for the bundled icons).
- `packages/drawio-mcp-plugin/src/sap-shapes.ts`: derives the `sap.*` runtime
  shapes from the catalog.
- `tools/build-sap-catalog.cjs`: regenerates the catalog from draw.io mxlibrary.
- `constitution/sap-btp-diagram.md` and `constitution/instructions-preamble.md`:
  the SAP diagram drawing grammar, sent as MCP server instructions.
- `tools/build-sap-constitution.cjs`: generates
  `packages/drawio-mcp-server/src/sap-constitution.ts` from the Markdown.
- `packages/drawio-mcp-server/src/sap-reference.ts` and the tools
  `get-sap-examples` / `get-sap-guideline`.
- `docs/SAP-INTEGRATION.md`: integration notes.
- Additive changes to `packages/drawio-mcp-plugin/src/bootstrap.ts` (register
  the SAP catalog) and `packages/drawio-mcp-plugin/src/shape-extractor.ts`
  (extract draw.io's native SAP palette).
- Cross-platform build scripts, removal of the dev-only `drawio-mcp-dev-proxy`
  package, and tests for the above.

## Third-party assets

**SAP BTP icons and diagram conventions**
Derived from SAP's *BTP Solution Diagrams* guideline and shape libraries:
https://github.com/SAP/btp-solution-diagrams
SPDX-FileCopyrightText: 2024 SAP SE or an SAP affiliate company and
btp-solution-diagrams contributors
SPDX-License-Identifier: Apache-2.0 (per the project's REUSE.toml, which covers
all files). A copy of the license is in
`third_party/sap-btp-solution-diagrams/LICENSE`.

The icon data in `sap-catalog.json` and the style values in the constitution
and `sap-reference.ts` are taken from that project. "SAP", the SAP logo, and SAP
product names are trademarks or registered trademarks of SAP SE in Germany and
other countries. This project is not affiliated with or endorsed by SAP SE.

If you redistribute this project, retain this NOTICE, `LICENSE.md`, and
`third_party/sap-btp-solution-diagrams/LICENSE`.
