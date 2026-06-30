# cli

`@bctrl/cli` — the `bctrl` command for managing BCTRL platform resources from scripts and AI agents.

Translates CLI options/args into authenticated requests against the control-plane v1 REST API. Covers auth, plus CRUD/introspection for spaces, runtimes, runs, files, vault, tools/toolsets, AI models/credentials, browser extensions, and subaccounts. Output supports JSON field projection, `--jq` filtering, and Handlebars `--template`.

## Key entry points

- `bin/bctrl.ts` — Node shebang, delegates to `runtime/main.ts` (`main(argv)`: parse, error handling, exit codes).
- `root.ts` registers all subcommands; `factory.ts` does DI (config, API client, I/O).
- `api/client.ts` — authenticated fetch client (CRUD/upload/streaming).
- `config/config.ts` + `config/auth-store.ts` — token resolution and local auth at `~/.config/bctrl/auth.json` (0o600).
- Commands live under `src/commands/`; shared builders in `src/commands/shared/` (`rest.ts`, `output.ts`, `io.ts`).

## Connects to

Consumes `@bctrl/api-contracts` (built dist/) types; talks to the control-plane API (`https://api.bctrl.ai/v1`, override via `BCTRL_API_URL`).

## Build & test

`pnpm build` | `pnpm dev -- <cmd>` | `pnpm test` (node:test via tsx) | `pnpm typecheck`. `prepack` rebuilds dist/; `bin` points to `dist/bin/bctrl.js`.

## Gotchas

- Rebuild api-contracts dist/ after contract edits — the CLI reads built output, not source.
- Auth file path precedence: `BCTRL_AUTH_FILE` > `BCTRL_CONFIG_DIR` > `$XDG_CONFIG_HOME/bctrl` > `~/.config/bctrl`; env `BCTRL_API_KEY`/token beats the stored file (CI-friendly).
- Field projection and `--jq` are client-side (applied after fetch); streaming uses async iterators with no built-in poll timeout.
