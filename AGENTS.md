# cli

`@bctrl/cli` — the `bctrl` command for managing BCTRL platform resources from scripts and AI agents.

Translates CLI options/args into authenticated requests against the control-plane v1 REST API. Covers the annotated public operations for browsers, sandboxes, tasks, agents, conversations, spaces, files, secrets, tools, and account resources. Output supports JSON field projection, `--jq` filtering, and Handlebars `--template`.

## Key entry points

- `bin/bctrl.ts` — Node shebang, delegates to `runtime/main.ts` (`main(argv)`: parse, error handling, exit codes).
- `root.ts` registers all subcommands; `factory.ts` does DI (config, API client, I/O).
- `api/client.ts` — authenticated fetch client (CRUD/upload/streaming).
- `config/config.ts` + `config/auth-store.ts` — token resolution and local auth at `~/.config/bctrl/auth.json` (0o600).
- `commands/generated.ts` registers the public command tree from `generated/commands.json`; local auth and version commands remain handwritten.
- `commands/shared/request-input.ts` validates the generated JSON Schemas; `catalog.ts` maps operation IDs to generated routes. Do not hardcode REST paths in commands.

## Connects to

Consumes generated OpenAPI types, routes, command schemas, and help from the backend's public API contract; talks to `https://api.bctrl.ai/v1` (override via `BCTRL_API_URL`).

## Build & test

Run application commands in Linux containers: `pnpm typecheck`, `pnpm typecheck:tests`, and `pnpm test` (node:test via tsx). The test suite includes an actual npm tarball install and HTTP workflow checks. `prepack` rebuilds dist/ and copies the operation catalog through TypeScript's JSON module support; `bin` points to `dist/bin/bctrl.js`.

## Gotchas

- Regenerate contracts from the backend with `BCTRL_CLI_DIR` pointing at this checkout: `generate:annotated-clients`, `generate:cli-contracts`, and `generate:cli-help`. Workspace packages are TypeScript source. Verify with the backend's `check:cli-contracts`.
- The reference generator accepts `PLATFORM_DOCS_DIR`; use an isolated docs copy when preparing generated references for manual review.
- Auth file path precedence: `BCTRL_AUTH_FILE` > `BCTRL_CONFIG_DIR` > `$XDG_CONFIG_HOME/bctrl` > `~/.config/bctrl`; env `BCTRL_API_KEY`/token beats the stored file (CI-friendly).
- Field projection and `--jq` are client-side. Streams have a 60-second default deadline and optional event limit; closing an iterator cancels the HTTP reader.
- Requests pin `BCTRL-Version: 2026-10-03`; destructive operations require `--yes`. Query flags that overlap scope headers use a `query-` prefix.
