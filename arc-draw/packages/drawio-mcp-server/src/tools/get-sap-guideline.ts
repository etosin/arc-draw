import { z } from "zod";

import { SAP_GUIDELINES, SAP_GUIDELINE_TOPICS } from "../sap-reference.js";
import { ToolRegistrar } from "./types.js";

export const TOOL_get_sap_guideline = "get-sap-guideline";

export const registerGetSapGuidelineTool: ToolRegistrar = (server) => {
  server.tool(
    TOOL_get_sap_guideline,
    "Returns a distilled SAP BTP diagram guideline section for detailed rules. " +
      "Use after get-sap-examples to navigate specific conventions. Topics: " +
      SAP_GUIDELINE_TOPICS.join(", ") +
      ".",
    {
      topic: z
        .string()
        .describe(
          "Guideline section to retrieve. One of: " +
            SAP_GUIDELINE_TOPICS.join(", ") +
            ".",
        ),
    },
    async ({ topic }) => {
      const key = String(topic).trim().toLowerCase().replace(/[ -]/g, "_");
      const text = SAP_GUIDELINES[key];
      if (!text) {
        return {
          content: [
            {
              type: "text" as const,
              text:
                'Unknown topic "' +
                topic +
                '". Valid topics: ' +
                SAP_GUIDELINE_TOPICS.join(", ") +
                ".",
            },
          ],
        };
      }
      return { content: [{ type: "text" as const, text }] };
    },
  );
};
