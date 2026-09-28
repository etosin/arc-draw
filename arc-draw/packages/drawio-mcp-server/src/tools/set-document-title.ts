import { z } from "zod";

import { default_tool } from "../tool.js";
import { ToolRegistrar } from "./types.js";

export const TOOL_set_document_title = "set-document-title";

export const registerSetDocumentTitleTool: ToolRegistrar = (
  server,
  context,
) => {
  server.tool(
    TOOL_set_document_title,
    "Renames the current Draw.io document through its active storage provider while preserving the existing file extension when one is present.",
    {
      title: z
        .string()
        .trim()
        .min(1)
        .describe("New document title, with or without the existing extension"),
    },
    default_tool(TOOL_set_document_title, context, { queue: true }),
  );
};
