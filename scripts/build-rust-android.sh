#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CRATE_DIR="$ROOT_DIR/native/monty-expo-ffi"
OUT_DIR="$ROOT_DIR/android/src/main/jniLibs"

if ! command -v cargo-ndk >/dev/null 2>&1; then
  cargo install cargo-ndk --locked
fi

if [ -z "${ANDROID_NDK_HOME:-}" ]; then
  if [ -n "${ANDROID_HOME:-}" ] && [ -d "$ANDROID_HOME/ndk" ]; then
    export ANDROID_NDK_HOME="$ANDROID_HOME/ndk/$(ls "$ANDROID_HOME/ndk" | sort -V | tail -n 1)"
  elif [ -n "${ANDROID_SDK_ROOT:-}" ] && [ -d "$ANDROID_SDK_ROOT/ndk" ]; then
    export ANDROID_NDK_HOME="$ANDROID_SDK_ROOT/ndk/$(ls "$ANDROID_SDK_ROOT/ndk" | sort -V | tail -n 1)"
  fi
fi

if [ -z "${ANDROID_NDK_HOME:-}" ] || [ ! -d "$ANDROID_NDK_HOME" ]; then
  echo "ANDROID_NDK_HOME is not set and NDK was not auto-detected." >&2
  exit 1
fi

mkdir -p "$OUT_DIR"

pushd "$CRATE_DIR" >/dev/null

rustup target add aarch64-linux-android x86_64-linux-android >/dev/null

cargo ndk \
  -t arm64-v8a \
  -t x86_64 \
  -o "$OUT_DIR" \
  build \
  --release \
  --features android

popd >/dev/null

echo "Built Android rust libraries under $OUT_DIR"
