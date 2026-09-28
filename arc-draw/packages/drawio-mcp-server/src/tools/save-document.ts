import { default_tool } from "../tool.js";
import { ToolRegistrar } from "./types.js";

export const TOOL_save_document = "save-document";

export const registerSaveDocumentTool: ToolRegistrar = (server, context) => {
  server.tool(
    TOOL_save_document,
    "Triggers Draw.io's existing File > Save action for the current document. The active storage provider may display an authentication, conflict, or Save As prompt that requires user interaction.",
    {},
    default_tool(TOOL_save_document, context, { queue: true }),
  );
};
