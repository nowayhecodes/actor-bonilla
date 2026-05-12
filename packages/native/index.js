'use strict';

/**
 * Loads the Zig-built Node-API addon from bundled prebuilds.
 *
 * Consumer installs must NOT compile Zig locally: published tarballs ship
 * `prebuilds/<platform-arch>/actor_bonilla_native.node`. See README.md.
 *
 * When no compatible prebuild exists, we export a sentinel object instead of
 * throwing so optional installs (`optionalDependencies`) and core's
 * `isNativeAvailable()` stay ergonomic.
 */

const fs = require('fs');
const path = require('path');
const { platform, arch } = process;

const PLATFORM_MAP = {
  'linux-x64': 'linux-x64',
  'linux-arm64': 'linux-arm64',
  'darwin-arm64': 'darwin-arm64',
  'darwin-x64': 'darwin-x64',
  'win32-x64': 'win32-x64',
};

const key = `${platform}-${arch}`;
const platformDir = PLATFORM_MAP[key];

function tryLoadAddon() {
  if (!platformDir) {
    return {
      __actorBonillaNativeUnavailable: true,
      reason: `unsupported platform "${key}"`,
    };
  }

  const addonPath = path.join(
    __dirname,
    'prebuilds',
    platformDir,
    'actor_bonilla_native.node'
  );

  if (!fs.existsSync(addonPath)) {
    return {
      __actorBonillaNativeUnavailable: true,
      reason: `prebuild missing for "${key}" (expected ${addonPath})`,
    };
  }

  try {
    return require(addonPath);
  } catch (err) {
    return {
      __actorBonillaNativeUnavailable: true,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

module.exports = tryLoadAddon();
