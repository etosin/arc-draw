# Vendor `drawio-mcp-compat` into `drawio-mcp-server` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the runtime `workspace:*` dependency from `drawio-mcp-server` on the private `drawio-mcp-compat` package so `pnpm --filter drawio-mcp-server publish` produces an installable npm package, without changing the plugin or introducing a bundler.

**Architecture:** A `vendor:compat` pnpm script copies `packages/drawio-mcp-compat/src/*` into `packages/drawio-mcp-server/src/vendored/compat/*` immediately before every `tsc` invocation (build + dev). The vendored directory is gitignored, so the canonical source stays in the compat package. The single server file that imports `drawio-mcp-compat` switches to a relative import into the vendored copy. Plugin consumption is untouched.

**Tech Stack:** TypeScript, pnpm workspaces, Node ≥20, `rimraf`, `cp` (POSIX), Biome for lint, jest for tests.

## Global Constraints

- `packages/drawio-mcp-server` MUST NOT declare `drawio-mcp-compat` as a runtime dependency.
- `packages/drawio-mcp-plugin` and `packages/drawio-mcp-compat` MUST remain unchanged in this plan.
- `tsconfig.json` `rootDir` stays `src`; `outDir` stays `build`; `bin` stays `build/index.js`.
- No new dev dependencies (`rimraf` is already available via existing scripts; `cp`/`mkdir` are POSIX).
- Stdout discipline rules from `AGENTS.md` still apply — no new `console.*` usage.
- Commit authorship convention: author `claude-code-anthropic-opus-4-7 <agent+claude-code-anthropic-opus-4-7@opencode.ai>`, co-author `Ladislav Gazo <ladislav.gazo@gmail.com>`.

---

## File Structure

- Create: `packages/drawio-mcp-server/.gitignore` — one line: `src/vendored/`. Local ignore so the generated directory never lands in git.
- Modify: `packages/drawio-mcp-server/package.json` — remove `drawio-mcp-compat` dep, add `vendor:compat` script, prepend it to `build`, `dev`, `dev:server`.
- Modify: `packages/drawio-mcp-server/src/drawio-compat/matrix.ts` — swap import specifier from `drawio-mcp-compat` to the vendored relative path.
- Generated (gitignored): `packages/drawio-mcp-server/src/vendored/compat/index.ts` — byte copy of `packages/drawio-mcp-compat/src/index.ts`, refreshed on every build.

No files in `packages/drawio-mcp-plugin`, `packages/drawio-mcp-compat`, `packages/drawio-mcp-extension`, or `packages/drawio-mcp-dev-proxy` change.

---

## Task 1: Add the local `.gitignore` for the vendored directory

**Files:**
- Create: `packages/drawio-mcp-server/.gitignore`

**Interfaces:**
- Consumes: nothing.
- Produces: git-level protection so subsequent tasks that generate `src/vendored/compat/*.ts` do not stage those files. Later tasks assume this ignore is already in place.

- [ ] **Step 1: Create the `.gitignore` file with exactly this content**

```
src/vendored/
```

- [ ] **Step 2: Verify git honors it**

Run:
```bash
mkdir -p packages/drawio-mcp-server/src/vendored/compat
touch packages/drawio-mcp-server/src/vendored/compat/index.ts
git status --porcelain packages/drawio-mcp-server/src/vendored/
```

Expected output: no lines (the directory is ignored).

- [ ] **Step 3: Clean up the probe**

Run:
```bash
rm -rf packages/drawio-mcp-server/src/vendored
```

- [ ] **Step 4: Commit**

```bash
git add packages/drawio-mcp-server/.gitignore
git commit --author="claude-code-anthropic-opus-4-7 <agent+claude-code-anthropic-opus-4-7@opencode.ai>" -m "$(cat <<'EOF'
chore(server): ignore vendored compat dir

Prep for build-time vendoring of drawio-mcp-compat sources into
packages/drawio-mcp-server/src/vendored/compat.

Co-Authored-By: Ladislav Gazo <ladislav.gazo@gmail.com>
EOF
)"
```

---

## Task 2: Add the `vendor:compat` script and wire it into build + dev

**Files:**
- Modify: `packages/drawio-mcp-server/package.json`

**Interfaces:**
- Consumes: the `.gitignore` from Task 1 (prevents accidental commits of generated files).
- Produces: `pnpm --filter drawio-mcp-server vendor:compat` regenerates `packages/drawio-mcp-server/src/vendored/compat/` from `packages/drawio-mcp-compat/src/`. `pnpm --filter drawio-mcp-server build` runs it before `tsc`. `dev` and `dev:server` prepend it too, so tsc's watch mode sees the vendored files at startup. Task 3 relies on this script existing and the file `src/vendored/compat/index.ts` being present after `vendor:compat` runs.

