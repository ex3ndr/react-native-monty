import type {
    Frame,
    MontyOptions,
    NativeMontyProgressResult,
    NativeMontyResult,
    ResumeOptions,
    RunOptions,
    StartOptions
} from "./MontyExpo.types";
import type { NativeMontyExpoModuleType } from "./MontyExpoModule";

type WebRuntimeModule = typeof import("./web/monty/wrapper");
type WebSnapshot = import("./web/monty/wrapper").MontySnapshot;
type WebProgressResult = WebSnapshot | import("./web/monty/wrapper").MontyComplete;
type NativeErrorPayload = Extract<NativeMontyResult, { ok: false }>["error"];
type WebMontyOptions = MontyOptions & { externalFunctions?: string[] };

type StoredState = {
    scriptName: string;
    state: WebSnapshot;
};

const snapshotStore = new Map<string, StoredState>();
let nextSnapshotId = 1;
let webRuntimeModule: WebRuntimeModule | null = null;
let webRuntimePromise: Promise<WebRuntimeModule> | null = null;

function nextSnapshotIdString(): string {
    const value = `web-snapshot-${nextSnapshotId}`;
    nextSnapshotId += 1;
    return value;
}

async function loadWebRuntimeModule(): Promise<void> {
    if (webRuntimeModule) {
        return;
    }

    if (!webRuntimePromise) {
        webRuntimePromise = Promise.all([import("./web/monty/wrapper"), import("./web/monty/index")]).then(
            async ([moduleValue, runtimeIndex]) => {
                await runtimeIndex.initMontyWasm();
                webRuntimeModule = moduleValue;
                return moduleValue;
            }
        );
    }

    await webRuntimePromise;
}

function getWebRuntimeModule(): WebRuntimeModule {
    if (!webRuntimeModule) {
        throw new Error("Monty web runtime is not loaded. Call loadMonty() before using Monty APIs.");
    }
    return webRuntimeModule;
}

function normalizeMontyOptions(options?: MontyOptions): MontyOptions {
    return {
        scriptName: options?.scriptName,
        inputs: options?.inputs,
        typeCheck: options?.typeCheck,
        typeCheckPrefixCode: options?.typeCheckPrefixCode
    };
}

function extractExternalFunctionNames(options?: RunOptions): string[] | undefined {
    const values = options?.externalFunctions;
    if (!values || typeof values !== "object") {
        return undefined;
    }

    const names = Object.entries(values)
        .filter((entry) => typeof entry[1] === "function")
        .map((entry) => entry[0]);

    return names.length > 0 ? names : undefined;
}

function normalizeWebMontyOptions(montyOptions?: MontyOptions, runOptions?: RunOptions): WebMontyOptions {
    return {
        ...normalizeMontyOptions(montyOptions),
        externalFunctions: extractExternalFunctionNames(runOptions)
    };
}

function normalizeStartOptions(options?: StartOptions): StartOptions {
    return {
        inputs: options?.inputs,
        limits: options?.limits
    };
}

function normalizeRunOptions(options?: RunOptions): RunOptions {
    return {
        inputs: options?.inputs,
        limits: options?.limits,
        externalFunctions: options?.externalFunctions
    };
}

function normalizeResumeOptions(options?: unknown): ResumeOptions | { value?: unknown } {
    if (!options || typeof options !== "object") {
        return {};
    }

    const candidate = options as Record<string, unknown>;
    if ("value" in candidate) {
        return {
            value: candidate.value
        };
    }

    return {
        returnValue: candidate.returnValue,
        exception:
            candidate.exception && typeof candidate.exception === "object"
                ? {
                      type: String((candidate.exception as Record<string, unknown>).type ?? "RuntimeError"),
                      message: String((candidate.exception as Record<string, unknown>).message ?? "")
                  }
                : undefined
    };
}

function ensureTraceback(frames: Frame[] | undefined): Frame[] | undefined {
    if (!frames || frames.length === 0) {
        return undefined;
    }
    return frames;
}

