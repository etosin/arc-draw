import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { stringify } from "smol-toml";
import type { HostAdapter, McpEntry } from "../types.js";

export const codexAdapter: HostAdapter = {
  id: "codex",
  displayName: "Codex CLI",
  defaultPaths(): string[] {
    return [join(homedir(), ".codex", "config.toml")];
  },
  async detect() {
    return existsSync(codexAdapter.defaultPaths()[0]) ? "installed" : "absent";
  },
  async read(path: string): Promise<string> {
    if (!existsSync(path)) return "";
    return fs.readFile(path, "utf8");
  },
  merge(source, entry, name, { uninstall }) {
    return mergeTomlBlock(source, name, uninstall ? null : blockBody(entry));
  },
  diffLabel() {
    return codexAdapter.defaultPaths()[0];
  },
};

function blockBody(entry: McpEntry): string {
  const table: Record<string, unknown> = {
    command: entry.command,
    args: entry.args,
  };
  // `smol-toml` renders arrays/inline-tables with padding spaces
  // (`[ "a", "b" ]`); normalize to the compact style used elsewhere in this
  // project's generated configs (`["a", "b"]`).
  const base = stringify(table)
    .trim()
    .replace(/\[ /g, "[")
    .replace(/ \]/g, "]");
  const envKeys = Object.keys(entry.env);
  if (envKeys.length === 0) return base;
  // `smol-toml`'s `stringify` renders a nested object as a `[env]` sub-table
  // header on its own line, which `removeBlock` (below) mistakes for a
  // sibling top-level table -- corrupting idempotent merges and leaking
  // secrets on uninstall (the header + its keys survive as an orphan
  // block). Render `env` as a single-line inline table instead, which stays
  // inside this block and cannot be mistaken for a new `[table]` header.
  const envLine = `env = { ${envKeys
    .map((k) => `${tomlKey(k)} = ${tomlString(entry.env[k])}`)
    .join(", ")} }`;
  return `${base}\n${envLine}`;
}

const BARE_KEY = /^[A-Za-z0-9_-]+$/;

function tomlKey(key: string): string {
  return BARE_KEY.test(key) ? key : tomlString(key);
}

function tomlString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * Insert, replace, or remove a single TOML table (identified by its dotted
 * `key`, e.g. `mcp_servers.drawio`) in `source`, leaving every other byte of
 * the file untouched.
 *
 * `smol-toml`'s `parse` -> `stringify` round-trip (as sketched in the task
 * brief) discards *all* comments and reformats the entire document -- not
 * just the table being edited. That fails round-trip expectations for any
 * config a human may have hand-edited. Splicing the target table's text
 * directly avoids touching unrelated tables, comments, or blank-line layout.
 */
function mergeTomlBlock(
  source: string,
  name: string,
  body: string | null,
): string {
  const header = `[mcp_servers.${name}]`;
  const lines = source.length > 0 ? source.split("\n") : [];
  assertNoInlineInParentForm(lines, name);
  const spliced = removeBlock(lines, name);
  if (body === null) return spliced.join("\n");
  return appendBlock(spliced, header, body).join("\n");
}

/**
 * Does `line` open the `[mcp_servers.<name>]` table, tolerating TOML-legal
 * variants a hand-authored config might use: a quoted key segment
 * (`[mcp_servers."drawio"]`) and/or whitespace around the `.` separator
 * (`[mcp_servers . drawio]`)?
 */
function isTargetHeader(line: string, name: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return false;
  const inner = trimmed.slice(1, -1).trim();
  const segments = inner.split(/\s*\.\s*/).map(unquoteTomlKey);
  return (
    segments.length === 2 &&
    segments[0] === "mcp_servers" &&
    segments[1] === name
  );
}

function unquoteTomlKey(segment: string): string {
  const s = segment.trim();
  if (s.length >= 2) {
    const first = s[0];
    const last = s[s.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return s.slice(1, -1);
    }
  }
  return s;
}

/**
 * The inline-in-parent form (`[mcp_servers]` header followed by a bare
 * `<name> = { ... }` assignment) is a different TOML structure from a
 * nested `[mcp_servers.<name>]` table, and this tool's block-splice merge
 * doesn't understand it. Rather than silently corrupt a hand-authored
 * config (e.g. by appending a second, conflicting `drawio` entry), fail
 * loudly and tell the user how to fix it.
 */
function assertNoInlineInParentForm(lines: string[], name: string): void {
  const startIdx = lines.findIndex((line) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return false;
    return trimmed.slice(1, -1).trim() === "mcp_servers";
  });
  if (startIdx === -1) return;

  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const assignment = new RegExp(
    `^\\s*(?:${escapedName}|"${escapedName}"|'${escapedName}')\\s*=`,
  );
  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*\[[A-Za-z_"]/.test(line)) break;
    if (assignment.test(line)) {
      throw new Error(
        `Found "${name}" defined inline under [mcp_servers] (e.g. \`${name} = { ... }\`), ` +
          `which this tool doesn't support. Please move the entry into a ` +
          `[mcp_servers.${name}] table, or use --config-path to point at a different config file.`,
      );
    }
  }
}

function removeBlock(lines: string[], name: string): string[] {
  const startIdx = lines.findIndex((line) => isTargetHeader(line, name));
  if (startIdx === -1) return lines;

  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (/^\s*\[[A-Za-z_"]/.test(lines[i])) {
      endIdx = i;
      break;
    }
  }
  // Drop trailing blank lines that belong to the removed block.
  while (endIdx > startIdx + 1 && lines[endIdx - 1].trim() === "") {
    endIdx--;
  }

  const before = lines.slice(0, startIdx);
  // Drop the single blank separator line preceding the block, if any, so
  // removal doesn't leave a double blank line behind.
  if (before.length > 0 && before[before.length - 1].trim() === "") {
    before.pop();
  }
  const after = lines.slice(endIdx);
  return [...before, ...after];
}

function appendBlock(lines: string[], header: string, body: string): string[] {
  const bodyLines = body.split("\n");
  // Drop the single trailing empty element representing the file's final
  // newline, so we don't accumulate blank lines across repeated merges.
  const trimmed =
    lines.length > 0 && lines[lines.length - 1] === ""
      ? lines.slice(0, -1)
      : lines;
  if (trimmed.length === 0) return [header, ...bodyLines, ""];
  return [...trimmed, "", header, ...bodyLines, ""];
}
