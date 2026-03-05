// Custom error classes that extend Error for proper JavaScript error handling.
// These wrap the native Rust classes to provide instanceof support.
import { Monty as NativeMonty, MontyRepl as NativeMontyRepl, MontySnapshot as NativeMontySnapshot, MontyNameLookup as NativeMontyNameLookup, MontyComplete as NativeMontyComplete, MontyException as NativeMontyException, MontyTypingError as NativeMontyTypingError, } from './index.js';
/**
 * Base class for all Monty interpreter errors.
 *
 * This is the parent class for `MontySyntaxError`, `MontyRuntimeError`, and `MontyTypingError`.
 * Catching `MontyError` will catch any exception raised by Monty.
 */
export class MontyError extends Error {
    constructor(typeName, message) {
        super(message ? `${typeName}: ${message}` : typeName);
        this.name = 'MontyError';
        this._typeName = typeName;
        this._message = message;
        // Maintains proper stack trace for where our error was thrown (only available on V8)
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, MontyError);
        }
    }
    /**
     * Returns information about the inner Python exception.
     */
    get exception() {
        return {
            typeName: this._typeName,
            message: this._message,
        };
    }
    /**
     * Returns formatted exception string.
     * @param format - 'type-msg' for 'ExceptionType: message', 'msg' for just the message
     */
    display(format = 'msg') {
        switch (format) {
            case 'msg':
                return this._message;
            case 'type-msg':
                return this._message ? `${this._typeName}: ${this._message}` : this._typeName;
            default:
                throw new Error(`Invalid display format: '${format}'. Expected 'type-msg' or 'msg'`);
        }
    }
}
/**
 * Raised when Python code has syntax errors or cannot be parsed by Monty.
 *
 * The inner exception is always a `SyntaxError`. Use `display()` to get
 * formatted error output.
 */
export class MontySyntaxError extends MontyError {
    constructor(messageOrNative) {
        if (typeof messageOrNative === 'string') {
            super('SyntaxError', messageOrNative);
            this._native = null;
        }
        else {
            const exc = messageOrNative.exception;
            super('SyntaxError', exc.message);
            this._native = messageOrNative;
        }
        this.name = 'MontySyntaxError';
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, MontySyntaxError);
        }
    }
    /**
     * Returns formatted exception string.
     * @param format - 'type-msg' for 'SyntaxError: message', 'msg' for just the message
     */
    display(format = 'msg') {
        if (this._native && typeof this._native.display === 'function') {
            return this._native.display(format);
        }
        return super.display(format);
    }
}
/**
 * Raised when Monty code fails during execution.
 *
 * Provides access to the traceback frames where the error occurred via `traceback()`,
 * and formatted output via `display()`.
 */
export class MontyRuntimeError extends MontyError {
    constructor(nativeOrTypeName, message, tracebackString, frames) {
        if (typeof nativeOrTypeName === 'string') {
            // Legacy constructor: (typeName, message, tracebackString, frames)
            super(nativeOrTypeName, message);
            this._native = null;
            this._tracebackString = tracebackString ?? null;
            this._frames = frames ?? null;
        }
        else {
            // New constructor: (nativeException)
            const exc = nativeOrTypeName.exception;
            super(exc.typeName, exc.message);
            this._native = nativeOrTypeName;
            this._tracebackString = null;
            this._frames = null;
        }
        this.name = 'MontyRuntimeError';
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, MontyRuntimeError);
        }
    }
    /**
     * Returns the Monty traceback as an array of Frame objects.
     */
    traceback() {
        if (this._native) {
            return this._native.traceback();
        }
        return this._frames || [];
    }
    /**
     * Returns formatted exception string.
     * @param format - 'traceback' for full traceback, 'type-msg' for 'ExceptionType: message', 'msg' for just the message
     */
    display(format = 'traceback') {
        if (this._native && typeof this._native.display === 'function') {
            return this._native.display(format);
        }
        // Fallback for legacy constructor
        switch (format) {
            case 'traceback':
                return this._tracebackString || this.message;
            case 'type-msg':
                return this._message ? `${this._typeName}: ${this._message}` : this._typeName;
            case 'msg':
                return this._message;
            default:
                throw new Error(`Invalid display format: '${format}'. Expected 'traceback', 'type-msg', or 'msg'`);
        }
    }
}
/**
 * Raised when type checking finds errors in the code.
 *
 * This exception is raised when static type analysis detects type errors.
 * Use `displayDiagnostics()` to render rich diagnostics in various formats for tooling integration.
 * Use `display()` (inherited) for simple 'type-msg' or 'msg' formats.
 */
