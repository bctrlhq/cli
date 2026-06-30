# Release

This package is intended to live at `bctrlhq/cli` and publish `@bctrl/cli`.

## Publish Setup

1. Create the GitHub repository under `bctrlhq`.
2. Configure npm trusted publishing for package `@bctrl/cli` with this repository and the `npm` environment.
3. Push a tag like `v0.1.7`.

The publish workflow uses GitHub OIDC plus npm provenance. Do not add long-lived npm tokens.

## Contract Sync

Generated route and help files are synced from the private platform repo:

```bash
cd ../bctrl
pnpm generate:cli-contracts
pnpm generate:cli-help
```

Commit generated changes under `src/generated/` in this repo.
