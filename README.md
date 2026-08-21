# BCTRL CLI

```bash
npm install -g @bctrl/cli
bctrl auth login
```

Create and start runtimes with `bctrl runtime`. Automation is exposed through a
small generic Tool interface:

```bash
bctrl tools call stagehand.act \
  --body '{"runtimeId":"rt_...","instruction":"Click Continue"}'

bctrl tools start captcha.solve --body '{"runtimeId":"rt_..."}'
bctrl tool-calls result call_... --params '{"waitSeconds":60}'
```

Use persistent conversations for long-running agents:

```bash
bctrl conversations create \
  --body '{"runtimeId":"rt_..."}'
bctrl conversations message conv_... --body '{"text":"Complete checkout"}'
bctrl conversations stream conv_...
```

Every automation path contributes to one Run:

```bash
bctrl runs trace run_...
bctrl runs events run_...
bctrl runs stream run_...
```

All JSON-body commands accept inline JSON, `@file.json`, or `-` for stdin through
`--body`. Use `--json`, `--jq`, or `--template` to control output.
