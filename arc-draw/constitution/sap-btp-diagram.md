# SAP BTP Solution Diagram — Constitution

> Grammar the agent MUST follow when drawing SAP architecture with the drawio MCP.
> Source: SAP *BTP Solution Diagrams* guideline (sap.github.io/btp-solution-diagrams).
> Vocabulary (icons) is resolved natively via the MCP as `sap.*` shapes — see §6.
> Keep this file in the agent's context before any SAP drawing task (load it like an
> SDD-Kit constitution). It is the Plan↔Draw contract.

---

## 0. Golden rules (non-negotiable)

0. **Consult the reference first.** Before drawing any non-trivial SAP diagram,
   call **`get-sap-examples`** (canonical patterns + ground-truth styles from SAP's
   official templates) and mirror the closest one. For specific rules, call
   **`get-sap-guideline`** with a topic (areas, connectors, foundation, icons,
   numbers, product_names, component_groups, big_picture, examples, …). These tools
   are the source of truth; this constitution is the summary.
1. **Icon vocabulary is SAP-native.** Place SAP products with `add-cell-of-shape`
   using a `sap.*` id (§6). Never approximate an SAP product with a generic box.
2. **Grammar over vibes.** Colours, line semantics, radius and spacing below are
   fixed values, not suggestions. Do not invent palette.
3. **Legend by level.** L1/L2 diagrams: add a legend for every line style / semantic
   colour used. L0 diagrams: keep connectors neutral (grey-blue, no semantic colour),
   no legend — add a one-line description instead.
4. **Group before you connect.** Draw areas (containers) first, nest products inside
   them via `parent_id`, then draw edges. Never leave floating icons.
5. **Restraint.** Accent colours and SAP logos are seasoning. Few logos per diagram;
   prefer text-only product labels (§5).
6. **Colour containers by owner, systems by type.** A customer / on-premise
   environment is a NON-SAP boundary → **grey** container, even though an SAP system
   inside it stays **blue** (§6a). Blue is only for SAP/BTP.

---

## 1. Colours (exact hex — do not alter)

### Primary — areas & elements
| Role | Border | Fill |
|------|--------|------|
| SAP / BTP area | `#0070F2` | `#EBF8FF` |
| Non-SAP area   | `#475E75` | `#F5F6F7` |

### Text
| Role | Colour |
|------|--------|
| Title | `#1D2D3E` |
| Body text | `#556B82` |

### Semantic (status)
| Meaning | Border | Fill |
|---------|--------|------|
| Positive | `#188918` | `#F5FAE5` |
| Critical | `#C35500` | `#FFF8D6` |
| Negative | `#D20A0A` | `#FFEAF4` |

### Accent / Emphasised (use sparingly, for highlight only)
| Name | Border | Fill |
|------|--------|------|
| Teal   | `#07838F` | `#DAFDF5` |
| Indigo | `#5D36FF` | `#F1ECFF` |
| Pink   | `#CC00DC` | `#FFF0FA` |

---

## 2. Areas (containers) — the skeleton

- **Standard area = blue** (`#0070F2` / `#EBF8FF`). **Non-SAP = grey**
  (`#475E75` / `#F5F6F7`). Accent colours only to highlight a specific area.
- **Corner radius fixed at 16px.**
- **Nesting:** alternate fill / no-fill between parent and child so contrast is
  preserved. The outermost parent is usually the **BTP layer**. **Ground truth:** the
  outer SAP area uses fill `#EBF8FF`; **nested component boxes flip to white
  `#FFFFFF`** with the same blue `#0070F2` border at `strokeWidth=1.5`.
- **Cardinality:** to show "multiple of this", use a stacked area look; keep the
  style consistent, do not restyle stacks.
- Give elements room to breathe: **spacing ≈ one SAP-logo height, applied evenly.**

**Tool mapping** — draw an area:
```
add-rectangle
  style: "rounded=1;absoluteArcSize=1;arcSize=16;html=1;whiteSpace=wrap;
          verticalAlign=top;align=left;spacingLeft=8;spacingTop=6;
          fillColor=#EBF8FF;strokeColor=#0070F2;fontColor=#1D2D3E;fontStyle=1;"
  text: "SAP BTP"      # area title, top-left
```
Then nest products with `set-cell-parent` (or `parent_id` on creation).
Non-SAP area → swap to `fillColor=#F5F6F7;strokeColor=#475E75;`.

