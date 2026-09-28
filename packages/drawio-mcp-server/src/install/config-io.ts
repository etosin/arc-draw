import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";
import { dirname, basename, join } from "node:path";
import { createPatch } from "diff";

export async function atomicWrite(
  target: string,
  contents: string,
): Promise<void> {
  const dir = dirname(target);
  const tmp = join(
    dir,
    `.${basename(target)}.${process.pid}.${Date.now()}.tmp`,
  );
  await fs.writeFile(tmp, contents, "utf8");
  await fs.rename(tmp, target);
}

export async function ensureBackup(target: string): Promise<string | null> {
  if (!existsSync(target)) return null;
  const bak = `${target}.bak-${Date.now()}`;
  const contents = await fs.readFile(target, "utf8");
  await fs.writeFile(bak, contents, "utf8");
  return bak;
}

export function unifiedDiff(
  oldText: string,
  newText: string,
  label: string,
): string {
  return createPatch(label, oldText, newText, "", "", { context: 3 });
}
