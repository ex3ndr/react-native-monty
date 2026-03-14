#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CRATE_DIR="$ROOT_DIR/native/monty-expo-ffi"
OUT_DIR="$ROOT_DIR/ios/rust"
HEADERS_DIR="$OUT_DIR/include"
SIM_LIB_DIR="$OUT_DIR/simulator"
DEVICE_LIB_DIR="$OUT_DIR/device"
SIM_LIB="$SIM_LIB_DIR/libmonty_expo_ffi.a"
DEVICE_LIB="$DEVICE_LIB_DIR/libmonty_expo_ffi.a"
XCFRAMEWORK_PATH="$OUT_DIR/monty_expo_ffi.xcframework"

mkdir -p "$OUT_DIR"

TARGETS=(
  "aarch64-apple-ios"
  "aarch64-apple-ios-sim"
  "x86_64-apple-ios"
)

for TARGET in "${TARGETS[@]}"; do
  rustup target add "$TARGET" >/dev/null
  cargo build --manifest-path "$CRATE_DIR/Cargo.toml" --release --target "$TARGET"
done

mkdir -p "$HEADERS_DIR" "$SIM_LIB_DIR" "$DEVICE_LIB_DIR"
rm -rf "$XCFRAMEWORK_PATH"
rm -f "$SIM_LIB" "$DEVICE_LIB" "$OUT_DIR/libmonty_expo_ffi.a"

ARM64_DEVICE_LIB="$CRATE_DIR/target/aarch64-apple-ios/release/libmonty_expo_ffi.a"
ARM64_SIM_LIB="$CRATE_DIR/target/aarch64-apple-ios-sim/release/libmonty_expo_ffi.a"
X64_SIM_LIB="$CRATE_DIR/target/x86_64-apple-ios/release/libmonty_expo_ffi.a"

cp "$ARM64_DEVICE_LIB" "$DEVICE_LIB"
lipo -create "$ARM64_SIM_LIB" "$X64_SIM_LIB" -output "$SIM_LIB"

xcodebuild -create-xcframework \
  -library "$DEVICE_LIB" -headers "$HEADERS_DIR" \
  -library "$SIM_LIB" -headers "$HEADERS_DIR" \
  -output "$XCFRAMEWORK_PATH" >/dev/null

echo "Built iOS rust XCFramework at $XCFRAMEWORK_PATH"