export class MontyTypingError extends MontyError {
    constructor(messageOrNative, nativeError = null) {
        if (typeof messageOrNative === 'string') {
            super('TypeError', messageOrNative);
            this._native = nativeError;
        }
        else {
            const exc = messageOrNative.exception;
            super('TypeError', exc.message);
            this._native = messageOrNative;
        }
        this.name = 'MontyTypingError';
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, MontyTypingError);
        }
    }
    /**
     * Renders rich type error diagnostics for tooling integration.
     *
     * @param format - Output format (default: 'full')
     * @param color - Include ANSI color codes (default: false)
     */
    displayDiagnostics(format = 'full', color = false) {
        if (this._native && typeof this._native.display === 'function') {
            return this._native.display(format, color);
        }
        return this._message;
    }
}
/**
 * Wrapped Monty class that throws proper Error subclasses.
 */
export class Monty {
    /**
     * Creates a new Monty interpreter by parsing the given code.
     *
     * @param code - Python code to execute
     * @param options - Configuration options
     * @throws {MontySyntaxError} If the code has syntax errors
     * @throws {MontyTypingError} If type checking is enabled and finds errors
     */
    constructor(code, options) {
        const result = NativeMonty.create(code, options);
        if (result instanceof NativeMontyException) {
            // Check typeName to distinguish syntax errors from other exceptions
            if (result.exception.typeName === 'SyntaxError') {
                throw new MontySyntaxError(result);
            }
            throw new MontyRuntimeError(result);
        }
        if (result instanceof NativeMontyTypingError) {
            throw new MontyTypingError(result);
        }
        this._native = result;
    }
    /**
     * Performs static type checking on the code.
     *
     * @param prefixCode - Optional code to prepend before type checking
     * @throws {MontyTypingError} If type checking finds errors
     */
    typeCheck(prefixCode) {
        const result = this._native.typeCheck(prefixCode);
        if (result instanceof NativeMontyTypingError) {
            throw new MontyTypingError(result);
        }
    }
    /**
     * Executes the code and returns the result.
     *
     * @param options - Execution options (inputs, limits)
     * @returns The result of the last expression
     * @throws {MontyRuntimeError} If the code raises an exception
     */
    run(options) {
        const result = this._native.run(options);
        if (result instanceof NativeMontyException) {
            throw new MontyRuntimeError(result);
        }
        return result;
    }
    /**
     * Starts execution and returns a snapshot (paused at external call or name lookup) or completion.
     *
     * @param options - Execution options (inputs, limits)
     * @returns MontySnapshot if paused at function call, MontyNameLookup if paused at
     *   name lookup, MontyComplete if done
     * @throws {MontyRuntimeError} If the code raises an exception
     */
    start(options) {
        const result = this._native.start(options);
        return wrapStartResult(result);
    }
    /**
     * Serializes the Monty instance to a binary format.
     */
    dump() {
        return this._native.dump();
    }
    /**
     * Deserializes a Monty instance from binary format.
     */
    static load(data) {
        const instance = Object.create(Monty.prototype);
        instance._native = NativeMonty.load(data);
        return instance;
    }
    /** Returns the script name. */
    get scriptName() {
        return this._native.scriptName;
    }
    /** Returns the input variable names. */
    get inputs() {
        return this._native.inputs;
    }
    /** Returns a string representation of the Monty instance. */
    repr() {
        return this._native.repr();
    }
}
/**
 * Incremental no-replay REPL session.
 */
export class MontyRepl {
    /**
     * Creates a REPL session directly from source code.
     */
    static create(code, options, startOptions) {
        const result = NativeMontyRepl.create(code, options, startOptions);
        if (result instanceof NativeMontyException) {
            if (result.exception.typeName === 'SyntaxError') {
                throw new MontySyntaxError(result);
            }
            throw new MontyRuntimeError(result);
        }
        if (result instanceof NativeMontyTypingError) {
            throw new MontyTypingError(result);
        }
        return new MontyRepl(result);
    }
    constructor(nativeRepl) {
        this._native = nativeRepl;
    }
    /** Returns the script name for this REPL session. */
    get scriptName() {
        return this._native.scriptName;
    }
    /**
     * Executes one incremental snippet.
     *
     * @param code - Snippet code to execute
     * @returns Snippet output
     * @throws {MontyRuntimeError} If execution raises an exception
     */
    feed(code) {
        const result = this._native.feed(code);
        if (result instanceof NativeMontyException) {
            throw new MontyRuntimeError(result);
        }
        return result;
    }
    /** Serializes the REPL session to bytes. */
    dump() {
        return this._native.dump();
    }
    /** Restores a REPL session from bytes. */
    static load(data) {
        return new MontyRepl(NativeMontyRepl.load(data));
    }
    /** Returns a string representation of the REPL session. */
    repr() {
        return this._native.repr();
    }
}
/**
 * Helper to wrap native start/resume results, throwing errors as needed.
 */
function wrapStartResult(result) {
    if (result instanceof NativeMontyException) {
        throw new MontyRuntimeError(result);
    }
    // Check MontyNameLookup before MontySnapshot — napi `Either4` may cause
    // false positives with `instanceof` if checked in the wrong order.
    if (result instanceof NativeMontyNameLookup) {
        return new MontyNameLookup(result);
    }
    if (result instanceof NativeMontySnapshot) {
        return new MontySnapshot(result);
    }
    if (result instanceof NativeMontyComplete) {
        return new MontyComplete(result);
    }
    throw new Error(`Unexpected result type from native binding: ${result}`);
}
/**
 * Represents paused execution waiting for an external function call return value.
 *
 * Contains information about the pending external function call and allows
 * resuming execution with the return value or an exception.
 */
