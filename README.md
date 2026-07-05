# BCTRL CLI

CLI for controlling BCTRL runtimes, files, runs, vault secrets, tools, and account resources from scripts or AI agents.

## Install

```bash
npm install -g @bctrl/cli
```

## Auth

The CLI authenticates with either a browser-approved CLI session or a BCTRL API key.

For a local terminal, start a browser approval and let the CLI poll until you approve it:

```bash
bctrl auth login --url --wait
```

For agents that need to hand the URL to a human, split the flow into two commands:

```bash
bctrl auth login --url
# approve the printed URL
bctrl auth login
```

Use an API key for CI or a single shell:

```bash
export BCTRL_API_KEY="bctrl_..."
```

`BCTRL_API_KEY` takes precedence over stored credentials.

Check the active auth:

```bash
bctrl auth status
```

Point contributors at a local or staging stack with `BCTRL_API_URL`:

```bash
BCTRL_API_URL=http://127.0.0.1:8787/v1 bctrl auth login --url --wait
```

## Browser Runtime Flow

```bash
bctrl space list
bctrl runtime create --space sp_123 --name checkout-test
bctrl runtime start rt_123
bctrl runtime stop rt_123
```

## JSON Input

Use `--input` for full request bodies:

```bash
bctrl runtime create --input runtime.json
```

Use `-` to read from stdin:

```bash
echo '{"type":"browser","spaceId":"sp_123","name":"agent-runtime"}' \
  | bctrl runtime create --input -
```

## Output

Print full JSON:

```bash
bctrl runtime list --space sp_123 --json
```

Print selected JSON fields:

```bash
bctrl runtime list --space sp_123 --json id,status,name
```

Filter with `jq`:

```bash
bctrl runtime list --space sp_123 --json --jq '.data[] | select(.status == "active")'
```

Render with a template:

```bash
bctrl runtime list \
  --space sp_123 \
  --json \
  --template '{{#each data}}{{id}} {{status}}{{newline}}{{/each}}'
```

## Help

Use command help for exact input and output fields:

```bash
bctrl runtime create --help
bctrl runtime start --help
```
