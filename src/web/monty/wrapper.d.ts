import type { ExceptionInfo, ExceptionInput, Frame, JsMontyObject, MontyOptions, NameLookupLoadOptions, NameLookupResumeOptions, ResourceLimits, ResumeOptions, RunOptions, SnapshotLoadOptions, StartOptions } from './index.js';
import { MontySnapshot as NativeMontySnapshot, MontyNameLookup as NativeMontyNameLookup, MontyComplete as NativeMontyComplete, MontyException as NativeMontyException, MontyTypingError as NativeMontyTypingError } from './index.js';
export type { MontyOptions, RunOptions, ResourceLimits, Frame, ExceptionInfo, StartOptions, ResumeOptions, ExceptionInput, SnapshotLoadOptions, NameLookupResumeOptions, NameLookupLoadOptions, JsMontyObject, };
/**
 * Alias for ResourceLimits (deprecated name).
 */
export type JsResourceLimits = ResourceLimits;
/**
 * Base class for all Monty interpreter errors.
 *
 * This is the parent class for `MontySyntaxError`, `MontyRuntimeError`, and `MontyTypingError`.
 * Catching `MontyError` will catch any exception raised by Monty.
 */
export declare class MontyError extends Error {
    protected _typeName: string;
    protected _message: string;
    constructor(typeName: string, message: string);
    /**
     * Returns information about the inner Python exception.
     */
    get exception(): ExceptionInfo;
    /**
     * Returns formatted exception string.
     * @param format - 'type-msg' for 'ExceptionType: message', 'msg' for just the message
     */
    display(format?: 'type-msg' | 'msg'): string;
}
/**
 * Raised when Python code has syntax errors or cannot be parsed by Monty.
 *
 * The inner exception is always a `SyntaxError`. Use `display()` to get
 * formatted error output.
 */
export declare class MontySyntaxError extends MontyError {
    private _native;
    constructor(messageOrNative: string | NativeMontyException);
    /**
     * Returns formatted exception string.
     * @param format - 'type-msg' for 'SyntaxError: message', 'msg' for just the message
     */
    display(format?: 'type-msg' | 'msg'): string;
}
/**
 * Raised when Monty code fails during execution.
 *
 * Provides access to the traceback frames where the error occurred via `traceback()`,
 * and formatted output via `display()`.
 */
export declare class MontyRuntimeError extends MontyError {
    private _native;
    private _tracebackString;
    private _frames;
    constructor(nativeOrTypeName: NativeMontyException | string, message?: string, tracebackString?: string, frames?: Frame[]);
    /**
     * Returns the Monty traceback as an array of Frame objects.
     */
    traceback(): Frame[];
    /**
     * Returns formatted exception string.
     * @param format - 'traceback' for full traceback, 'type-msg' for 'ExceptionType: message', 'msg' for just the message
     */
    display(format?: 'traceback' | 'type-msg' | 'msg'): string;
}
export type TypingDisplayFormat = 'full' | 'concise' | 'azure' | 'json' | 'jsonlines' | 'rdjson' | 'pylint' | 'gitlab' | 'github';
/**
 * Raised when type checking finds errors in the code.
 *
 * This exception is raised when static type analysis detects type errors.
 * Use `displayDiagnostics()` to render rich diagnostics in various formats for tooling integration.
 * Use `display()` (inherited) for simple 'type-msg' or 'msg' formats.
 */
export declare class MontyTypingError extends MontyError {
    private _native;
    constructor(messageOrNative: string | NativeMontyTypingError, nativeError?: NativeMontyTypingError | null);
    /**
     * Renders rich type error diagnostics for tooling integration.
     *
     * @param format - Output format (default: 'full')
     * @param color - Include ANSI color codes (default: false)
     */
    displayDiagnostics(format?: TypingDisplayFormat, color?: boolean): string;
}
/**
 * Wrapped Monty class that throws proper Error subclasses.
 */
export declare class Monty {
    private _native;
    /**
     * Creates a new Monty interpreter by parsing the given code.
     *
     * @param code - Python code to execute
     * @param options - Configuration options
     * @throws {MontySyntaxError} If the code has syntax errors
     * @throws {MontyTypingError} If type checking is enabled and finds errors
     */
    constructor(code: string, options?: MontyOptions);
    /**
     * Performs static type checking on the code.
     *
     * @param prefixCode - Optional code to prepend before type checking
     * @throws {MontyTypingError} If type checking finds errors
     */
    typeCheck(prefixCode?: string): void;
    /**
     * Executes the code and returns the result.
     *
     * @param options - Execution options (inputs, limits)
     * @returns The result of the last expression
     * @throws {MontyRuntimeError} If the code raises an exception
     */
    run(options?: RunOptions): JsMontyObject;
    /**
     * Starts execution and returns a snapshot (paused at external call or name lookup) or completion.
     *
     * @param options - Execution options (inputs, limits)
     * @returns MontySnapshot if paused at function call, MontyNameLookup if paused at
     *   name lookup, MontyComplete if done
     * @throws {MontyRuntimeError} If the code raises an exception
     */
    start(options?: StartOptions): MontySnapshot | MontyNameLookup | MontyComplete;
    /**
     * Serializes the Monty instance to a binary format.
     */
    dump(): Buffer;
    /**
     * Deserializes a Monty instance from binary format.
     */
    static load(data: Buffer): Monty;
    /** Returns the script name. */
    get scriptName(): string;
    /** Returns the input variable names. */
    get inputs(): string[];
    /** Returns a string representation of the Monty instance. */
    repr(): string;
}
/** Options for creating a new MontyRepl instance. */
export interface MontyReplOptions {
    /** Name used in tracebacks and error messages. Default: 'main.py' */
    scriptName?: string;
    /** Resource limits applied to all snippet executions. */
    limits?: ResourceLimits;
}
/**
 * Incremental no-replay REPL session.
 *
 * Create with `new MontyRepl()` then call `feed()` to execute snippets
 * incrementally against persistent state.
 */
