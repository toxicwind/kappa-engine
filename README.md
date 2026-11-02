<div align="center">

<img src="docs/hero.webp" alt="kappa" width="100%"/>

[![License: MIT](https://img.shields.io/badge/license-MIT-green?style=for-the-badge)](LICENSE)
[![Bun](https://img.shields.io/badge/bun-latest-blue?style=for-the-badge)](https://bun.sh)
[![TypeScript](https://img.shields.io/badge/typescript-latest-blue?style=for-the-badge)](https://typescriptlang.org)

# kappa-engine

**The terminal-native AI coding agent.** A real-time TUI, a headless server, editor
extensions, and a model-routing gateway — one codebase, built on [Bun](https://bun.sh).

</div>

---

## What it is

`kappa-engine` produces the `kappa` CLI: a fast, keyboard-first agent that reads
your repo, talks to 100+ model providers through [Kilo Gateway](https://kilo.ai/gateway)
(or your own OpenAI/Anthropic/Gemini keys), and writes code — commit by commit, with a
side you can read and a git-write workflow you can approve.

It is a fork of [Kilo Code](https://github.com/Kilo-Org/kilo-code) (itself a fork of
[opencode](https://github.com/sst/opencode)). That lineage shows in the monorepo's
`@opencode-ai/*` package scopes and in `kappacode_*change` markers — kappa extends the
upstream on top of it rather than diverging blindly.

Everything runs where you're already working:

| Surface          | Entry point                                      |
| ---------------- | ------------------------------------------------ |
| Terminal TUI     | `kappa` (default command)                        |
| One-shot runs    | `kappa run [message..]`                          |
| Headless server  | `kappa serve`                                    |
| Agent-to-client  | `kappa acp` (Agent Client Protocol)              |
| Editor           | VS Code + JetBrains extensions in `packages/`    |
| Model gateway    | `kappa auth login` → Kilo Gateway                |

---

## Why fork

Upstream and the fork share the same core ideas — before touching a file, inspect the
repo; attach files, tools, MCP servers; stream every token. The fork layers on
resilience and estate-specific muscle that upstream deliberately keeps out:

- **Flail Gate** — model-agnostic loop detection. At runtime it catches tool-call
  loops, "narrated but didn't do it" turns, and re-derivations of already-rejected
  reasoning. Config: `~/.config/kappa/flail-gate/gate.json`.
- **Browser-fingerprint HTTP transport** — reach Cloudflare-guarded providers by
  forwarding with a Chrome-aligned header set. Opt in per provider:
  `"http": { "fingerprint": "chrome" }`.
- **Multi-process runtime** — the CLI forks a worker for the TUI and a separate
  process tree for sandboxed tool execution, so a hung tool never freezes the
  interface.
- **Vendored rendering stack** — the terminal renderer (`@opentui/*`) is vendored
  into `packages/vendor/` and prebuilt to `dist/`, decoupling TUI rendering from
  upstream drift.

---

## Architecture

A Bun-workspaces monorepo. Each package owns its concern; path layout matters more
than names (upstream scopes are retained deliberately).

### Core runtime

| Package                                        | Scope                       | What it does                                   |
| ---------------------------------------------- | --------------------------- | ---------------------------------------------- |
| [`packages/cli`](packages/cli)                 | `@kappacode/cli`            | The `kappa` binary: TUI, commands, entrypoint  |
| [`packages/core`](packages/core)               | `@opencode-ai/core`         | Providers, plugins, config, sessions, MCP, models |
| [`packages/tui`](packages/tui)                 | `@opencode-ai/tui`          | SolidJS terminal UI                            |
| [`packages/server`](packages/server)           | `@opencode-ai/server`       | Headless HTTP server (`kappa serve`)           |
| [`packages/kappa-gateway`](packages/kappa-gateway) | `@kappacode/kappa-gateway` | Kilo Gateway model routing + account client     |

### Model & data

| Package                                        | Scope                        | What it does                      |
| ---------------------------------------------- | ---------------------------- | --------------------------------- |
| [`packages/kappa-indexing`](packages/kappa-indexing) | `@kappacode/kappa-indexing` | Code indexing + embeddings     |
| [`packages/kappa-memory`](packages/kappa-memory)     | `@kappacode/kappa-memory`   | Session/memory storage          |
| [`packages/kappa-telemetry`](packages/kappa-telemetry) | `@kappacode/kappa-telemetry` | Telemetry                     |
| [`packages/kappa-sandbox`](packages/kappa-sandbox)   | `@kappacode/sandbox`        | Sandboxed tool/mutation worker |
| [`packages/sdk`](packages/sdk) (`sdk-next`)    | SDK (`@opencode-ai/sdk-next`) | Types + client for other surfaces |

### Editors, UI, tooling

| Package                                              | Scope                       | What it does                          |
| ---------------------------------------------------- | --------------------------- | ------------------------------------- |
| [`packages/kappa-vscode`](packages/kappa-vscode)     | `kappa-code`                | VS Code extension                    |
| [`packages/kappa-jetbrains`](packages/kappa-jetbrains) | `@kappacode/kappa-jetbrains` | JetBrains plugin                   |
| [`packages/kappa-console`](packages/kappa-console)   | `@kappacode/kappa-console`  | Settings UI (providers, keybindings) |
| [`packages/kappa-docs`](packages/kappa-docs)         | `@kappacode/kappa-docs`     | Docs site                             |
| [`packages/kappa-web-ui`](packages/kappa-web-ui)     | `@kappacode/kappa-web-ui`   | Web UI                                |
| [`packages/ui`](packages/ui) · `packages/kappa-ui`   | `@opencode-ai/ui` · `@kappacode/kappa-ui` | Component libraries        |
| [`packages/forge`](packages/forge) · `packages/nativelink` | `@kappacode/forge` · `@kappacode/nativelink` | Build daemon + remote cache |
| [`packages/secretsmith`](packages/secretsmith)       | `secretsmith`               | OS-keyring secret management          |
| [`packages/shims`](packages/shims)                   | `@kappacode/shims`         | git hooks, env fix, prompt units     |

Schema, wire protocol, and config validation live in
[`packages/schema`](packages/schema), [`packages/protocol`](packages/protocol), and
[`packages/config`](packages/config). The vendored renderer is under
[`packages/vendor/@opentui`](packages/vendor/@opentui).

---

## Install & first run

```bash
git clone https://github.com/toxicwind/kappa-engine.git
cd kappa-engine
bun install

# Build the CLI for this platform only (skips bubblewrap).
bun run --cwd packages/cli script/build.ts --single --skip-install

./packages/cli/dist/@kappacode/cli-linux-x64/bin/kappa
```

The first build also prebuilds the vendored `@opentui` packages to `dist/`. If you
invoke `script/build.ts` directly and strike `class extends … not a constructor` or
`@opentui/solid/preload` errors, run the vendor builds first:

```bash
bun run --cwd packages/vendor/@opentui/core build:lib
bun run --cwd packages/vendor/@opentui/keymap build
```

### Log in and pick a model

```bash
kappa auth login          # device auth against Kilo Gateway
kappa models              # list available providers/models
```

Or bring your own keys (OpenAI, Anthropic, Gemini, OpenRouter, …) the same way:
`kappa auth login`.

---

## Using it

```bash
kappa                      # launch the TUI
kappa "fix the TODO in api.ts"
kappa run "summarize this repo" --format json   # headless, machine-readable
kappa serve                # headless server (attach with `kappa attach`)
kappa mcp                  # manage MCP servers
kappa session --resume     # pick a past session
kappa stats                # token usage / cost
kappa profile              # Kilo Gateway account profile
kappa agent create         # referenceable sub-agents
kappa help [cmd]           # full reference
```

### Terminal key ideas

- `@file` fuzzy-attach files; `!cmd` runs a shell command.
- `Tab` toggles Code / Plan agents; `Ctrl+P` command palette; `Ctrl+X` leader key.
- `Escape` stops the current generation; `/undo` / `/redo` step through file changes.

### Code intelligence

The agent drives **Language Server Protocol (LSP)** servers rather than text-search
heuristics, so it navigates and verifies code the way an editor does:

- **LSP navigation** — go-to-definition, find-references, hover/type info,
  document + workspace symbols, go-to-implementation, incoming/outgoing
  call-hierarchy, per-file diagnostics (`lsp` tool).
- **Diagnostics-driven edits** — every `edit`, `write`, and `apply_patch` pulls LSP
  diagnostics for the touched files and surface them (`diagnostics` tool). Errors,
  warnings, and type noise are contracts, not background chatter: they are surfaced
  and resolved at the root.
- **AST-aware edits** — edits go through `apply_patch` (anchored hunks) and tree-aware
  rewrites rather than blanket string replacement. Structural searches use the
  language's own shape (`grep`/`glob` respect syntax and file patterns).

Falls back to plain `grep`/`glob` textual search where no LSP server is configured
for a file type; the model is told a server is required and errors explicitly rather
than silently degrading.

### Config

Config is read from `~/.config/kappa/`, `~/.kappa/`, `~/.kappacode/`, the
`KAPPA_CONFIG_DIR` directory if set, then project `.kappa` / `.kappacode` dirs
(`kappa.jsonc` / `kappa.json`, plus upstream `opencode.*` for back-compat).
Sessions live in `~/.local/share/kappa/kappa-<channel>.db`.

The full `KAPPA_*` env list is in [`.env.example`](.env.example).

> The home-screen news banner is off by default. If you want it:
> `export KAPPA_NEWS_BANNER=1`. The notification dialog stays available either way.

---

## Extending

- **Sub-agents**: `kappa agent create` — reusable, referenceable agents stored as
  files in your project.
- **Plugins**: drop a `.ts` file into `.kappa/plugins/` for event hooks; invoke
  it from the config `plugin` field.
- **Tools**: add `.ts` processors under `.kappa/tools/`.
- **Slash commands**: `/command` files, or register from a plugin.

---

## Building & releasing

```bash
bun run build                        # all targets (bash bin/kmake build)
bun run --cwd packages/cli script/build.ts   # CLI only
bun run typecheck                    # all packages (turbo)

bun run make:nativelink              # via mise kappa-build, remote-cached
```

- Preview builds version as `0.0.0-<branch>-<timestamp>`; pin with `KAPPA_VERSION`
  or bump with `KAPPA_BUMP`.
- The `packages/cli/bin/kappa` wrapper resolves the local compiled artifact before
  global discovery or platform packages.
- Dev builds never fork your session DB — `safeChannelToken()` pins a stable channel.

---

## Contributing

1. Fork → `bun install` → edit in the relevant `packages/*`.
2. Check from that package: `bun run typecheck` and `bun test` — never the root.
3. Open a PR with a conventional-commit title (`type(scope): summary`).

Shared-upstream edits are marked `kappacode_change`; kappa-specific code lives in
`kappacode/`-named paths. See [`AGENTS.md`](AGENTS.md).

---

## License

MIT