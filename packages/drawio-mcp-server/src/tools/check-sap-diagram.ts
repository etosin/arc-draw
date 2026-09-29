import { readFileSync } from "node:fs";
import { extname, isAbsolute } from "node:path";

import { z } from "zod";

import { export_tool_handler } from "../tool.js";
import { formatReport, validateSapDiagram } from "../sap-validator.js";
import { target_page_field } from "./shared.js";
import { ToolRegistrar } from "./types.js";

export const TOOL_check_sap_diagram = "check-sap-diagram";

const ALLOWED_EXTENSIONS = new Set([".drawio", ".xml"]);

export const registerCheckSapDiagramTool: ToolRegistrar = (
  server,
  context,
) => {
  server.tool(
    TOOL_check_sap_diagram,
    "Checks a diagram against the rules in the SAP BTP Solution Diagram " +
      "constitution: the SAP colour palette, connectors, backends outside " +
      "the BTP boundary, a legend when semantics are used, and structural " +
      "problems (broken references, duplicate ids). Structural problems " +
      "are errors; everything else is a warning or a suggestion. This " +
      "checks only what can be verified from the file — it does not judge " +
      "the layout. By default checks the live canvas (target_page); pass " +
      "file_path to check a saved .drawio/.xml file instead, or xml to " +
      "check a diagram you already have as text.",
    {
      target_page: target_page_field().optional(),
      file_path: z
        .string()
        .optional()
        .describe(
          "Absolute path to a .drawio or .xml file to check, instead of the live canvas.",
        ),
      xml: z
        .string()
        .optional()
        .describe(
          "Diagram XML (mxfile or mxGraphModel) to check directly, instead of the live canvas.",
        ),
    },
    async (args, extra) => {
      const provided = ["file_path", "xml", "target_page"].filter(
        (k) => (args as Record<string, unknown>)[k] !== undefined,
      );
      if (provided.length > 1) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Provide only one of file_path, xml, or target_page. Got: ${provided.join(", ")}.`,
            },
          ],
          isError: true,
        };
      }

      let xml: string;
      if (args.file_path) {
        if (!isAbsolute(args.file_path)) {
          return {
            content: [
              {
                type: "text" as const,
                text: "file_path must be an absolute path.",
              },
            ],
            isError: true,
          };
        }
        if (!ALLOWED_EXTENSIONS.has(extname(args.file_path).toLowerCase())) {
          return {
            content: [
              {
                type: "text" as const,
                text: "file_path must end in .drawio or .xml.",
              },
            ],
            isError: true,
          };
        }
        try {
          xml = readFileSync(args.file_path, "utf-8");
        } catch (err) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Could not read file_path: ${err instanceof Error ? err.message : String(err)}`,
              },
            ],
            isError: true,
          };
        }
      } else if (args.xml) {
        xml = args.xml;
      } else {
        const exportHandler = export_tool_handler("export-diagram", context, {
          queue: true,
        });
        const result = await exportHandler(
          {
            target_page: args.target_page,
            format: "xml",
            scale: 1,
            border: 0,
            background: "#ffffff",
            shadow: false,
            crop: true,
            selection_only: false,
            transparent: false,
            dpi: 96,
            embed_xml: false,
            size: "diagram",
          },
          extra,
        );
        const text = result.content.find(
          (c: { type: string }) => c.type === "text",
        ) as { text?: string } | undefined;
        if (!text?.text || /^Export failed:/.test(text.text)) {
          return {
            content: [
              {
                type: "text" as const,
                text:
                  text?.text ??
                  "Could not export the live canvas to check it.",
              },
            ],
            isError: true,
          };
        }
        xml = text.text;
      }

      const report = validateSapDiagram(xml);
      return { content: [{ type: "text" as const, text: formatReport(report) }] };
    },
  );
};
