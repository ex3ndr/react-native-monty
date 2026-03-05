import NativeMontyExpoModule from "./MontyExpoModule";
import type {
    ExceptionInfo,
    ExceptionInput,
    Frame,
    JsMontyObject,
    MontyOptions,
    NativeMontyProgressResult,
    ResourceLimits,
    ResumeOptions,
    RunMontyAsyncOptions,
    RunOptions,
    SnapshotLoadOptions,
    StartOptions,
    TypingDisplayFormat
} from "./MontyExpo.types";

export type {
    ExceptionInfo,
    ExceptionInput,
    Frame,
    JsMontyObject,
    MontyOptions,
    ResourceLimits,
    ResumeOptions,
    RunMontyAsyncOptions,
    RunOptions,
    SnapshotLoadOptions,
    StartOptions,
    TypingDisplayFormat
} from "./MontyExpo.types";

export type JsResourceLimits = ResourceLimits;

type ExternalFunctionsMap = Record<string, unknown>;

export class MontyError extends Error {
    protected _typeName: string;
    protected _message: string;

    constructor(typeName: string, message: string) {
        super(message ? `${typeName}: ${message}` : typeName);
        this.name = "MontyError";
        this._typeName = typeName;
        this._message = message;
    }

    get exception(): ExceptionInfo {
        return {
            typeName: this._typeName,
            message: this._message
        };
    }

    display(format: "type-msg" | "msg" = "msg"): string {
        if (format === "msg") {
            return this._message;
        }
        return this._message ? `${this._typeName}: ${this._message}` : this._typeName;
    }
}

export class MontySyntaxError extends MontyError {
    constructor(message: string) {
        super("SyntaxError", message);
        this.name = "MontySyntaxError";
    }
}

export class MontyRuntimeError extends MontyError {
    private _frames: Frame[];

    constructor(typeName: string, message: string, frames: Frame[] = []) {
        super(typeName, message);
        this.name = "MontyRuntimeError";
        this._frames = frames;
    }

    traceback(): Frame[] {
        return this._frames;
    }

    display(format: "traceback" | "type-msg" | "msg" = "traceback"): string {
        if (format === "msg") {
            return this._message;
        }
        if (format === "type-msg") {
            return this._message ? `${this._typeName}: ${this._message}` : this._typeName;
        }
        if (this._frames.length === 0) {
            return this.display("type-msg");
        }
        return `${this.display("type-msg")}\n${JSON.stringify(this._frames, null, 2)}`;
    }
}

export class MontyTypingError extends MontyError {
    constructor(message: string) {
        super("TypeError", message);
        this.name = "MontyTypingError";
    }

    displayDiagnostics(_format: TypingDisplayFormat = "full", _color: boolean = false): string {
        return this._message;
    }
}

export class MontyComplete {
    private _output: JsMontyObject;

    constructor(output: JsMontyObject) {
        this._output = output;
    }

    get output(): JsMontyObject {
        return this._output;
    }

    repr(): string {
        return `MontyComplete(${JSON.stringify(this._output)})`;
    }
}

export class MontySnapshot {
    private _snapshotId: string;
    private _scriptName: string;
    private _functionName: string;
    private _args: JsMontyObject[];
    private _kwargs: Record<string, JsMontyObject>;
    private _externalFunctions: ExternalFunctionsMap;

    constructor(
        snapshotId: string,
        scriptName: string,
        functionName: string,
        args: JsMontyObject[],
        kwargs: Record<string, JsMontyObject>,
        externalFunctions: ExternalFunctionsMap
    ) {
        this._snapshotId = snapshotId;
        this._scriptName = scriptName;
        this._functionName = functionName;
        this._args = args;
        this._kwargs = kwargs;
        this._externalFunctions = externalFunctions;
    }

    get scriptName(): string {
        return this._scriptName;
    }

    get functionName(): string {
        return this._functionName;
    }

    get args(): JsMontyObject[] {
        return this._args;
    }

    get kwargs(): Record<string, JsMontyObject> {
        return this._kwargs;
    }

