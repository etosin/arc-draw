# Releasing

How to cut a release of the Draw.io MCP monorepo. Version numbers, tagging, and what each CI workflow expects.

## Packages and version coupling

| Package | Current version | Published where |
|---|---|---|
| `drawio-mcp-server` | `2.3.0` | npm |
| `drawio-mcp-extension` | `2.3.0` | Chrome Web Store / AMO (zips built by CI) |
| `drawio-mcp-plugin` | `2.3.0` | not published; consumed by server + extension builds |
| `drawio-mcp-compat` | `0.1.0` | not published; vendored into server builds |
| `drawio-mcp-dev-proxy` | `1.0.0` | not published; dev-only |
| `drawio-mcp-claude-plugin` | `0.2.0` | Claude Code marketplace (this repo) |

The monorepo root (`drawio-mcp`, `2.1.0`) is `private: true` and never published.

### Version coupling rules

- **`drawio-mcp-claude-plugin` and `.claude-plugin/marketplace.json` share a version.** Bump `packages/drawio-mcp-claude-plugin/.claude-plugin/plugin.json` and the `plugins[0].version` entry in `.claude-plugin/marketplace.json` **together** in the same commit. They describe the same plugin and Claude Code reads the marketplace manifest as the source users pin against. The plugin version is independent of the server version — bump it when the plugin's manifest, slash commands, or marketplace metadata change, not on every server release.
- **The `install` subcommand ships with `drawio-mcp-server` itself.** There is no separate install release; bumping the server version publishes the current install code alongside it.
- **`drawio-mcp-plugin` and `drawio-mcp-compat` version-bump alongside the server** when their exported behavior changes, since the server build embeds their `dist/` output. Keep them in lockstep with the server's minor/patch digit.
- **The server's `VERSION` fallback constant** in `packages/drawio-mcp-server/src/index.ts` (`const VERSION = process.env.npm_package_version ?? "…"`), bump its literal to the new server version in the same commit — it is what the server prints and reports when `npm_package_version` is absent.

## Tagging convention

- Server releases are tagged `vX.Y.Z` (existing tags: `v1.4.0` … `v2.3.0` once tagged). The tag drives the GitHub Release, which triggers the publish workflows (below).
- Package-scoped tags (`drawio-mcp-server-vX.Y.Z` etc.) are not currently used. If npm tags ever drift from the repo tag, introduce package-scoped tags then — do not pre-create them.
- Plugin-only changes: bump the plugin + marketplace versions, commit, tag `drawio-mcp-claude-plugin-vX.Y.Z` if you want a pin-point for the marketplace, and push. A repo-wide `vX.Y.Z` tag is only needed when the server itself releases.

## Release procedure

1. **Cut a branch is not required**; releases are cut from `main`.
2. **Bump versions** per the coupling rules above. Update the extension's `package.json` version if the extension changed (its zips are named `drawio-mcp-extension-<version>-*.zip` by CI).
3. **Update the README "Key Highlights"** — new user-facing features get a short bullet with a `![vX.Y.0](https://img.shields.io/badge/vX.Y.0-blue)` version badge. That section is the release notes; no separate release-notes file is kept. Keep exactly two versions of the chips in the section — the one being released and the one before.
4. **Overwrite the server package's README** with the root one (`cp README.md packages/drawio-mcp-server/README.md`) — the server package README is what the npm registry displays. Check the copy for relative links that only resolve from the repo root and fix or drop them.
5. **Commit** the version bumps + README highlights + server README sync.
6. **Check the final package works** (before tagging):
   1. Create the tarball npm would publish:
      ```sh
      cd packages/drawio-mcp-server
      pnpm pack
      ```
   2. Simulate a fresh install in a temp dir:
      ```sh
      cd /tmp && rm -rf test-install && mkdir test-install && cd test-install
      npm install /path/to/drawio-mcp-server-X.Y.Z.tgz
      ```
   3. Run it and confirm it reports the new version:
      ```sh
      npx drawio-mcp-server --editor
      ```
   4. Clean up the tarball and the temp dir when done.
7. **Tag and push**: `git tag vX.Y.Z && git push origin main vX.Y.Z`.
8. **Create the GitHub Release** for tag `vX.Y.Z`, summarizing the highlights from the README section.
9. **Check the built extension loads** once `extension-publish.yml` produces the zips: unpack, import into Chrome/Firefox, and confirm it loads.

### What CI publishes when

| Workflow | Trigger | What it does |
|---|---|---|
| `server-publish.yml` | GitHub Release **created** (paths: `packages/drawio-mcp-server/**` or the workflow file), plus manual `workflow_dispatch` | Builds compat → plugin → dev-proxy → server (order matters: compat's `dist/` must exist before the plugin build), then `pnpm --filter drawio-mcp-server publish --provenance --access public` to npm. **Requires the GitHub Release to exist** — a plain tag push does not publish npm. |
| `extension-publish.yml` | GitHub Release **created** (no path filter) | Builds compat → plugin, builds and zips the extension for chrome and firefox. |
| `extension-package.yml` | Manual only | Builds + zips the extension and uploads the artifacts (reads the extension's own `package.json` version for artifact naming). |
| `claude-plugin-ci.yml` | Push/PR to `main` touching `packages/drawio-mcp-claude-plugin/**` or `.claude-plugin/**` | Audit, lint, and test the plugin package. Not a publish workflow — the marketplace serves the plugin straight from the repo, so there is no publish step. |

Notes:

- Because both publish workflows fire on `release: created`, one Release produces an npm publish **and** an extension zip build. That is the intended behavior for a repo-wide release.
- A plugin-only bump does not need a GitHub Release — the marketplace reads from `main`. Run `claude-plugin-ci` green and push.
- Server publishes need `NPM_TOKEN` configured; provenance requires the release-based OIDC flow (`id-token: write`), which is why publishing bypasses the CLI.