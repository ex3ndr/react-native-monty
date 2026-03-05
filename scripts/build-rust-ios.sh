#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CRATE_DIR="$ROOT_DIR/native/monty-expo-ffi"
OUT_DIR="$ROOT_DIR/ios/rust"

mkdir -p "$OUT_DIR"

TARGETS=(
  "aarch64-apple-ios-sim"
  "x86_64-apple-ios"
)

for TARGET in "${TARGETS[@]}"; do
  rustup target add "$TARGET" >/dev/null
  cargo build --manifest-path "$CRATE_DIR/Cargo.toml" --release --target "$TARGET"
done

ARM64_LIB="$CRATE_DIR/target/aarch64-apple-ios-sim/release/libmonty_expo_ffi.a"
X64_LIB="$CRATE_DIR/target/x86_64-apple-ios/release/libmonty_expo_ffi.a"
UNIVERSAL_LIB="$OUT_DIR/libmonty_expo_ffi.a"

lipo -create "$ARM64_LIB" "$X64_LIB" -output "$UNIVERSAL_LIB"
echo "Built iOS simulator rust library at $UNIVERSAL_LIB"
