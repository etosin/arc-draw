// SAP BTP Solution Diagram reference knowledge, served on demand via MCP tools.
// Distilled from https://sap.github.io/btp-solution-diagrams and from the official
// editable .drawio templates (ground-truth styles). Refresh by re-reading the
// guideline pages / templates and updating the strings below.

/**
 * Canonical examples + ground-truth styles pulled from SAP's editable .drawio
 * templates. The agent should read this FIRST and mirror the closest pattern.
 */
export const SAP_EXAMPLES = `# SAP BTP — Canonical patterns (ground truth from official .drawio templates)

Read this BEFORE drawing. Copy these exact styles; do not invent your own.

## Ground-truth styles (verbatim from SAP templates)

**Outer BTP / SAP area** (light-blue fill):
\`rounded=1;whiteSpace=wrap;html=1;strokeColor=#0070F2;fillColor=#EBF8FF;absoluteArcSize=1;arcSize=32;strokeWidth=1.5;verticalAlign=top;align=left;spacingLeft=10;spacingTop=8;fontColor=#1D2D3E;fontStyle=1;\`

**Inner component box** (WHITE fill, blue border — this is the nesting rule):
\`rounded=1;whiteSpace=wrap;html=1;strokeColor=#0070F2;fillColor=#FFFFFF;absoluteArcSize=1;arcSize=16;strokeWidth=1.5;\`

**Non-SAP / third-party area** (grey):
\`rounded=1;whiteSpace=wrap;html=1;strokeColor=#475E75;fillColor=#F5F6F7;absoluteArcSize=1;arcSize=16;strokeWidth=1.5;\`

**Standard connector** (NOT black — SAP grey-blue, thin block arrow):
\`edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;endArrow=blockThin;endFill=1;endSize=4;strokeColor=#475E75;strokeWidth=1.5;fontColor=#556B82;\`

**Async connector**: add \`dashed=1;dashPattern=6 4;\`  ·  **Optional**: \`dashed=1;dashPattern=1 4;\`
**Semantic overrides** (L1/L2 only): trust \`#CC00DC\` · auth \`#188918\` · authz \`#5D36FF\` · firewall \`strokeWidth=4;strokeColor=#475E75;\`

## Reusable component groups (organisms)

Three standard building blocks recur in almost every diagram: **User**, **Third Party**, **BTP Layer**. Compose from these.

## Pattern A — On-premise backend → BTP via Cloud Connector (most common inbound)

- The **on-premise / customer-network container is NON-SAP → grey area** (border
  \`#475E75\`, fill \`#F5F6F7\`), placed OUTSIDE the BTP area. Colour the container by
  who owns the environment, not by what is inside it.
- \`SAP S/4HANA (On-Premise)\`: inner box in **SAP blue** (white fill \`#FFFFFF\`, blue
  border \`#0070F2\`) — it is an SAP product, but it sits INSIDE the grey container.
  No icon exists — it is a labelled box, never a solid block.
- Edge \`RFC / HTTPS\` (solid standard connector) → \`Cloud Connector\` (sap.* icon, at the on-prem edge, outside BTP).
- Edge \`Secure Tunnel\` colored trusted-blue \`#0070F2\` → \`SAP Connectivity Service\` (sap.* icon, INSIDE the BTP area).
- Edge \`internal\` (solid) → target BTP service (e.g. \`sap.integration_suite\`).
- Add title; for L1/L2 add a legend.

## Pattern B — BTP service consumed by a user/third party

- \`User\` or \`Third Party\` organism outside BTP → solid connector → BTP service inside the BTP area.
- L0: neutral connectors, no legend, add a one-line description instead.

## Reference gallery & editable templates (highest fidelity)

- Examples: https://sap.github.io/btp-solution-diagrams/docs/btp_guideline/examples/
- Editable .drawio templates (open these for exact layout):
  https://github.com/SAP/btp-solution-diagrams/tree/main/assets/editable-diagram-examples
  (SAP_Task_Center_L0/L1/L2, SAP_Build_Work_Zone_L2, SAP_Cloud_Identity_Services_*,
  SAP_Private_Link_Service_L2, SAP_Start_L2, SAP_Build_Process_Automation_L2)
`;

