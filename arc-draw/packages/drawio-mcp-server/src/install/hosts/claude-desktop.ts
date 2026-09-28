import { existsSync, promises as fs } from "node:fs";
import { homedir, platform } from "node:os";
import { posix, win32 } from "node:path";
import { applyEdits, modify } from "jsonc-parser";
import type { HostAdapter } from "../types.js";

export function resolveClaudeDesktopPath(
  plat: NodeJS.Platform,
  home: string,
  env: NodeJS.ProcessEnv,
): string {
  if (plat === "darwin")
    return posix.join(
      home,
      "Library",
      "Application Support",
      "Claude",
      "claude_desktop_config.json",
    );
  if (plat === "win32") {
    const appdata = env.APPDATA ?? win32.join(home, "AppData", "Roaming");
    return win32.join(appdata, "Claude", "claude_desktop_config.json");
  }
  return posix.join(home, ".config", "Claude", "claude_desktop_config.json");
}

export const claudeDesktopAdapter: HostAdapter = {
  id: "claude-desktop",
  displayName: "Claude Desktop",
  defaultPaths() {
    return [resolveClaudeDesktopPath(platform(), homedir(), process.env)];
  },
  async detect() {
    return existsSync(claudeDesktopAdapter.defaultPaths()[0])
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
    return claudeDesktopAdapter.defaultPaths()[0];
  },
};