- [ ] **Step 1: Open `packages/drawio-mcp-server/package.json` and edit the `scripts` section**

Replace the existing `build`, `dev`, `dev:server` values and add a new `vendor:compat` entry. After the edit the affected lines must read exactly:

```json
    "vendor:compat": "rimraf src/vendored/compat && mkdir -p src/vendored && cp -R ../drawio-mcp-compat/src src/vendored/compat",
    "build": "pnpm run vendor:compat && rimraf build && tsc && mkdir -p build/plugin && cp node_modules/drawio-mcp-plugin/dist/mcp-plugin.js build/plugin/mcp-plugin.js",
    "dev": "pnpm run vendor:compat && tsc --watch",
    "dev:server": "pnpm run vendor:compat && concurrently --kill-others-on-fail -n tsc,node -c cyan,green \"tsc --watch --preserveWatchOutput\" \"node --watch --watch-path=build build/index.js\"",
```

Leave every other script (`ci`, `inspect`, `prepublishOnly`, `lint`, `lint:fix`, `prefetch-assets`, `format`, `format:check`, `test:*`, `clean`, `download-assets`, `start`) unchanged.

- [ ] **Step 2: Remove the `drawio-mcp-compat` entry from `dependencies`**

Delete the line:

```json
    "drawio-mcp-compat": "workspace:*",
```

from the `dependencies` block. Keep every other dependency intact.

- [ ] **Step 3: Update the lockfile**

Run:
```bash
pnpm install --filter drawio-mcp-server...
```

Expected: `pnpm-lock.yaml` updates to drop the workspace edge from `drawio-mcp-server` to `drawio-mcp-compat`. No other package's dependency graph changes. Command exits 0.

- [ ] **Step 4: Verify the script produces the vendored file**

Run:
```bash
pnpm --filter drawio-mcp-server vendor:compat
test -f packages/drawio-mcp-server/src/vendored/compat/index.ts && echo VENDORED_OK
diff -q packages/drawio-mcp-compat/src/index.ts packages/drawio-mcp-server/src/vendored/compat/index.ts
```

Expected output:
```
VENDORED_OK
```
(with `diff -q` printing nothing — files identical).

- [ ] **Step 5: Confirm the generated dir is still ignored**

Run:
```bash
git status --porcelain packages/drawio-mcp-server/src/vendored/
```

Expected output: no lines.

- [ ] **Step 6: Commit**

```bash
git add packages/drawio-mcp-server/package.json pnpm-lock.yaml
git commit --author="claude-code-anthropic-opus-4-7 <agent+claude-code-anthropic-opus-4-7@opencode.ai>" -m "$(cat <<'EOF'
build(server): vendor drawio-mcp-compat sources pre-tsc

Adds vendor:compat script that copies packages/drawio-mcp-compat/src
into packages/drawio-mcp-server/src/vendored/compat, and prepends it
to build, dev, and dev:server. Removes the workspace runtime dep so
the published npm package resolves without drawio-mcp-compat.

Co-Authored-By: Ladislav Gazo <ladislav.gazo@gmail.com>
EOF
)"
```

---

## Task 3: Switch `matrix.ts` to the vendored import and verify the full build

**Files:**
- Modify: `packages/drawio-mcp-server/src/drawio-compat/matrix.ts`

