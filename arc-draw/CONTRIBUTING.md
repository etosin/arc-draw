# Contributing to ARC-DRAW

Thanks for being here. ARC-DRAW gets better every time an SAP practitioner says *"that's not how we'd draw it."* That feedback **is** a contribution, even if you never touch the code.

By contributing you agree that your contribution is licensed under the project's [MIT license](./LICENSE.md).

## Ways to contribute

### 1. Report a diagram the agent got wrong (no code, 5 minutes)

The single most useful thing you can do. Open a [**Diagram feedback**](../../issues/new?template=diagram-feedback.yml) issue with:

- the prompt you used,
- a screenshot or the exported `.drawio` file,
- what is wrong, and what the SAP guideline says it should look like (a link to the guideline page is ideal),
- your MCP client and model.

**Remove client names, system IDs, hostnames and anything confidential before sharing a diagram.**

### 2. Propose a pattern (no code)

Patterns are reusable architectures the agent can mirror: AS-IS/TO-BE, BTP inbound, side-by-side extension, event-driven with Event Mesh… If you draw the same shape every month, it probably belongs here. Open a [**Pattern proposal**](../../issues/new?template=pattern-proposal.yml) describing the components, the flows and a reference diagram.

### 3. Improve the grammar

The drawing rules live in [`constitution/sap-btp-diagram.md`](./constitution/sap-btp-diagram.md), with a short header in [`constitution/instructions-preamble.md`](./constitution/instructions-preamble.md) and on-demand reference material in `packages/drawio-mcp-server/src/sap-reference.ts`. If a rule is missing, vague, or contradicts the [SAP BTP Solution Diagram guideline](https://sap.github.io/btp-solution-diagrams), open a PR and **cite the guideline section** you rely on.

Edit the Markdown, never the generated `sap-constitution.ts`. The build regenerates it, and CI fails if it is stale.

### 4. Write code

Start with issues labelled [`good first issue`](../../issues?q=is%3Aopen+label%3A%22good+first+issue%22) or [`help wanted`](../../issues?q=is%3Aopen+label%3A%22help+wanted%22). For anything bigger than a bug fix, **open an issue first** so we can agree on the approach before you invest the time. Please keep PRs small and focused: one logical change each.

### 5. Test with other MCP clients

We have verified Claude Code. If you get ARC-DRAW working in Cursor, Copilot, Codex, Zed or anything else, a short setup guide is a welcome PR.

## What belongs here and what belongs upstream

ARC-DRAW is a fork of [drawio-mcp-server](https://github.com/lgazo/drawio-mcp-server) by Ladislav Gazo. To keep the fork easy to maintain:

- **SAP-specific work** (icons, grammar, patterns, SAP tools): contribute **here**.
- **Generic draw.io / MCP work** (transport, editor, extension, non-SAP tools, install hosts): please contribute it **upstream**. We merge upstream releases regularly, so everyone benefits.

When in doubt, open an issue and ask. The procedure for merging upstream releases is in [`docs/SAP-INTEGRATION.md`](./docs/SAP-INTEGRATION.md).

## Development setup

```bash
git clone https://github.com/etosin/arc-draw.git
cd arc-draw
pnpm install --frozen-lockfile     # corepack enable, or npm i -g pnpm@10
pnpm -r build
pnpm -r test
pnpm --filter drawio-mcp-server lint
```

| Task | Command |
|---|---|
| Build everything | `pnpm -r build` |
| Build only the server | `pnpm --filter drawio-mcp-server build` |
| Build only the plugin (after icon changes) | `pnpm --filter drawio-mcp-plugin build` |
| Regenerate the constitution | `node tools/build-sap-constitution.cjs` |
| Check the constitution is up to date | `node tools/build-sap-constitution.cjs --check` |
| Run the server with the built-in editor | `node packages/drawio-mcp-server/build/index.js --editor` |

**Windows:** build and lint work from PowerShell. `pnpm test` uses POSIX `NODE_OPTIONS=… jest` syntax, so run it from Git Bash or WSL (or set `npm_config_script_shell` to Git's `bash.exe`). A few inherited upstream tests assume Linux/macOS paths and signals and fail on Windows; CI runs on Linux.

Read [`AGENTS.md`](./AGENTS.md) before touching the server. In short: **nothing may write to stdout** except the MCP transport, or strict clients will reject the server.

### Refreshing the SAP icon set

When SAP publishes new BTP icons, take the draw.io libraries from [SAP/btp-solution-diagrams](https://github.com/SAP/btp-solution-diagrams) and regenerate. **Pass every source library** or a category is dropped:

```bash
node tools/build-sap-catalog.cjs sap-all-M.xml sap-ai-M.xml
pnpm --filter drawio-mcp-plugin build
pnpm --filter drawio-mcp-plugin test    # update the expected counts if icons were added
```

## Pull request checklist

- [ ] One logical change per PR
- [ ] `pnpm -r build` and `pnpm -r test` pass (on Windows: the SAP suites at least)
- [ ] New behaviour has a test, or the PR explains why not
- [ ] Grammar changes cite the SAP guideline section
- [ ] No client data, credentials or internal system names anywhere in the diff

## Code of conduct

This project follows the [Code of Conduct](./CODE_OF_CONDUCT.md). Be kind; we're all here to draw better diagrams.

## Questions

Use [Discussions](../../discussions) for questions and ideas, and issues for bugs and concrete proposals.
