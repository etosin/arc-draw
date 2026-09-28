import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "@jest/globals";
import Ajv from "ajv";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("plugin manifest", () => {
	const manifest = JSON.parse(
		readFileSync(
			join(__dirname, "..", ".claude-plugin", "plugin.json"),
			"utf8",
		),
	);
	const schema = JSON.parse(
		readFileSync(join(__dirname, "fixtures", "plugin.schema.json"), "utf8"),
	);

	it("validates against internal schema", () => {
		const ajv = new Ajv();
		const validate = ajv.compile(schema);
		const ok = validate(manifest);
		expect({ ok, errors: validate.errors }).toEqual({ ok: true, errors: null });
	});

	it("declares the drawio MCP server", () => {
		expect(manifest.mcpServers.drawio).toEqual({
			type: "stdio",
			command: "npx",
			args: ["-y", "drawio-mcp-server", "--editor"],
		});
	});
});
