import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import {
  mkdtempSync,
  readFileSync,
  existsSync,
  writeFileSync,
  rmSync,
  readdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { atomicWrite, ensureBackup, unifiedDiff } from "./config-io.js";

describe("config-io", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "drawio-install-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("atomicWrite writes contents and leaves no tmp file", async () => {
    const target = join(dir, "cfg.json");
    await atomicWrite(target, '{\n  "a": 1\n}\n');
    expect(readFileSync(target, "utf8")).toBe('{\n  "a": 1\n}\n');
    expect(readdirSync(dir).filter((f) => f.startsWith(".cfg.json."))).toEqual(
      [],
    );
  });

  it("ensureBackup copies once and returns backup path", async () => {
    const target = join(dir, "cfg.json");
    writeFileSync(target, "orig");
    const bak = await ensureBackup(target);
    expect(bak).toMatch(/cfg\.json\.bak-\d+$/);
    expect(readFileSync(bak!, "utf8")).toBe("orig");
  });

  it("ensureBackup returns null when file missing", async () => {
    expect(await ensureBackup(join(dir, "nope.json"))).toBeNull();
  });

  it("unifiedDiff produces a diff header referencing the label", () => {
    const d = unifiedDiff("a\n", "b\n", "cfg.json");
    expect(d).toContain("--- cfg.json");
    expect(d).toContain("+++ cfg.json");
    expect(d).toContain("-a");
    expect(d).toContain("+b");
  });
});
