# Release

This package is intended to live at `bctrlhq/cli` and publish `@bctrl/cli`.

## Manual Publish

Publish from a local terminal with the `bctrlhq` npm account:

```bash
npm whoami
npm publish --access public --provenance=false --otp <code>
```

Use `--provenance=false` for local publishes. Provenance is only available from supported CI providers.

After npm publish succeeds, tag the exact commit and create a GitHub release:

```bash
git tag -a v0.1.8 -m "@bctrl/cli v0.1.8"
git push origin v0.1.8
gh release create v0.1.8 --title "@bctrl/cli v0.1.8" --notes "Published @bctrl/cli v0.1.8."
```

The GitHub Actions release workflow is a verification gate only. It does not publish to npm.

## Contract Sync

Generated route and help files are synced from the private platform repo:

```bash
cd ../bctrl
pnpm generate:cli-contracts
pnpm generate:cli-help
```

Commit generated changes under `src/generated/` in this repo.
