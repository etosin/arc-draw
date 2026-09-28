import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "@jest/globals";
import matter from "gray-matter";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CMD_DIR = join(__dirname, "..", "commands");

describe("commands", () => {
	const files = readdirSync(CMD_DIR).filter((f) => f.endsWith(".md"));

	it("has drawio-open and drawio-status", () => {
		expect(files.sort()).toEqual(["drawio-open.md", "drawio-status.md"]);
	});

	for (const f of files) {
		const parsed = matter(readFileSync(join(CMD_DIR, f), "utf8"));

		it(`${f} has non-empty description`, () => {
			expect(typeof parsed.data.description).toBe("string");
			expect(parsed.data.description.length).toBeGreaterThan(0);
		});

		it(`${f} declares allowed-tools as a non-empty list`, () => {
			expect(Array.isArray(parsed.data["allowed-tools"])).toBe(true);
			expect(
				(parsed.data["allowed-tools"] as unknown[]).length,
			).toBeGreaterThan(0);
		});

		it(`${f} has non-empty body`, () => {
			expect(parsed.content.trim().length).toBeGreaterThan(20);
		});
	}
});