> **Never use a solid, saturated fill** (e.g. dark blue `#1E5AA8`) for a system or
> area. SAP elements are always **light fill + blue border**; that is the single
> most common mistake. A blue-filled box for "S/4HANA" is wrong — see §6a.

---

## 2a. The BTP boundary

The BTP layer is the outermost SAP area and the reference anchor of almost every
diagram. Draw it as a rounded (16px) area titled **"SAP BTP"**, blue border +
light fill. A **dashed** border is acceptable for the account/subaccount boundary.
Everything that runs *on* BTP (Integration Suite, Connectivity Service, Build,
HANA Cloud, …) goes **inside** it. Everything that is *not* BTP — backend systems,
on-premise, third parties — goes **outside** it (§6a).

## 3. Connectors — semantics are load-bearing

**Line style → flow type** (from Foundation):
| Style | Meaning | drawio style fragment |
|-------|---------|-----------------------|
| Solid | direct, **synchronous** request-response | *(default)* |
| Dashed | indirect, **asynchronous** | `dashed=1;dashPattern=6 4;` |
| Dotted | **optional** flow | `dashed=1;dashPattern=1 4;` |
| Thick grey | **firewall / network barrier only** | `strokeWidth=4;strokeColor=#475E75;` |

> **Ground truth (from SAP templates):** the standard connector is **not black**.
> Base style: `edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;endArrow=blockThin;`
> `endFill=1;endSize=4;strokeColor=#475E75;strokeWidth=1.5;fontColor=#556B82;`.
> Apply the semantic overrides below only on L1/L2 diagrams.

**Direction:** one-directional arrow = request-response client→server.
Bidirectional solid = mutual trust.

**Semantic / annotation colours for flows:**
| Flow | Colour |
|------|--------|
| Trust | Pink `#CC00DC` |
| Authentication | Green `#188918` |
| Authorization | Indigo `#5D36FF` |
| Firewall / barrier | Thick grey `#475E75` |

**Tool mapping** — an async authorization flow:
```
add-edge
  style: "edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;endArrow=block;
          dashed=1;dashPattern=6 4;strokeColor=#5D36FF;fontColor=#5D36FF;"
  text: "OAuth token"
```
If any of these styles/colours appear, **emit a legend** (see §7).

---

## 4. Numbers — describe a path/sequence

Use small numbered markers to annotate the ordered steps of a flow. Number the
edges (or place number badges next to them) `1..n` and, when helpful, list the
steps in a side note. Numbers replace long inline labels on busy diagrams.

---

## 5. Product names & logos

- An SAP product name **must be paired with the SAP logo** when shown as a branded
  element — but **do not flood** the diagram with logos.
- Prefer **text-only** product labels for most nodes; reserve the logo+name badge
  for anchors. (The repo ships text-only brand labels for this — see
  `sap_brand_names` assets.)
- Use the official product name verbatim (the `sap.*` shape `title` is canonical).

---

## 6. Icon vocabulary (SAP-native resolution)

