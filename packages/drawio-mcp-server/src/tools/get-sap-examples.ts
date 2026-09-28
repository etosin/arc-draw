import { SAP_EXAMPLES } from "../sap-reference.js";
import { ToolRegistrar } from "./types.js";

export const TOOL_get_sap_examples = "get-sap-examples";

export const registerGetSapExamplesTool: ToolRegistrar = (server) => {
  server.tool(
    TOOL_get_sap_examples,
    "Returns SAP BTP canonical diagram patterns and ground-truth Draw.io styles " +
      "(areas, connectors, component groups) extracted from SAP's official editable " +
      "templates. Call this FIRST, before drawing any SAP architecture/solution " +
      "diagram, and mirror the closest pattern rather than inventing layout or styles.",
    {},
    async () => ({
      content: [{ type: "text" as const, text: SAP_EXAMPLES }],
    }),
  );
};
