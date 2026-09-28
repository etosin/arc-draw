import { existsSync, promises as fs } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { applyEdits, modify, parse } from "jsonc-parser";
import type { HostAdapter, McpEntry } from "../types.js";

export const zedAdapter: HostAdapter = {
  id: "zed",
  displayName: "Zed",
  defaultPaths() {
    return [join(homedir(), ".config", "zed", "settings.json")];
  },
  async detect() {
    return existsSync(zedAdapter.defaultPaths()[0]) ? "installed" : "absent";
  },
  async read(path: string) {
    return existsSync(path) ? fs.readFile(path, "utf8") : "";
  },
  merge(source, entry, name, { uninstall }) {
    let text = source.trim() === "" ? "{}\n" : source;
    const parsed = parse(text) as Record<string, unknown> | undefined;
    if (!parsed || typeof parsed !== "object") text = "{}\n";
    const edits = uninstall
      ? modify(text, ["context_servers", name], undefined, {
          formattingOptions: { insertSpaces: true, tabSize: 2 },
        })
      : modify(text, ["context_servers", name], toValue(entry), {
          formattingOptions: { insertSpaces: true, tabSize: 2 },
        });
    return applyEdits(text, edits);
  },
  diffLabel() {
    return zedAdapter.defaultPaths()[0];
  },
};

function toValue(entry: McpEntry) {
  return { command: entry.command, args: entry.args, env: entry.env };
}