function toNativeError(error: unknown, runtime?: WebRuntimeModule): NativeErrorPayload {
    if (runtime) {
        if (error instanceof runtime.MontyRuntimeError) {
            return {
                typeName: error.exception.typeName,
                message: error.exception.message,
                traceback: ensureTraceback(error.traceback())
            };
        }
        if (error instanceof runtime.MontySyntaxError) {
            return {
                typeName: "SyntaxError",
                message: error.exception.message
            };
        }
        if (error instanceof runtime.MontyError) {
            return {
                typeName: error.exception.typeName,
                message: error.exception.message
            };
        }
    }

    if (error instanceof Error) {
        return {
            typeName: error.name || "RuntimeError",
            message: error.message
        };
    }
    return {
        typeName: "RuntimeError",
        message: String(error)
    };
}

function toNativeRunError(error: unknown, runtime?: WebRuntimeModule): NativeMontyResult {
    return {
        ok: false,
        error: toNativeError(error, runtime)
    };
}

function toNativeProgressError(error: unknown, runtime?: WebRuntimeModule): NativeMontyProgressResult {
    return {
        ok: false,
        error: toNativeError(error, runtime)
    };
}

function mapProgressResult(
    progress: WebProgressResult,
    scriptName: string,
    runtime: WebRuntimeModule
): NativeMontyProgressResult {
    if (progress instanceof runtime.MontyComplete) {
        return {
            ok: true,
            state: "complete",
            output: progress.output
        };
    }

    const snapshotId = nextSnapshotIdString();
    snapshotStore.set(snapshotId, {
        scriptName,
        state: progress
    });

    return {
        ok: true,
        state: "functionCall",
        snapshotId,
        scriptName,
        functionName: progress.functionName,
        args: progress.args,
        kwargs: progress.kwargs as Record<string, unknown>
    };
}

const MontyExpoModule: NativeMontyExpoModuleType = {
    version(): string {
        return "0.1.0-web+embedded-wasm";
    },
    isNativeRuntimeLinked(): boolean {
        return false;
    },
    async loadAsync(): Promise<void> {
        await loadWebRuntimeModule();
    },
    runSync(code: string, options?: RunOptions, montyOptions?: MontyOptions): NativeMontyResult {
        let runtime: WebRuntimeModule | undefined;
        try {
            runtime = getWebRuntimeModule();
            const runner = new runtime.Monty(code, normalizeWebMontyOptions(montyOptions, options));
            const output = runner.run(normalizeRunOptions(options));
            return {
                ok: true,
                output
            };
        } catch (error) {
            return toNativeRunError(error, runtime);
        }
    },
    startSync(code: string, options?: RunOptions, montyOptions?: MontyOptions): NativeMontyProgressResult {
        let runtime: WebRuntimeModule | undefined;
        try {
            runtime = getWebRuntimeModule();
            const runner = new runtime.Monty(code, normalizeWebMontyOptions(montyOptions, options));
            const progress = runner.start(normalizeStartOptions(options));
            return mapProgressResult(progress, runner.scriptName, runtime);
        } catch (error) {
            return toNativeProgressError(error, runtime);
        }
    },
    resumeSync(snapshotId: string, options?: unknown): NativeMontyProgressResult {
        const snapshot = snapshotStore.get(snapshotId);
        if (!snapshot) {
            return toNativeProgressError(new Error(`Unknown snapshot id '${snapshotId}'.`));
        }

        snapshotStore.delete(snapshotId);

        let runtime: WebRuntimeModule | undefined;
        try {
            runtime = getWebRuntimeModule();
            const resumeOptions = normalizeResumeOptions(options);
            const nextProgress = snapshot.state.resume(resumeOptions as ResumeOptions);
            return mapProgressResult(nextProgress, snapshot.scriptName, runtime);
        } catch (error) {
            return toNativeProgressError(error, runtime);
        }
    }
};

export default MontyExpoModule;