    resume(options: ResumeOptions = {}): MontySnapshot | MontyComplete {
        const result = NativeMontyExpoModule.resumeSync(this._snapshotId, options);
        return progressFromNative(result, this._externalFunctions);
    }

    dump(): Uint8Array {
        throw new MontyRuntimeError("NotImplementedError", "MontySnapshot.dump is not implemented on mobile yet.");
    }

    static load(_data: Uint8Array, _options?: SnapshotLoadOptions): MontySnapshot {
        throw new MontyRuntimeError("NotImplementedError", "MontySnapshot.load is not implemented on mobile yet.");
    }

    repr(): string {
        return `MontySnapshot(scriptName=${this._scriptName}, functionName=${this._functionName})`;
    }
}

export class MontyRepl {
    static create(_code: string, _options?: MontyOptions, _startOptions?: StartOptions): MontyRepl {
        throw new MontyRuntimeError("NotImplementedError", "MontyRepl is not implemented on mobile yet.");
    }

    get scriptName(): string {
        throw new MontyRuntimeError("NotImplementedError", "MontyRepl is not implemented on mobile yet.");
    }

    feed(_code: string): JsMontyObject {
        throw new MontyRuntimeError("NotImplementedError", "MontyRepl.feed is not implemented on mobile yet.");
    }

    dump(): Uint8Array {
        throw new MontyRuntimeError("NotImplementedError", "MontyRepl.dump is not implemented on mobile yet.");
    }

    static load(_data: Uint8Array): MontyRepl {
        throw new MontyRuntimeError("NotImplementedError", "MontyRepl.load is not implemented on mobile yet.");
    }

    repr(): string {
        return "MontyRepl(<not-implemented>)";
    }
}

export class Monty {
    private _code: string;
    private _options: MontyOptions | undefined;

    constructor(code: string, options?: MontyOptions) {
        this._code = code;
        this._options = options;
    }

    typeCheck(_prefixCode?: string): void {
        // Type checking will be implemented in the native runtime once Rust mobile
        // linkage is added. The wrapper keeps API compatibility for callers now.
    }

    run(options: RunOptions = {}): JsMontyObject {
        const externalFunctions = options.externalFunctions ?? {};
        let progress = this.start(options);

        while (!(progress instanceof MontyComplete)) {
            progress = resumeFunctionCallSync(progress, externalFunctions);
        }

        return progress.output;
    }

    start(options: StartOptions = {}): MontySnapshot | MontyComplete {
        const externalFunctions = options.externalFunctions ?? {};
        const result = NativeMontyExpoModule.startSync(this._code, options, this._options);
        return progressFromNative(result, externalFunctions);
    }

    dump(): Uint8Array {
        throw new MontyRuntimeError("NotImplementedError", "Monty.dump is not implemented on mobile yet.");
    }

    static load(_data: Uint8Array): Monty {
        throw new MontyRuntimeError("NotImplementedError", "Monty.load is not implemented on mobile yet.");
    }

    get scriptName(): string {
        return this._options?.scriptName ?? "main.py";
    }

    get inputs(): string[] {
        return this._options?.inputs ?? [];
    }

    repr(): string {
        return `Monty(scriptName=${this.scriptName})`;
    }
}

export async function runMontyAsync(montyRunner: Monty, options: RunMontyAsyncOptions = {}): Promise<JsMontyObject> {
    const externalFunctions = options.externalFunctions ?? {};
    let progress = montyRunner.start(options);

    while (!(progress instanceof MontyComplete)) {
        progress = await resumeFunctionCallAsync(progress, externalFunctions);
    }

    return progress.output;
}

export function montyExpoVersion(): string {
    return NativeMontyExpoModule.version();
}

export function montyExpoNativeRuntimeLinked(): boolean {
    return NativeMontyExpoModule.isNativeRuntimeLinked();
}

export async function loadMonty(): Promise<void> {
    await NativeMontyExpoModule.loadAsync();
}

