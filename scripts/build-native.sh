#!/usr/bin/env bash
# build-native.sh — Build the Zig native addon for all platforms (or a single one)
# Usage:
#   ./scripts/build-native.sh                    # build all targets
#   ./scripts/build-native.sh --current-platform # build only the current platform
#   ./scripts/build-native.sh --target linux-x64 # build a specific target
#
# Requirements:
#   - zig >= 0.14.0  (https://ziglang.org/download/)
#   - node >= 20

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
NATIVE_DIR="$ROOT_DIR/packages/native"
PREBUILDS_DIR="$NATIVE_DIR/prebuilds"

declare -A ZIG_TARGET=(
  ["linux-x64"]="x86_64-linux-gnu"
  ["linux-arm64"]="aarch64-linux-gnu"
  ["darwin-arm64"]="aarch64-macos"
  ["darwin-x64"]="x86_64-macos"
  ["win32-x64"]="x86_64-windows-msvc"
)

declare -A LIB_NAME=(
  ["linux-x64"]="actor_bonilla_native.so"
  ["linux-arm64"]="actor_bonilla_native.so"
  ["darwin-arm64"]="actor_bonilla_native.dylib"
  ["darwin-x64"]="actor_bonilla_native.dylib"
  ["win32-x64"]="actor_bonilla_native.dll"
)

# ============================================================================
# Locate (or download) Node.js headers
# ============================================================================
get_node_include() {
  local node_exe
  node_exe="$(command -v node)"
  local node_prefix
  node_prefix="$(dirname "$(dirname "$node_exe")")"
  if [ -d "$node_prefix/include/node" ]; then
    echo "$node_prefix/include/node"
    return
  fi

  local header_dir="$ROOT_DIR/.node-headers"
  if [ ! -d "$header_dir" ]; then
    local node_version
    node_version="$(node --version)"
    echo "Downloading Node.js headers for $node_version..." >&2
    local url="https://nodejs.org/download/release/$node_version/node-$node_version-headers.tar.gz"
    mkdir -p "$header_dir"
    curl -fsSL "$url" | tar -xz -C "$header_dir" --strip-components=1
  fi
  echo "$header_dir/include/node"
}

# ============================================================================
# Build a single platform target
# ============================================================================
build_target() {
  local platform_key="$1"
  local zig_target="${ZIG_TARGET[$platform_key]}"
  local lib_name="${LIB_NAME[$platform_key]}"
  local out_dir="$PREBUILDS_DIR/$platform_key"
  local zig_out_dir="$NATIVE_DIR/zig-out-$platform_key"
  local node_include

  echo "==> Building $platform_key ($zig_target)..."
  node_include="$(get_node_include)"
  mkdir -p "$out_dir"

  NODE_INCLUDE_PATH="$node_include" zig build \
    --build-file "$NATIVE_DIR/build.zig" \
    --prefix "$zig_out_dir" \
    -Dtarget="$zig_target" \
    -Doptimize=ReleaseSafe

  # Locate the output shared library (zig places it under zig-out-*/lib/ or zig-out-*/).
  local src=""
  for candidate in \
    "$zig_out_dir/$lib_name" \
    "$zig_out_dir/lib$lib_name" \
    "$zig_out_dir/lib/$lib_name" \
    "$zig_out_dir/lib/lib$lib_name"
  do
    if [ -f "$candidate" ]; then
      src="$candidate"
      break
    fi
  done

  if [ -z "$src" ]; then
    echo "ERROR: Could not find built library for $platform_key in $zig_out_dir" >&2
    exit 1
  fi

  cp "$src" "$out_dir/actor_bonilla_native.node"
  echo "    => $out_dir/actor_bonilla_native.node"

  rm -rf "$zig_out_dir"
}

# ============================================================================
# Main
# ============================================================================
MODE="all"
SPECIFIC_TARGET=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --current-platform)
      MODE="current"
      shift
      ;;
    --target)
      MODE="specific"
      SPECIFIC_TARGET="$2"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

mkdir -p "$PREBUILDS_DIR"

case "$MODE" in
  current)
    CURRENT_OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
    CURRENT_ARCH="$(uname -m)"
    case "$CURRENT_OS" in
      linux)  OS_KEY="linux" ;;
      darwin) OS_KEY="darwin" ;;
      *)
        echo "Unsupported OS: $CURRENT_OS" >&2
        exit 1
        ;;
    esac
    case "$CURRENT_ARCH" in
      x86_64)       ARCH_KEY="x64" ;;
      arm64|aarch64) ARCH_KEY="arm64" ;;
      *)
        echo "Unsupported arch: $CURRENT_ARCH" >&2
        exit 1
        ;;
    esac
    build_target "$OS_KEY-$ARCH_KEY"
    ;;
  specific)
    if [ -z "${ZIG_TARGET[$SPECIFIC_TARGET]+_}" ]; then
      echo "Unknown target: $SPECIFIC_TARGET" >&2
      echo "Available: ${!ZIG_TARGET[*]}" >&2
      exit 1
    fi
    build_target "$SPECIFIC_TARGET"
    ;;
  all)
    for platform_key in "${!ZIG_TARGET[@]}"; do
      build_target "$platform_key"
    done
    ;;
esac

echo ""
echo "Build complete. Prebuilds:"
find "$PREBUILDS_DIR" -name "*.node" | sort
