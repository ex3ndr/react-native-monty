import { NitroModules } from "react-native-nitro-modules";
import type { MontyExpo as MontyExpoSpec } from "./specs/monty-expo.nitro";
import type {
    MontyOptions,
    NativeMontyProgressResult,
    NativeMontyResult,
    RunOptions
} from "./MontyExpo.types";

export type NativeMontyExpoModuleType = {
    version(): string;
    isNativeRuntimeLinked(): boolean;
    loadAsync(): Promise<void>;
    runSync(code: string, options?: RunOptions, montyOptions?: MontyOptions): NativeMontyResult;
    startSync(code: string, options?: RunOptions, montyOptions?: MontyOptions): NativeMontyProgressResult;
    resumeSync(snapshotId: string, options?: unknown): NativeMontyProgressResult;
};

const FALLBACK_ERROR: NativeMontyResult = {
    ok: false,
    error: {
        typeName: "RuntimeError",
        message: "Monty Nitro runtime is not linked."
    }
};

const FALLBACK_PROGRESS_ERROR: NativeMontyProgressResult = {
    ok: false,
    error: {
        typeName: "RuntimeError",
        message: "Monty Nitro runtime is not linked."
    }
};

function safeStringify(value: unknown): string {
    try {
        return JSON.stringify(value ?? null);
    } catch (_error) {
        return "null";
    }
}

function parseNativeResult(raw: string): NativeMontyResult {
    try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object" && "ok" in parsed) {
            return parsed as NativeMontyResult;
        }
        return FALLBACK_ERROR;
    } catch (_error) {
        return FALLBACK_ERROR;
    }
}

function parseNativeProgressResult(raw: string): NativeMontyProgressResult {
    try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object" && "ok" in parsed) {
            return parsed as NativeMontyProgressResult;
        }
        return FALLBACK_PROGRESS_ERROR;
    } catch (_error) {
        return FALLBACK_PROGRESS_ERROR;
    }
}

const NativeMontyExpoNitro = NitroModules.createHybridObject<MontyExpoSpec>("MontyExpo");

const NativeMontyExpoModule: NativeMontyExpoModuleType = {
    version(): string {
        return NativeMontyExpoNitro.version();
    },
    isNativeRuntimeLinked(): boolean {
        return NativeMontyExpoNitro.isNativeRuntimeLinked();
    },
    async loadAsync(): Promise<void> {
        return Promise.resolve();
    },
    runSync(code: string, options?: RunOptions, montyOptions?: MontyOptions): NativeMontyResult {
        try {
            const raw = NativeMontyExpoNitro.runSync(code, safeStringify(options), safeStringify(montyOptions));
            return parseNativeResult(raw);
        } catch (error) {
            return {
                ok: false,
                error: {
                    typeName: "RuntimeError",
                    message: error instanceof Error ? error.message : "Nitro module call failed."
                }
            };
        }
    },
    startSync(code: string, options?: RunOptions, montyOptions?: MontyOptions): NativeMontyProgressResult {
        try {
            const raw = NativeMontyExpoNitro.startSync(code, safeStringify(options), safeStringify(montyOptions));
            return parseNativeProgressResult(raw);
        } catch (error) {
            return {
                ok: false,
                error: {
                    typeName: "RuntimeError",
                    message: error instanceof Error ? error.message : "Nitro module call failed."
                }
            };
        }
    },
    resumeSync(snapshotId: string, options?: unknown): NativeMontyProgressResult {
        try {
            const raw = NativeMontyExpoNitro.resumeSync(snapshotId, safeStringify(options));
            return parseNativeProgressResult(raw);
        } catch (error) {
            return {
                ok: false,
                error: {
                    typeName: "RuntimeError",
                    message: error instanceof Error ? error.message : "Nitro module call failed."
                }
            };
        }
    }
};

export default NativeMontyExpoModule;
