# Vendor `drawio-mcp-compat` sources into `drawio-mcp-server`

## Problem

`packages/drawio-mcp-server` is published to npm as a CLI. The recent
compat work introduced a `workspace:*` dependency on the private
`drawio-mcp-compat` package:

```json
// packages/drawio-mcp-server/package.json
"dependencies": {
  "drawio-mcp-compat": "workspace:*"
}
```

At publish time `pnpm publish` rewrites `workspace:*` to the concrete
version (`0.1.0`). Because `drawio-mcp-compat` is `"private": true` and
never published, downstream `npm install drawio-mcp-server` fails to
resolve the dependency.

The pre-compat convention avoided any workspace dep from the server
package for exactly this reason.

## Goal

Restore npm-publishability of `drawio-mcp-server` without giving up the
shared compat types/utilities. Keep the plugin's consumption pattern
unchanged (plugin is bundled by wxt, workspace dep is fine there).

Chosen approach: **vendor the compat source into the server at build
time** via a pre-`tsc` copy step. Compat package stays canonical for the
plugin; server sees compat as local sources under `src/vendored/compat`.

Alternatives considered and rejected:

- **B1 – include compat via tsc `include` + relative import.** Forces
  `rootDir` to the workspace parent, which shifts every output path one
  level deeper. Requires updates to `bin`, `files`, build scripts that
  `cp` into `build/plugin/`, jest paths, `dev:server` node path, and any
  `__dirname` assumption. Solvable but the cascade is fragile.
- **A – publish compat as its own npm package.** Adds release
  coordination and an extra published surface for ~50 lines of pure
  functions.
- **B (bundler) – tsup/esbuild inline compat into `build/index.js`.**
  Introduces a bundler to a project that today uses plain `tsc` and
  ships multiple entrypoints (`bin`, `prefetch-assets`).
- **C (raw vendor committed to repo).** Duplicates code in git,
  requires manual sync when compat changes.

## Non-goals

- Changing the plugin's compat consumption.
- Changing the compat package itself.
- Adding a bundler to the server build.
- Publishing `drawio-mcp-compat` to npm.

## Design

### Source layout

```
packages/
  drawio-mcp-compat/
    src/index.ts                # canonical, edited here only
  drawio-mcp-server/
    src/
      drawio-compat/matrix.ts   # imports from "../vendored/compat/index.js"
      vendored/compat/          # generated pre-build, gitignored
        index.ts
```

Consumers:

- `packages/drawio-mcp-plugin` — continues to import `"drawio-mcp-compat"`
  via `workspace:*`. Bundled by wxt, no runtime resolution issue.
- `packages/drawio-mcp-server` — imports from `../vendored/compat/…`.
  Zero runtime dep on `drawio-mcp-compat`.

### Build step

Add a `vendor:compat` script to
`packages/drawio-mcp-server/package.json`:

```json
"scripts": {
  "vendor:compat": "rimraf src/vendored/compat && mkdir -p src/vendored && cp -r ../drawio-mcp-compat/src src/vendored/compat",
  "build": "pnpm run vendor:compat && rimraf build && tsc && mkdir -p build/plugin && cp node_modules/drawio-mcp-plugin/dist/mcp-plugin.js build/plugin/mcp-plugin.js",
  "dev": "pnpm run vendor:compat && tsc --watch",
  "dev:server": "pnpm run vendor:compat && concurrently --kill-others-on-fail -n tsc,node -c cyan,green \"tsc --watch --preserveWatchOutput\" \"node --watch --watch-path=build build/index.js\""
}
```

Rationale for prepending to `dev` targets: watch mode does not detect
files that do not yet exist. Running `vendor:compat` once at start
guarantees `src/vendored/compat/index.ts` is present before `tsc --watch`
scans the tree.

### Dependency removal

Remove from `packages/drawio-mcp-server/package.json`:

```diff
-  "drawio-mcp-compat": "workspace:*",
```

### Import rewrite

`packages/drawio-mcp-server/src/drawio-compat/matrix.ts`:

```diff
-import { isInRange, parseVersion, type VersionRange } from "drawio-mcp-compat";
+import {
+  isInRange,
+  parseVersion,
+  type VersionRange,
+} from "../vendored/compat/index.js";
```

Only one server file references `drawio-mcp-compat` today.

### .gitignore

Append to `packages/drawio-mcp-server/.gitignore`:

```
src/vendored/
```

Ensures the generated tree never lands in the repo. The canonical copy
remains in `packages/drawio-mcp-compat/src/`.

## Testing

- Existing `pnpm --filter drawio-mcp-server lint`
  (`biome check src/ && tsc --noEmit`) catches a broken import path.
- Existing server tests exercise `src/drawio-compat/matrix.ts`; the
  vendored functions are re-tested transitively.
- No new test infrastructure. If drift is a future concern, add a
  post-build assertion comparing the vendored file's SHA-256 against the
  compat source. Not planned for v1.

## Failure modes

| Scenario | Effect | Mitigation |
| --- | --- | --- |
| Fresh clone, run `tsc` without `build` | Import path missing → clear tsc error | Users run `pnpm build`, which runs `vendor:compat` first |
| Contributor edits `src/vendored/compat/*.ts` | Next `pnpm build` overwrites edit | Gitignore prevents accidental commit; convention: edit in `packages/drawio-mcp-compat` |
| Compat renamed / relocated | Vendor script fails loudly | Same-repo layout is stable; catch at build |

## Impact / files touched

1. `packages/drawio-mcp-server/package.json` — remove workspace dep, add
   `vendor:compat`, prepend to `build`/`dev`/`dev:server`.
2. `packages/drawio-mcp-server/.gitignore` — add `src/vendored/`.
3. `packages/drawio-mcp-server/src/drawio-compat/matrix.ts` — rewrite
   import specifier.

No changes to `drawio-mcp-plugin`, `drawio-mcp-compat`,
`drawio-mcp-extension`, or `drawio-mcp-dev-proxy`.

## Release notes

Reverts the server's `workspace:*` dep on `drawio-mcp-compat` without
undoing any compat work. Enables `pnpm --filter drawio-mcp-server publish`
to succeed against npm.
