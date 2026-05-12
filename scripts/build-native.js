#!/usr/bin/env node
// build-native.js — Delegates to the correct platform build script.
// Used by packages/native/package.json "build" script.

'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const args = process.argv.slice(2);
const rootDir = path.join(__dirname, '..');

let result;

if (process.platform === 'win32') {
  const ps1 = path.join(__dirname, 'build-native.ps1');
  const psArgs = ['-ExecutionPolicy', 'Bypass', '-File', ps1];
  if (args.includes('--current-platform')) psArgs.push('-CurrentPlatform');
  const targetIdx = args.indexOf('--target');
  if (targetIdx !== -1) psArgs.push('-Target', args[targetIdx + 1]);
  result = spawnSync('powershell.exe', psArgs, { stdio: 'inherit', cwd: rootDir });
} else {
  const sh = path.join(__dirname, 'build-native.sh');
  result = spawnSync('bash', [sh, ...args], { stdio: 'inherit', cwd: rootDir });
}

process.exit(result.status ?? 1);