export class MontySnapshot {
    constructor(nativeSnapshot) {
        this._native = nativeSnapshot;
    }
    /** Returns the name of the script being executed. */
    get scriptName() {
        return this._native.scriptName;
    }
    /** Returns the name of the external function being called. */
    get functionName() {
        return this._native.functionName;
    }
    /** Returns the positional arguments passed to the external function. */
    get args() {
        return this._native.args;
    }
    /** Returns the keyword arguments passed to the external function as an object. */
    get kwargs() {
        return this._native.kwargs;
    }
    /**
     * Resumes execution with either a return value or an exception.
     *
     * @param options - Object with either `returnValue` or `exception`
     * @returns MontySnapshot if paused at function call, MontyNameLookup if paused at
     *   name lookup, MontyComplete if done
     * @throws {MontyRuntimeError} If the code raises an exception
     */
    resume(options) {
        const result = this._native.resume(options);
        return wrapStartResult(result);
    }
    /**
     * Serializes the MontySnapshot to a binary format.
     */
    dump() {
        return this._native.dump();
    }
    /**
     * Deserializes a MontySnapshot from binary format.
     */
    static load(data, options) {
        const nativeSnapshot = NativeMontySnapshot.load(data, options);
        return new MontySnapshot(nativeSnapshot);
    }
    /** Returns a string representation of the MontySnapshot. */
    repr() {
        return this._native.repr();
    }
}
/**
 * Represents paused execution waiting for a name to be resolved.
 *
 * The host should check if the variable name corresponds to a known value
 * (e.g., an external function). Call `resume()` with the value to continue
 * execution, or call `resume()` with no value to raise `NameError`.
 */
export class MontyNameLookup {
    constructor(nativeNameLookup) {
        this._native = nativeNameLookup;
    }
    /** Returns the name of the script being executed. */
    get scriptName() {
        return this._native.scriptName;
    }
    /** Returns the name of the variable being looked up. */
    get variableName() {
        return this._native.variableName;
    }
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
    resume(options) {
        const result = this._native.resume(options);
        return wrapStartResult(result);
    }
    /**
     * Serializes the MontyNameLookup to a binary format.
     */
    dump() {
        return this._native.dump();
    }
    /**
     * Deserializes a MontyNameLookup from binary format.
     */
    static load(data, options) {
        const nativeLookup = NativeMontyNameLookup.load(data, options);
        return new MontyNameLookup(nativeLookup);
    }
    /** Returns a string representation of the MontyNameLookup. */
    repr() {
        return this._native.repr();
    }
}
/**
 * Represents completed execution with a final output value.
 */
export class MontyComplete {
    constructor(nativeComplete) {
        this._native = nativeComplete;
    }
    /** Returns the final output value from the executed code. */
    get output() {
        return this._native.output;
    }
    /** Returns a string representation of the MontyComplete. */
    repr() {
        return this._native.repr();
    }
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
export async function runMontyAsync(montyRunner, options = {}) {
    const { inputs, externalFunctions = {}, limits } = options;
    let progress = montyRunner.start({
        inputs,
        limits,
    });
    while (!(progress instanceof MontyComplete)) {
        if (progress instanceof MontyNameLookup) {
            // Name lookup — check if the name is a known external function
            const name = progress.variableName;
            const extFunction = externalFunctions[name];
            if (extFunction) {
                // Resolve the name as a function value
                progress = progress.resume({ value: extFunction });
            }
            else {
                // Unknown name — resume with no value to raise NameError
                progress = progress.resume();
            }
            continue;
        }
        // MontySnapshot — external function call
        const snapshot = progress;
        const funcName = snapshot.functionName;
        const extFunction = externalFunctions[funcName];
        if (!extFunction) {
            // Function not found — this shouldn't normally happen since NameLookup
            // would have raised NameError, but handle it defensively
            progress = snapshot.resume({
                exception: {
                    type: 'NameError',
                    message: `name '${funcName}' is not defined`,
                },
            });
            continue;
        }
        try {
            // Call the external function
            let result = extFunction(...snapshot.args, snapshot.kwargs);
            // If the result is a Promise, await it
            if (result && typeof result.then === 'function') {
                result = await result;
            }
            // Resume with the return value
            progress = snapshot.resume({ returnValue: result });
        }
        catch (error) {
            // External function threw an exception - convert to Monty exception
            const err = error;
            const excType = err.name || 'RuntimeError';
            const excMessage = err.message || String(error);
            progress = snapshot.resume({
                exception: {
                    type: excType,
                    message: excMessage,
                },
            });
        }
    }
    return progress.output;
}
//# sourceMappingURL=wrapper.js.map