SAP icons are bundled into the MCP shape catalog under stable ids `sap.<slug>`,
grouped in six categories (mirroring the guideline's product areas):

`sap.foundation` · `sap.integration_suite` · `sap.app_dev_and_automation`
`sap.data_and_analytics` · `sap.btp_saas` · `sap.ai`

**Discovery → placement workflow:**
1. `get-shape-categories` → confirm the `sap.*` categories are present.
2. `get-shapes-in-category` with `category_id: "sap.integration_suite"` →
   returns `{ id: "sap.cloud_integration", title: "Cloud Integration" }`, etc.
   **The id (`sap.*`) is what you place; the title is the human label.**
3. `add-cell-of-shape` with `shape_name: "sap.cloud_integration"`, plus `x`, `y`,
   `text` (label), and `parent_id` (the area it belongs to).

The icon style is self-contained (embedded SVG); you never handle the raw image.
If a needed product is not in the catalog, use a text-only labelled area — do not
substitute an unrelated icon.

---

## 6a. Backend & non-BTP systems (no BTP icon exists)

The catalog is **BTP-only**. Backend systems have **no icon** and must NOT be drawn
as a solid coloured box. This includes **SAP S/4HANA / ECC (on-premise or any
non-BTP system), and third-party systems.**

Rules:
- Represent each as a **labelled area** using the standard area style (§2), **light
  fill + border**, never a solid saturated fill.
- **SAP backend** (S/4HANA, ECC): SAP palette — border `#0070F2`, fill `#EBF8FF`.
- **Non-SAP / third-party**: grey — border `#475E75`, fill `#F5F6F7`.
- Place them **outside** the BTP boundary (§2a). Add the qualifier in the label,
  e.g. `SAP S/4HANA (On-Premise)`.
- A few backend-adjacent connectivity icons **do** exist and should be used where
  they apply: `Cloud Connector`, `SAP Connectivity Service`, `SAP Private Link` —
  resolve them from the catalog like any other `sap.*` shape.

So "SAP S/4HANA (On-Premise)" = a light-fill, blue-border rounded area **outside**
BTP — not a dark-blue block.

### Container vs. system colour (common mistake)

A **customer / on-premise / corporate-network environment is a NON-SAP boundary**,
so its *container* area is **grey** (border `#475E75`, fill `#F5F6F7`) — even though
SAP systems sit inside it. The blue SAP palette (`#0070F2` / `#EBF8FF`) is reserved
for **SAP/BTP** areas.

- Outer container "Customer Network (On-Premise)" → **grey**.
- The `SAP S/4HANA (On-Premise)` box *inside* that grey container → **blue** (it is
  an SAP product).
- Everything on BTP → inside the blue **SAP BTP** area.

Rule of thumb: colour the **container** by *who owns the environment* (SAP = blue,
customer/third-party = grey); colour each **inner system** by *what it is* (SAP
product = blue, non-SAP = grey).

---

## 6b. Canonical pattern — On-premise → BTP via Cloud Connector

This is the most common inbound pattern; follow it exactly.

```
[ SAP S/4HANA (On-Premise) ]        <- area, blue border + light fill, OUTSIDE BTP
        |  solid edge, label "RFC / HTTPS"
        v
   ( Cloud Connector )              <- sap.* icon, OUTSIDE BTP (edge of on-prem)
        |  solid edge, label "Secure Tunnel", strokeColor #0070F2 (trusted SAP link)
        v
  +----------------------- SAP BTP (area, §2a) -----------------------+
  |  ( SAP Connectivity Service ) --solid "internal"--> ( target svc ) |
  +-------------------------------------------------------------------+
```

Notes that matter:
- The **Secure Tunnel** hop (Cloud Connector → Connectivity Service) is a trusted
  SAP connection — colour it `#0070F2` and label it, don't leave it as a generic
  black arrow.
- `RFC / HTTPS` is a synchronous call → **solid** line.
- The Connectivity Service lives **inside** BTP; Cloud Connector sits at the
  on-premise edge, **outside** BTP.
- Add the **legend** (§7): it uses semantic line meaning.

---

## 7. Legend (required whenever semantics are used)

Draw a small legend area (bottom-left or bottom-right) listing every line style and
semantic colour actually used, e.g.:
- solid → synchronous · dashed → asynchronous · dotted → optional
- pink → trust · green → authentication · indigo → authorization · thick grey → firewall

---

## 7a. Reference examples & templates

SAP publishes canonical L1/L2 reference diagrams and **editable `.drawio`
templates**:
- Examples gallery: https://sap.github.io/btp-solution-diagrams/docs/btp_guideline/examples/
- Editable templates: https://github.com/SAP/btp-solution-diagrams/tree/main/assets/editable-diagram-examples

When a request matches a known shape (integration, identity/auth, work zone,
private link), mirror the structure of the closest reference: BTP boundary as the
anchor, backends outside it, semantic connectors, a legend, and a title.

---

## 8. Compose order (deterministic build sequence)

For any SAP solution diagram, drive the MCP in this order:
1. `create-page` (name it, e.g. "TO-BE — Inbound").
2. Draw the **BTP boundary** and any other **areas** outer→inner (§2, §2a).
3. Place **backend / non-BTP systems** as labelled areas **outside** BTP (§6a).
4. Place **SAP icons** inside their areas (§6), consistent sizing (~48–64px), even
   spacing.
5. Draw **connectors** with correct line style + semantic colour (§3, §6b); number
   the path if sequential (§4).
6. Add the **legend** (§7) and a title (§1 title colour).
7. Verify: no floating icons, no solid saturated fills, backends outside BTP, every
   semantic explained, palette within spec.