export declare class MontyRepl {
    private _native;
    /**
     * Creates an empty REPL session ready to receive snippets via `feed()`.
     *
     * @param options - Optional configuration (scriptName, limits)
     */
    constructor(options?: MontyReplOptions);
    /** Returns the script name for this REPL session. */
    get scriptName(): string;
    /**
     * Executes one incremental snippet.
     *
     * @param code - Snippet code to execute
     * @returns Snippet output
     * @throws {MontyRuntimeError} If execution raises an exception
     */
    feed(code: string): JsMontyObject;
    /** Serializes the REPL session to bytes. */
    dump(): Buffer;
    /** Restores a REPL session from bytes. */
    static load(data: Buffer): MontyRepl;
    /** Returns a string representation of the REPL session. */
    repr(): string;
}
/**
 * Represents paused execution waiting for an external function call return value.
 *
 * Contains information about the pending external function call and allows
 * resuming execution with the return value or an exception.
 */
export declare class MontySnapshot {
    private _native;
    constructor(nativeSnapshot: NativeMontySnapshot);
    /** Returns the name of the script being executed. */
    get scriptName(): string;
    /** Returns the name of the external function being called. */
    get functionName(): string;
    /** Returns the positional arguments passed to the external function. */
    get args(): JsMontyObject[];
    /** Returns the keyword arguments passed to the external function as an object. */
    get kwargs(): Record<string, JsMontyObject>;
    /**
     * Resumes execution with either a return value or an exception.
     *
     * @param options - Object with either `returnValue` or `exception`
     * @returns MontySnapshot if paused at function call, MontyNameLookup if paused at
     *   name lookup, MontyComplete if done
     * @throws {MontyRuntimeError} If the code raises an exception
     */
    resume(options: ResumeOptions): MontySnapshot | MontyNameLookup | MontyComplete;
    /**
     * Serializes the MontySnapshot to a binary format.
     */
    dump(): Buffer;
    /**
     * Deserializes a MontySnapshot from binary format.
     */
    static load(data: Buffer, options?: SnapshotLoadOptions): MontySnapshot;
    /** Returns a string representation of the MontySnapshot. */
    repr(): string;
}
/**
 * Represents paused execution waiting for a name to be resolved.
 *
 * The host should check if the variable name corresponds to a known value
 * (e.g., an external function). Call `resume()` with the value to continue
 * execution, or call `resume()` with no value to raise `NameError`.
 */
export declare class MontyNameLookup {
    private _native;
    constructor(nativeNameLookup: NativeMontyNameLookup);
    /** Returns the name of the script being executed. */
    get scriptName(): string;
    /** Returns the name of the variable being looked up. */
    get variableName(): string;
    /**
     * Resumes execution after resolving the name lookup.
     *
     * If `value` is provided, the name resolves to that value and execution continues.
     * If `value` is omitted/undefined, the VM raises a `NameError`.
     *
     * @param options - Optional object with `value` to resolve the name to
     * @returns MontySnapshot if paused at function call, MontyNameLookup if paused at
     *   another name lookup, MontyComplete if done
     * @throws {MontyRuntimeError} If the code raises an exception
     */
    resume(options?: NameLookupResumeOptions): MontySnapshot | MontyNameLookup | MontyComplete;
    /**
     * Serializes the MontyNameLookup to a binary format.
     */
    dump(): Buffer;
    /**
     * Deserializes a MontyNameLookup from binary format.
     */
    static load(data: Buffer, options?: NameLookupLoadOptions): MontyNameLookup;
    /** Returns a string representation of the MontyNameLookup. */
    repr(): string;
}
/**
 * Represents completed execution with a final output value.
 */
export declare class MontyComplete {
    private _native;
    constructor(nativeComplete: NativeMontyComplete);
    /** Returns the final output value from the executed code. */
    get output(): JsMontyObject;
    /** Returns a string representation of the MontyComplete. */
    repr(): string;
}
/**
 * Options for `runMontyAsync`.
 */
export interface RunMontyAsyncOptions {
    /** Input values for the script. */
    inputs?: Record<string, JsMontyObject>;
    /** External function implementations (sync or async). */
    externalFunctions?: Record<string, (...args: unknown[]) => unknown>;
    /** Resource limits. */
    limits?: ResourceLimits;
    /** Callback invoked on each print() call. The first argument is the stream name (always "stdout"), the second is the printed text. */
    printCallback?: (stream: string, text: string) => void;
}
/**
 * Runs a Monty script with async external function support.
 *
 * This function handles both synchronous and asynchronous external functions.
 * When an external function returns a Promise, it will be awaited before
 * resuming execution.
 *
 * @param montyRunner - The Monty runner instance to execute
 * @param options - Execution options
 * @returns The output of the Monty script
 * @throws {MontyRuntimeError} If the code raises an exception
 * @throws {MontySyntaxError} If the code has syntax errors
 *
 * @example
 * const m = new Monty('result = await fetch_data(url)', {
 *   inputs: ['url'],
 * });
 *
 * const result = await runMontyAsync(m, {
 *   inputs: { url: 'https://example.com' },
 *   externalFunctions: {
 *     fetch_data: async (url) => {
 *       const response = await fetch(url);
 *       return response.text();
 *     }
 *   }
 * });
 */
export declare function runMontyAsync(montyRunner: Monty, options?: RunMontyAsyncOptions): Promise<JsMontyObject>;
//# sourceMappingURL=wrapper.d.ts.map