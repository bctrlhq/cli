# BCTRL CLI

Command-line tools for BCTRL cloud browser automation. Use it to create browser runtimes, start live sessions, submit hosted invocations, inspect runs and files, and manage account resources from a terminal or script.

## Install

```bash
npm install -g @bctrl/cli
```

Requires Node.js 22.14 or newer.

## Authenticate

For an interactive terminal, start the browser approval flow and wait for completion:

```bash
bctrl auth login --url --wait
```

For CI, agents, or one-off shells, use an API key:

```bash
export BCTRL_API_KEY="bctrl_..."
bctrl auth status
```

`BCTRL_API_KEY` takes precedence over credentials stored by `bctrl auth login`.

## Quick Start

Create a browser runtime, start it, run an extraction task, then stop it:

```bash
bctrl runtime create --name research-browser --json
bctrl runtime start <runtime-id> --json

bctrl runtime invocation create <runtime-id> \
  --action extract \
  --instruction "Extract the page title." \
  --json

bctrl runtime invocation wait <runtime-id> <invocation-id> --json
bctrl runtime stop <runtime-id>
```

For full request bodies, pass JSON with `--body`. Inline JSON, `@file`, and `-` for stdin are supported:

```bash
bctrl runtime invocation create <runtime-id> \
  --body '{"action":"observe","instruction":"Summarize the current page."}' \
  --json

cat invocation.json | bctrl runtime invocation create <runtime-id> --body - --json
```

Use `--params` for path and query overrides when you need the exact API surface:

```bash
bctrl run list --params '{"limit":25}' --json
```

## Output

Print full JSON:

```bash
bctrl runtime list --json
```

Print selected fields:

```bash
bctrl runtime list --json id,status,name
```

Filter with jq syntax:

```bash
bctrl runtime list --json --jq '.data[] | select(.status == "active")'
```

Render with a template:

```bash
bctrl runtime list \
  --json \
  --template '{{#each data}}{{id}} {{status}}{{newline}}{{/each}}'
```

## Common Commands

```bash
bctrl space list
bctrl runtime create --name browser-task
bctrl runtime start <runtime-id>
bctrl runtime target create <runtime-id> --uri https://example.com --activate
bctrl runtime invocation create <runtime-id> --action act --instruction "Click the sign in button"
bctrl run list --json
bctrl runtime stop <runtime-id>
```

Run any command with `--help` for the exact arguments and flags:

```bash
bctrl runtime invocation create --help
```

## Documentation

- CLI guide: https://platform.bctrl.ai/cli
- Command reference: https://platform.bctrl.ai/cli/reference
- API reference: https://platform.bctrl.ai/api-reference
