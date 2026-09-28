import { existsSync, promises as fs } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { applyEdits, modify } from "jsonc-parser";
import type { HostAdapter } from "../types.js";

export const claudeCodeAdapter: HostAdapter = {
  id: "claude-code",
  displayName: "Claude Code (user scope)",
  defaultPaths() {
    return [join(homedir(), ".claude.json")];
  },
  async detect() {
    return existsSync(claudeCodeAdapter.defaultPaths()[0])
      ? "installed"
      : "absent";
  },
  async read(path: string) {
    return existsSync(path) ? fs.readFile(path, "utf8") : "";
  },
  merge(source, entry, name, { uninstall }) {
    const text = source.trim() === "" ? "{}\n" : source;
    const value = uninstall
      ? undefined
      : {
          type: entry.transport,
          command: entry.command,
          args: entry.args,
          ...(Object.keys(entry.env).length ? { env: entry.env } : {}),
        };
    const edits = modify(text, ["mcpServers", name], value, {
      formattingOptions: { insertSpaces: true, tabSize: 2 },
    });
    return applyEdits(text, edits);
  },
  diffLabel() {
    return claudeCodeAdapter.defaultPaths()[0];
  },
};
