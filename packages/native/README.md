# `@actor-bonilla/native`

Zig-backed Node-API addon for Actor Bonilla (thread pool, mailboxes, actor registry).

## Installing as an app developer (`npm install`)

**Nothing compiles during install.** This package is meant to ship **prebuilt** `.node` binaries under `prebuilds/<platform-arch>/`. After `npm install`, Node loads the matching binary from disk—same distribution idea as [prebuildify](https://github.com/prebuild/prebuildify), which bundles prebuilds inside the npm tarball so installs stay fast and do not require a local toolchain.

- **`@actor-bonilla/core`** lists this package under **`optionalDependencies`**. If the addon cannot be installed or no prebuild exists for your OS/arch, installation still succeeds and `isNativeAvailable()` from `@actor-bonilla/core` is `false`.
- **Do not** rely on an `install` script that runs Zig or Clang on the user’s machine; that breaks CI sandboxes, slows installs, and fails without compilers.

### Relationship to prebuildify / prebuildify-cross

| Tool | Typical stack | This repo |
|------|----------------|-----------|
| [prebuildify](https://github.com/prebuild/prebuildify) | `node-gyp` + [`node-gyp-build`](https://github.com/prebuild/node-gyp-build) install hook + bundled `prebuilds/` | Zig `build.zig` + manual **`prebuilds/`** layout (`linux-x64`, `darwin-arm64`, …) matching ecosystem conventions |
| [prebuildify-cross](https://github.com/prebuild/prebuildify-cross) | Docker images around **prebuildify** for Linux ARM/Alpine/etc. | Optional: run the same Zig build inside those containers if you need extra libc/arch variants beyond CI |

Because the addon is **not** built with `node-gyp`, prebuildify does not drive the compile step here; you still get the **same developer experience goal**: publish once with binaries inside the package so consumers only run `npm install`.

### Maintainer workflow: producing prebuilds

1. **CI (recommended)** — GitHub Actions workflow `.github/workflows/native-prebuilds.yml` builds artifacts you can attach to a release or merge into `packages/native/prebuilds/` before publishing `@actor-bonilla/native`.
2. **Locally** — From the repo root, with [Zig](https://ziglang.org/download/) ≥ 0.14 and Node ≥ 20:

   ```bash
   pnpm run build:native          # current machine only
   pnpm run build:native:all      # all supported triples (requires cross-compile support)
   ```

3. **Publishing** — Ensure `packages/native/prebuilds/**` contains every platform you claim to support **before** `npm publish`. The `"files"` field in `package.json` already includes `prebuilds/**`.

### Supported platforms

Directory keys match Node’s `process.platform` + `process.arch`:

`linux-x64`, `linux-arm64`, `darwin-arm64`, `darwin-x64`, `win32-x64`.
