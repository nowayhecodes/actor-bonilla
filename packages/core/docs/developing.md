# Developing the library

This section is for contributors who **clone** the repository. Consumers installing **`@actor-bonilla/core`** from npm only need the [Getting started](./getting-started.md) guide.

Run commands from the **repository root** unless you are working inside a single package.

## Scripts (repository root)

| Script | Purpose |
|--------|---------|
| `pnpm install` | Installs all workspace packages |
| `pnpm run prepare` | Runs `pnpm -r run prepare` (`ts-patch install` in `@actor-bonilla/core`) |
| `pnpm run build` | Builds every workspace package (`pnpm -r run build`) |
| `pnpm run test` | Jest for `@actor-bonilla/core`; validation module is stubbed in tests |
| `pnpm run test:coverage` | Same with coverage thresholds |
| `pnpm run demo` / `bench` | Example and benchmark entrypoints for core |
| `pnpm --filter @actor-bonilla/core run release` | Local [semantic-release](https://github.com/semantic-release/semantic-release) for core (same config as CI) |

## Release workflow

The GitHub Action **[`.github/workflows/release.yml`](../../../.github/workflows/release.yml)** is triggered **manually** (workflow dispatch). It installs, builds, tests, then runs **`semantic-release` for each package** in the matrix (`packages/core`, `packages/http`). Tags use scoped formats (`@actor-bonilla/core@…`, `@actor-bonilla/http@…`) so releases do not collide. npm publish is off while `@semantic-release/npm` has `npmPublish: false`.

## Commits

Releases use **conventional commits** so semantic-release can infer the next version.
