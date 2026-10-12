# BCTRL CLI

```bash
npm install -g @bctrl/cli
bctrl auth login
```

The CLI covers the current public API: browsers, sandboxes, tasks, agents, spaces,
files, tools, secrets, runs, and account resources. Inspect any command with `--help`.

```bash
bctrl browsers create --body '{"name":"checkout","recording":true}' --wait 60
bctrl browsers get checkout
bctrl browsers computer click checkout --body '{"coordinate":[100,200]}'
bctrl browsers stop checkout --body '{}'
```

Run an Agent in a Task and inspect the result:

```bash
bctrl tasks create --body '{"agent":"assistant","input":"Complete checkout"}'
bctrl tasks get task_u... --wait 60
```

Upload files, download bytes, and stream events:

```bash
bctrl files upload --file ./input.csv --space my-space
bctrl browsers files download checkout --path /downloads/result.csv --out ./result.csv
bctrl runs events run_u...
bctrl runs stream run_u... --timeout-ms 60000 --max-events 100
```

JSON inputs accept inline JSON, `@file.json`, or `-` for stdin through `--body`,
`--query`, `--headers`, and multipart `--fields`. Only one input can consume stdin.
Query fields also have individual flags, such as `--limit` and `--wait`; use
`--query-subaccount-id` when a query field overlaps the `--subaccount-id` header.
Use `--json`, `--jq`, or `--template` to format JSON responses. Binary responses
use `--out` (default: stdout), and streams keep their SSE framing.

Requests use `BCTRL-Version: 2026-10-03`. Select an authorized Space with `--space`
and an effective subaccount with `--subaccount-id`. Destructive operations such as
`browsers delete` and `webhooks rotate-secret` require `--yes`.

Version 0.2 replaces the retired `runtime` and `toolsets` commands with the current
API command names. Resource groups are plural (`spaces`, `files`, `proxies`, etc.),
and updates use `update`. Local `auth login`, `status`, `token`, and `logout` remain
available, alongside `auth whoami`.

Browser creation also supports `--open`. Use `bctrl mcp install --help` to configure an MCP client, `bctrl secrets import` to import .env values, and `bctrl run --secrets <prefix> -- <command>` to pass secrets to a local command.
