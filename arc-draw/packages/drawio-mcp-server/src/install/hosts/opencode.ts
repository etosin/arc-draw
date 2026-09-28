import { existsSync, promises as fs } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { applyEdits, modify, parse } from "jsonc-parser";
import type { HostAdapter, McpEntry } from "../types.js";

export const opencodeAdapter: HostAdapter = {
  id: "opencode",
  displayName: "OpenCode",
  defaultPaths() {
    const cwd = process.cwd();
    const local = ["opencode.json", "opencode.jsonc"]
      .map((f) => join(cwd, f))
      .filter(existsSync);
    const global = join(homedir(), ".config", "opencode", "opencode.json");
    return local.length > 0 ? [...local, global] : [global];
  },
  async detect() {
    return existsSync(opencodeAdapter.defaultPaths()[0])
      ? "installed"
      : "absent";
  },
  async read(path: string) {
    return existsSync(path) ? fs.readFile(path, "utf8") : "";
  },
  merge(source, entry, name, { uninstall }) {
    const text = source.trim() === "" ? "{}\n" : source;
    const parsed = parse(text) as Record<string, unknown> | undefined;
    if (!parsed || typeof parsed !== "object")
      throw new Error("opencode config is not a JSON object");
    const edits = uninstall
      ? modify(text, ["mcp", name], undefined, {
          formattingOptions: { insertSpaces: true, tabSize: 2 },
        })
      : modify(text, ["mcp", name], toValue(entry), {
          formattingOptions: { insertSpaces: true, tabSize: 2 },
        });
    return applyEdits(text, edits);
  },
  diffLabel() {
    return opencodeAdapter.defaultPaths()[0];
  },
};

function toValue(entry: McpEntry) {
  return {
    type: "local",
    command: [entry.command, ...entry.args],
    enabled: true,
  };
}
