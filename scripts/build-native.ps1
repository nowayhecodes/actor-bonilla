# build-native.ps1 — Build the Zig native addon for Windows (or all platforms)
# Usage:
#   .\scripts\build-native.ps1                    # build all targets
#   .\scripts\build-native.ps1 -CurrentPlatform   # build win32-x64 only
#   .\scripts\build-native.ps1 -Target linux-x64  # build a specific target
#
# Requirements:
#   - zig >= 0.14.0  (https://ziglang.org/download/)
#   - node >= 20

param(
  [switch]$CurrentPlatform,
  [string]$Target = ""
)

$ErrorActionPreference = "Stop"

$RootDir      = Split-Path -Parent $PSScriptRoot
$NativeDir    = Join-Path $RootDir "packages\native"
$PrebuildsDir = Join-Path $NativeDir "prebuilds"

$ZigTarget = @{
  "linux-x64"    = "x86_64-linux-gnu"
  "linux-arm64"  = "aarch64-linux-gnu"
  "darwin-arm64" = "aarch64-macos"
  "darwin-x64"   = "x86_64-macos"
  "win32-x64"    = "x86_64-windows-msvc"
}

$LibName = @{
  "linux-x64"    = "actor_bonilla_native.so"
  "linux-arm64"  = "actor_bonilla_native.so"
  "darwin-arm64" = "actor_bonilla_native.dylib"
  "darwin-x64"   = "actor_bonilla_native.dylib"
  "win32-x64"    = "actor_bonilla_native.dll"
}

function Get-NodeInclude {
  $nodeExe    = (Get-Command node -ErrorAction Stop).Source
  $nodePrefix = Split-Path -Parent (Split-Path -Parent $nodeExe)
  $includeDir = Join-Path $nodePrefix "include\node"
  if (Test-Path $includeDir) {
    return $includeDir
  }

  $headerDir = Join-Path $RootDir ".node-headers"
  if (-not (Test-Path $headerDir)) {
    $nodeVersion = (& node --version).Trim()
    Write-Host "Downloading Node.js headers for $nodeVersion..."
    $url     = "https://nodejs.org/download/release/$nodeVersion/node-$nodeVersion-headers.tar.gz"
    $tarball = Join-Path $env:TEMP "node-headers.tar.gz"
    Invoke-WebRequest -Uri $url -OutFile $tarball -UseBasicParsing
    New-Item -ItemType Directory -Force -Path $headerDir | Out-Null
    & tar -xzf $tarball -C $headerDir --strip-components=1
    Remove-Item $tarball
  }
  return Join-Path $headerDir "include\node"
}

function Build-Target {
  param([string]$PlatformKey)

  $zigTarget  = $ZigTarget[$PlatformKey]
  $libName    = $LibName[$PlatformKey]
  $outDir     = Join-Path $PrebuildsDir $PlatformKey
  $zigOutDir  = Join-Path $NativeDir "zig-out-$PlatformKey"
  $nodeInclude = Get-NodeInclude

  Write-Host "==> Building $PlatformKey ($zigTarget)..."
  New-Item -ItemType Directory -Force -Path $outDir | Out-Null

  $env:NODE_INCLUDE_PATH = $nodeInclude

  & zig build `
    --build-file "$NativeDir\build.zig" `
    --prefix $zigOutDir `
    "-Dtarget=$zigTarget" `
    "-Doptimize=ReleaseSafe"

  if ($LASTEXITCODE -ne 0) {
    throw "zig build failed for $PlatformKey (exit $LASTEXITCODE)"
  }

  $candidates = @(
    (Join-Path $zigOutDir $libName),
    (Join-Path $zigOutDir "lib$libName"),
    (Join-Path $zigOutDir "lib\$libName"),
    (Join-Path $zigOutDir "lib\lib$libName")
  )
  $src = $null
  foreach ($c in $candidates) {
    if (Test-Path $c) { $src = $c; break }
  }
  if ($null -eq $src) {
    throw "Could not find built library for $PlatformKey in $zigOutDir"
  }

  $dest = Join-Path $outDir "actor_bonilla_native.node"
  Copy-Item $src $dest -Force
  Write-Host "    => $dest"

  Remove-Item -Recurse -Force $zigOutDir
}

# ============================================================================
# Main
# ============================================================================
New-Item -ItemType Directory -Force -Path $PrebuildsDir | Out-Null

if ($CurrentPlatform) {
  Build-Target "win32-x64"
} elseif ($Target -ne "") {
  if (-not $ZigTarget.ContainsKey($Target)) {
    Write-Error "Unknown target: $Target. Available: $($ZigTarget.Keys -join ', ')"
    exit 1
  }
  Build-Target $Target
} else {
  foreach ($key in $ZigTarget.Keys) {
    Build-Target $key
  }
}

Write-Host ""
Write-Host "Build complete. Prebuilds:"
Get-ChildItem -Recurse -Filter "*.node" $PrebuildsDir `
  | Select-Object -ExpandProperty FullName `
  | Sort-Object
