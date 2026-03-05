# react-native-monty

Run Python code on iOS, Android, and the web from React Native.

react-native-monty embeds [Monty](https://github.com/pydantic/monty), a sandboxed Python interpreter written in Rust, and exposes it through a single TypeScript API. On native platforms the interpreter runs as compiled Rust via FFI; on the web it falls back to an embedded WASM binary. Your app ships the same code everywhere.

## Features

- **Cross-platform** -- iOS (Swift FFI), Android (JNI), and web (WASM) behind one API
- **Sandboxed execution** -- resource limits on allocations, memory, time, and recursion depth
- **External functions** -- call JavaScript functions from Python and vice versa
- **Pausable / resumable** -- execution yields at external function calls, letting you inspect state, run async work, then resume
- **Serializable snapshots** -- dump and restore execution state as `Uint8Array` for persistence or transfer
- **Type checking** -- optional static type checking with rich diagnostics
- **Async support** -- `runMontyAsync` handles external functions that return promises

## Quick start

```bash
npm install react-native-monty
# or
yarn add react-native-monty
```

```ts
import { loadMonty, Monty } from "react-native-monty";

// Load the runtime (required on web, no-op on native)
await loadMonty();

const monty = new Monty("x + y", {
  scriptName: "add.py",
  inputs: ["x", "y"],
});

const result = monty.run({ inputs: { x: 2, y: 5 } });
// result === 7
```

## External functions

Python code can call into your JavaScript functions. Define them at run time and they are available inside the script:

```ts
const monty = new Monty(
  "def run(value):\n    return multiply_and_add(value, 10)\n\nrun(input_value)",
  { scriptName: "external.py", inputs: ["input_value"] },
);

const output = monty.run({
  inputs: { input_value: 2 },
  externalFunctions: {
    multiply_and_add: (value, factor) => Number(value) * Number(factor) + 7,
  },
});
// output === 27
```

### Async external functions

If your external functions need to do async work (network requests, database calls, etc.), use `runMontyAsync`:

```ts
import { runMontyAsync, Monty } from "react-native-monty";

const monty = new Monty("fetch_data(url)", {
  inputs: ["url"],
});

const result = await runMontyAsync(monty, {
  inputs: { url: "https://example.com/data" },
  externalFunctions: {
    fetch_data: async (url) => {
      const res = await fetch(String(url));
      return await res.text();
    },
  },
});
```

## Pausable execution

For fine-grained control, use `start` / `resume` to step through execution manually:

```ts
import { Monty, MontySnapshot, MontyComplete } from "react-native-monty";

const monty = new Monty("result = compute(42)");
let progress = monty.start();

while (progress instanceof MontySnapshot) {
  console.log(`Python called: ${progress.functionName}(${progress.args})`);
  const returnValue = handleCall(progress.functionName, progress.args);
  progress = progress.resume({ returnValue });
}

// progress is now MontyComplete
console.log(progress.output);
```

Snapshots are serializable -- call `snapshot.dump()` to persist state and `MontySnapshot.load(data)` to restore it later.

## Resource limits

Constrain execution to prevent runaway scripts:

```ts
monty.run({
  limits: {
    maxDurationSecs: 5,
    maxMemory: 10 * 1024 * 1024, // 10 MB
    maxAllocations: 100_000,
    maxRecursionDepth: 50,
  },
});
```

## API reference

### Classes

| Class | Description |
|---|---|
| `Monty` | Compile a script and run or start execution |
| `MontySnapshot` | Paused execution state at an external function call |
| `MontyComplete` | Completed execution with `.output` |
| `MontyRepl` | Interactive REPL session (web only) |
| `MontyError` | Base error class |
| `MontySyntaxError` | Parse-time errors |
| `MontyRuntimeError` | Runtime exceptions with `.traceback()` |
| `MontyTypingError` | Static type-check errors with `.displayDiagnostics()` |

### Functions

| Function | Description |
|---|---|
| `loadMonty()` | Load the WASM runtime (required on web, no-op on native) |
| `runMontyAsync(monty, options)` | Run with async external functions |
| `montyExpoVersion()` | Package version string |
| `montyExpoNativeRuntimeLinked()` | Whether native FFI is available |

## Architecture

```
TypeScript API (src/index.ts)
  │
  ├─ Native ──▶ Nitro Modules bridge ──▶ Rust FFI (native/monty-expo-ffi)
  │               iOS: Swift ──▶ C FFI
  │               Android: Kotlin ──▶ JNI
  │
  └─ Web ──▶ Embedded WASM runtime (src/web/monty/)
```

All cross-language communication uses JSON serialization. The Rust FFI layer handles type mapping between Python objects and JSON, including special types like big integers, bytes, tuples, sets, dataclasses, and named tuples.

## Build from source

```bash
# Full build (web + rust + codegen + typescript)
yarn build

# Or step by step:
yarn build:web           # Download and compile WASM from upstream
yarn build:rust          # Compile Rust FFI for iOS + Android
yarn codegen             # Generate Nitro Modules native bindings
yarn build:ts            # TypeScript compilation
```

The web runtime is built from the pinned upstream ref in `package.json` (`config.montyUpstreamRef`, currently `v0.0.7`). Override for one-off builds:

```bash
MONTY_UPSTREAM_REF=<tag-or-commit> yarn build:web
```

Platform-specific Rust builds:

```bash
yarn build:rust:ios
yarn build:rust:android
```

## License

MIT
