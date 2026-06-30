# BCTRL CLI

CLI for controlling BCTRL runtimes, files, runs, vault secrets, tools, and account resources from scripts or AI agents.

## Install

```bash
npm install -g @bctrl/cli
```

## Auth

The CLI authenticates with a BCTRL API key.

Use an API key for the current shell:

```bash
export BCTRL_API_KEY="bctrl_..."
```

Or save it locally:

```bash
bctrl auth login
```

If `BCTRL_API_KEY` is already set, `auth login` saves that key. Otherwise, it prompts you to paste an API key.

Check the active auth:

```bash
bctrl auth status
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