/** Distilled guideline sections, addressable by topic. */
export const SAP_GUIDELINES: Record<string, string> = {
  big_picture: `# Big Picture
BTP Solution Diagrams are high-level, abstract illustrations of technical landscapes, based on the SAP Fiori Horizon design system. They show BTP services, systems, environments and their interdependencies — not low-level detail (that is TAM).
Audience levels drive granularity:
- L0: overview for business/sales/exec audiences. Connectors stay NEUTRAL (no semantic colours), NO legend; add a short description instead.
- L1: technical decision-makers (architects, consultants). Semantic connectors + legend.
- L2: detailed, for solution/cloud architects. Full semantics + legend + numbers.
Draw.io rule: use the library's arrows/elements; don't invent arrows; keep text sizes consistent when scaling.`,

  atomic: `# Atomic Design System
The system is layered: Atoms (Foundation: colours, line styles, text styles) → Molecules (Areas, Connectors, Text, Icons, Numbers, Product Names) → Organisms (Component Groups like User / Third Party / BTP Layer) → Templates (full example diagrams). Build up from atoms; reuse molecules and organisms rather than reinventing.`,

  foundation: `# Foundation (Atoms)
Colours — SAP/BTP area: border #0070F2, fill #EBF8FF. Non-SAP area: border #475E75, fill #F5F6F7. Title text #1D2D3E, body text #556B82. Status: positive #188918/#F5FAE5, critical #C35500/#FFF8D6, negative #D20A0A/#FFEAF4. Accent (highlight only): teal #07838F/#DAFDF5, indigo #5D36FF/#F1ECFF, pink #CC00DC/#FFF0FA.
Lines: solid = synchronous/direct; dashed = asynchronous/indirect; dotted = optional; thick grey = firewall/barrier. Stroke width 1.5. NEVER solid saturated fills.
Spacing: even, roughly one SAP-logo height between elements.`,

  areas: `# Areas
Rounded containers, corner radius 16 (up to 32 on the outermost). SAP area = blue border + light fill (#EBF8FF); nested component boxes flip to WHITE fill (#FFFFFF) with the same blue border to preserve contrast. Non-SAP = grey. Title top-left, bold, #1D2D3E. The BTP layer is usually the outermost SAP area and the anchor; a dashed border is fine for the account/subaccount boundary. Show "multiple of" as a consistent stacked look. Everything non-BTP goes OUTSIDE the BTP area.`,

  connectors: `# Connectors
Ground truth: standard connector is grey-blue #475E75 with a thin block arrow (endArrow=blockThin, endFill=1, endSize=4), strokeWidth 1.5 — NOT black. Route with orthogonalEdgeStyle.
Line style = flow type: solid sync, dashed async (dashPattern 6 4), dotted optional (dashPattern 1 4), thick grey = firewall only. Direction arrow = request→response; bidirectional = mutual trust.
Semantic colours (L1/L2): trust #CC00DC, authentication #188918, authorization #5D36FF. L0 keeps connectors neutral. Label edges concisely; use numbers for sequences.`,

  text: `# Text
Four text styles derived from Fiori Horizon form the hierarchy (title → subtitle → body → caption). Title #1D2D3E bold; body #556B82. Keep sizes consistent when scaling; scale up for the target medium (PowerPoint vs draw.io) rather than distorting.`,

  icons: `# Icons
Two sets. (1) SAP BTP service icons — MANDATORY to use the version WITH the grey background circle for diagrams (the sap.* catalog in this MCP is that set). (2) Generic icons — neutral grey, soft gradients — for elements with no specific icon (devices, databases, generic systems). For a backend without a BTP icon (e.g. S/4HANA on-premise), use a generic grey representation or a labelled area, never an unrelated SAP icon and never a solid box.`,

  numbers: `# Numbers
Use small numbered markers to describe an ordered path/sequence. Number the edges or place number badges 1..n and list the steps in a short side note. Numbers replace long inline labels on busy L1/L2 diagrams.`,

  product_names: `# Product Names
Pair a product name with the SAP logo only for anchor/branded elements, and do NOT flood the diagram with logos — prefer text-only labels for most nodes. Use the official product name verbatim (the sap.* shape title is canonical).`,

  component_groups: `# Component Groups (Organisms)
Organisms are reusable groups of molecules (a shape + text + connector, or a whole sub-diagram). The three canonical ones are User, Third Party, and the BTP Layer. Compose diagrams from these rather than building each element from scratch.`,

  examples: `# Examples
SAP publishes L0/L1/L2 reference diagrams and editable .drawio templates (Task Center, Build Work Zone, Cloud Identity Services auth/authz/lifecycle, Private Link, Start, Build Process Automation). Mirror the closest one: BTP boundary as anchor, backends outside it, semantic connectors, legend (L1/L2), title. Templates: https://github.com/SAP/btp-solution-diagrams/tree/main/assets/editable-diagram-examples`,

  intro: `# Getting started
Begin from the official starter kit (draw.io or PowerPoint) which bundles the atoms/molecules and editable example diagrams. In draw.io, drag library elements (they keep correct style/spacing) and reuse the provided arrows instead of drawing your own. This MCP already bundles the SAP icons as sap.* shapes, so resolve them via get-shape-categories / get-shapes-in-category / add-cell-of-shape.`,
};

export const SAP_GUIDELINE_TOPICS = Object.keys(SAP_GUIDELINES);
