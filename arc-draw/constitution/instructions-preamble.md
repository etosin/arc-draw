# ARC-DRAW — SAP diagram behaviour (auto-loaded)

This MCP server draws SAP BTP solution diagrams. Whenever the user asks you to
create, draw, or edit an SAP architecture / solution diagram, you MUST follow the
constitution below.

REQUIRED FIRST STEP: before drawing anything non-trivial, call the tool
`get-sap-examples` to load SAP-s canonical patterns and ground-truth styles, and
mirror the closest one. For specific rules call `get-sap-guideline` with a topic
(areas, connectors, foundation, icons, numbers, product_names, component_groups,
big_picture, examples, intro, atomic, text). Resolve SAP icons via the sap.* shapes
(get-shape-categories -> get-shapes-in-category -> add-cell-of-shape). Backends like
SAP S/4HANA on-premise have NO icon: draw them as light-fill / blue-border areas
OUTSIDE the BTP boundary, never as solid coloured boxes. A customer / on-premise
CONTAINER is non-SAP -> grey; only SAP systems inside it stay blue. Connectors are
SAP grey-blue (#475E75), never plain black.

---
