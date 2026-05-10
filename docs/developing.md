# Developing the library

This section is for contributors who **clone** the repository. Consumers installing **`actor-bonilla`** from npm only need the [Getting started](./getting-started.md) guide.

## Scripts

| Script | Purpose |
|--------|---------|
| `pnpm run prepare` | Runs `ts-patch install` so local `tsc` applies Typia transforms |
| `pnpm run build` | `tsc` emit to `dist/` |
| `pnpm run test` | Jest (ESM); validation module is stubbed in tests |
| `pnpm run test:coverage` | Same with coverage thresholds |
| `pnpm run demo` / `bench` | Example and benchmark entrypoints |
| `pnpm run release` | Local [semantic-release](https://github.com/semantic-release/semantic-release) (same config as CI) |

## Release workflow

The GitHub Action **[`.github/workflows/release.yml`](../.github/workflows/release.yml)** is triggered **manually** (workflow dispatch). It installs, builds, tests, then runs `semantic-release` (version bump, `CHANGELOG.md`, tag, GitHub Release). npm publish is off while `@semantic-release/npm` has `npmPublish: false`.

## Commits

Releases use **conventional commits** so semantic-release can infer the next version.