function progressFromNative(result: NativeMontyProgressResult, externalFunctions: ExternalFunctionsMap): MontySnapshot | MontyComplete {
    let current = result;

    for (let i = 0; i < 128; i += 1) {
        if (!current.ok) {
            throwNativeError(current.error);
        }

        if (current.state !== "nameLookup") {
            break;
        }

        current = resolveNameLookup(current.snapshotId, current.variableName, externalFunctions);
    }

    if (!current.ok) {
        throwNativeError(current.error);
    }

    if (current.state === "complete") {
        return new MontyComplete(current.output);
    }

    if (current.state === "functionCall") {
        return new MontySnapshot(
            current.snapshotId,
            current.scriptName,
            current.functionName,
            current.args,
            current.kwargs,
            externalFunctions
        );
    }

    throw new MontyRuntimeError(
        "RuntimeError",
        "Monty runtime returned too many chained name lookups while resolving external bindings."
    );
}

function resolveNameLookup(
    snapshotId: string,
    variableName: string,
    externalFunctions: ExternalFunctionsMap
): NativeMontyProgressResult {
    if (Object.prototype.hasOwnProperty.call(externalFunctions, variableName)) {
        const candidate = externalFunctions[variableName];
        if (typeof candidate === "function") {
            return NativeMontyExpoModule.resumeSync(snapshotId, {
                value: {
                    $function: {
                        name: variableName,
                        docstring: null
                    }
                }
            });
        }
        return NativeMontyExpoModule.resumeSync(snapshotId, {
            value: candidate
        });
    }

    return NativeMontyExpoModule.resumeSync(snapshotId, {});
}

function resumeFunctionCallSync(snapshot: MontySnapshot, externalFunctions: ExternalFunctionsMap): MontySnapshot | MontyComplete {
    const external = externalFunctions[snapshot.functionName];
    if (typeof external !== "function") {
        return snapshot.resume({
            exception: {
                type: "NameError",
                message: `name '${snapshot.functionName}' is not defined`
            }
        });
    }

    try {
        const result = invokeExternalFunction(external, snapshot.args, snapshot.kwargs);
        if (isPromiseLike(result)) {
            return snapshot.resume({
                exception: {
                    type: "TypeError",
                    message: `External function '${snapshot.functionName}' returned a Promise in run(). Use runMontyAsync().`
                }
            });
        }
        return snapshot.resume({
            returnValue: result
        });
    } catch (error) {
        return snapshot.resume({
            exception: exceptionFromUnknown(error)
        });
    }
}

async function resumeFunctionCallAsync(
    snapshot: MontySnapshot,
    externalFunctions: ExternalFunctionsMap
): Promise<MontySnapshot | MontyComplete> {
    const external = externalFunctions[snapshot.functionName];
    if (typeof external !== "function") {
        return snapshot.resume({
            exception: {
                type: "NameError",
                message: `name '${snapshot.functionName}' is not defined`
            }
        });
    }

    try {
        const result = await Promise.resolve(invokeExternalFunction(external, snapshot.args, snapshot.kwargs));
        return snapshot.resume({
            returnValue: result
        });
    } catch (error) {
        return snapshot.resume({
            exception: exceptionFromUnknown(error)
        });
    }
}

function invokeExternalFunction(
    external: Function,
    args: JsMontyObject[],
    kwargs: Record<string, JsMontyObject>
): unknown {
    if (Object.keys(kwargs).length > 0) {
        return external(...args, kwargs);
    }
    return external(...args);
}

function isPromiseLike(value: unknown): value is Promise<unknown> {
    return typeof value === "object" && value !== null && "then" in value && typeof value.then === "function";
}

function exceptionFromUnknown(error: unknown): ExceptionInput {
    if (error instanceof MontyError) {
        return {
            type: error.exception.typeName,
            message: error.exception.message
        };
    }

    if (error instanceof Error) {
        return {
            type: error.name || "RuntimeError",
            message: error.message
        };
    }

    return {
        type: "RuntimeError",
        message: String(error)
    };
}

function throwNativeError(error: ExceptionInfo & { traceback?: Frame[] }): never {
    if (error.typeName === "SyntaxError") {
        throw new MontySyntaxError(error.message);
    }
    throw new MontyRuntimeError(error.typeName, error.message, error.traceback ?? []);
}