**Interfaces:**
- Consumes: `packages/drawio-mcp-server/src/vendored/compat/index.ts` (created by Task 2's `vendor:compat` script). Exposes the same three symbols as the compat package: `parseVersion(raw: string): Semver | null`, `isInRange(v: Semver, r: VersionRange): boolean`, and `type VersionRange = { readonly min: string; readonly maxExclusive: string | null }`.
- Produces: unchanged public API for `matrix.ts` — `ServerCompatMatrix`, `SERVER_COMPAT_MATRIX`, and `versionInWindow(version: string, matrix: ServerCompatMatrix): boolean`. No callers change.

- [ ] **Step 1: Confirm this is the only server-side reference to `drawio-mcp-compat`**

Run:
```bash
grep -rn "drawio-mcp-compat" packages/drawio-mcp-server/src packages/drawio-mcp-server/package.json
```

Expected output: exactly one line matching
`packages/drawio-mcp-server/src/drawio-compat/matrix.ts:1:import { isInRange, parseVersion, type VersionRange } from "drawio-mcp-compat";`
and nothing else. If any other line appears, stop and report — the plan assumed a single import site.

- [ ] **Step 2: Rewrite the import in `packages/drawio-mcp-server/src/drawio-compat/matrix.ts`**

Change line 1 from:

```ts
import { isInRange, parseVersion, type VersionRange } from "drawio-mcp-compat";
```

to:

```ts
import {
  isInRange,
  parseVersion,
  type VersionRange,
} from "../vendored/compat/index.js";
```

Leave the rest of the file untouched.

- [ ] **Step 3: Ensure the vendored copy is present, then run typecheck + lint**

Run:
```bash
pnpm --filter drawio-mcp-server vendor:compat
pnpm --filter drawio-mcp-server lint
```

Expected: `lint` runs `biome check src/ && tsc --noEmit` and exits 0. Any error means the import path is wrong or Biome dislikes the multi-line import shape — fix before continuing.

- [ ] **Step 4: Run the full build and confirm output layout**

Run:
```bash
pnpm --filter drawio-mcp-server build
test -f packages/drawio-mcp-server/build/index.js && echo BIN_OK
test -f packages/drawio-mcp-server/build/drawio-compat/matrix.js && echo MATRIX_OK
test -f packages/drawio-mcp-server/build/vendored/compat/index.js && echo VENDORED_JS_OK
grep -q 'drawio-mcp-compat' packages/drawio-mcp-server/build/drawio-compat/matrix.js && echo LEAK_FOUND || echo NO_LEAK
```

Expected output:
```
BIN_OK
MATRIX_OK
VENDORED_JS_OK
NO_LEAK
```

The `NO_LEAK` line confirms tsc emitted a relative import into `../vendored/compat/index.js`, not the package specifier.

- [ ] **Step 5: Run the server test suite**

Run:
```bash
pnpm --filter drawio-mcp-server test
```

Expected: all tests pass. Failures here mean either the vendored symbols do not match the previous ones (unlikely — same file) or an unrelated regression sneaked in — investigate.

- [ ] **Step 6: Confirm the published package layout has no dangling dep**

Run:
```bash
DEST=/tmp/claude-1000/-home-eldzi-development-practical-architect-2-drawio-mcp-server/69d5ee90-c6a7-4144-852f-ecd1f27cca9d/scratchpad
(cd packages/drawio-mcp-server && pnpm pack --pack-destination "$DEST")
TARBALL=$(ls -1t "$DEST"/drawio-mcp-server-*.tgz | head -1)
tar -xzOf "$TARBALL" package/package.json | grep -E '"(drawio-mcp-compat|dependencies)"'
rm "$TARBALL"
```

(`pnpm --filter … pack --pack-destination` is rejected by pnpm; use `cd` + plain `pnpm pack`.)

Expected: the extracted `package.json` snippet shows the `dependencies` block but no `drawio-mcp-compat` line. If `drawio-mcp-compat` still appears, Task 2's dep removal was reverted — fix before commit.

- [ ] **Step 7: Commit**

```bash
git add packages/drawio-mcp-server/src/drawio-compat/matrix.ts
git commit --author="claude-code-anthropic-opus-4-7 <agent+claude-code-anthropic-opus-4-7@opencode.ai>" -m "$(cat <<'EOF'
refactor(server): import compat helpers from vendored copy

Switches drawio-compat/matrix.ts to the build-time vendored copy at
src/vendored/compat/index.js so the compiled JS carries no reference
to the drawio-mcp-compat workspace package.

Co-Authored-By: Ladislav Gazo <ladislav.gazo@gmail.com>
EOF
)"
```

---

## Self-Review

- **Spec coverage:** every spec section is implemented — Task 1 covers `.gitignore`, Task 2 covers the `vendor:compat` script + dependency removal + all three script prepends, Task 3 covers the import rewrite. Plugin, compat, extension, dev-proxy remain untouched (matches the spec's non-goals).
- **No placeholders:** every code block is complete; commands include expected output; commit messages are ready to paste.
- **Type consistency:** the vendored `index.ts` is a byte copy of the compat source, so `parseVersion`, `isInRange`, and `VersionRange` keep identical signatures. `matrix.ts`'s exported API (`ServerCompatMatrix`, `SERVER_COMPAT_MATRIX`, `versionInWindow`) is unchanged.
- **Failure-mode coverage:** Task 2 asserts the vendor script emits the file and the ignore still holds; Task 3 asserts `matrix.js` contains no residual `drawio-mcp-compat` string and the packed tarball's `package.json` no longer lists the dep — the two failure modes named in the spec.
