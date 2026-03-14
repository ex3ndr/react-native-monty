// index-header.d.ts - header will be written into index.d.ts on build

type JsMontyObject = any
/**
 * A sandboxed Python interpreter instance.
 *
 * Parses and compiles Python code on initialization, then can be run
 * multiple times with different input values. This separates the parsing
 * cost from execution, making repeated runs more efficient.
 */
export declare class Monty {
  /**
   * Creates a new Monty interpreter by parsing the given code.
   *
   * Returns either a Monty instance, a MontyException (for syntax errors), or a MontyTypingError.
   * The wrapper should check the result type and throw the appropriate error.
   *
   * @param code - Python code to execute
   * @param options - Configuration options
   * @returns Monty instance on success, or error object on failure
   */
  static create(code: string, options?: MontyOptions | undefined | null): Self | MontyException | MontyTypingError
  /**
   * Performs static type checking on the code.
   *
   * Returns either nothing (success) or a MontyTypingError.
   *
   * @param prefixCode - Optional code to prepend before type checking
   * @returns null on success, or MontyTypingError on failure
   */
  typeCheck(prefixCode?: string | undefined | null): MontyTypingError | null
  /**
   * Executes the code and returns the result, or an exception object if execution fails.
   *
   * If runtime `externalFunctions` are provided, the start/resume loop is used
   * to dispatch external function calls and name lookups. Otherwise, code is
   * executed directly.
   *
   * @param options - Execution options (inputs, limits, externalFunctions)
   * @returns The result of the last expression, or a MontyException if execution fails
   */
  run(options?: RunOptions | undefined | null): JsMontyObject | MontyException
  /**
   * Starts execution and returns a snapshot (paused at external call or name lookup),
   * completion, or error.
   *
   * This method enables iterative execution where code pauses at external function
   * calls or name lookups, allowing the host to provide return values before resuming.
   *
   * @param options - Execution options (inputs, limits)
   * @returns MontySnapshot if paused at function call, MontyNameLookup if paused at
   *   name lookup, MontyComplete if done, or MontyException if failed
   */
  start(options?: StartOptions | undefined | null): MontySnapshot | MontyNameLookup | MontyComplete | MontyException
  /**
   * Serializes the Monty instance to a binary format.
   *
   * The serialized data can be stored and later restored with `Monty.load()`.
   * This allows caching parsed code to avoid re-parsing on subsequent runs.
   *
   * @returns Buffer containing the serialized Monty instance
   */
  dump(): Buffer
  /**
   * Deserializes a Monty instance from binary format.
   *
   * @param data - The serialized Monty data from `dump()`
   * @returns A new Monty instance
   */
  static load(data: Buffer): Monty
  /** Returns the script name. */
  get scriptName(): string
  /** Returns the input variable names. */
  get inputs(): Array<string>
  /** Returns a string representation of the Monty instance. */
  repr(): string
}

/**
 * Represents completed execution with a final output value.
 *
 * The output value is stored as a `MontyObject` internally and converted to JS on access.
 */
export declare class MontyComplete {
  /** Returns the final output value from the executed code. */
  get output(): JsMontyObject
  /** Returns a string representation of the MontyComplete. */
  repr(): string
}

/**
 * Wrapper around core `MontyException` for napi bindings.
 *
 * This is a thin newtype wrapper that exposes the necessary getters for the
 * JavaScript wrapper to construct appropriate error types (`MontySyntaxError`
 * or `MontyRuntimeError`) based on the exception type.
 */
export declare class MontyException {
  /**
   * Returns information about the inner Python exception.
   *
   * The `typeName` field can be used to distinguish syntax errors (`"SyntaxError"`)
   * from runtime errors (e.g., `"ValueError"`, `"TypeError"`).
   */
  get exception(): ExceptionInfo
  /** Returns the error message. */
  get message(): string
  /**
   * Returns the Monty traceback as an array of Frame objects.
   *
   * For syntax errors, this will be an empty array.
   * For runtime errors, this contains the stack frames where the error occurred.
   */
  traceback(): Array<Frame>
  /**
   * Returns formatted exception string.
   *
   * @param format - Output format:
   *   - 'traceback' - Full traceback (default)
   *   - 'type-msg' - 'ExceptionType: message' format
   *   - 'msg' - just the message
   */
  display(format?: string | undefined | null): string
  /** Returns a string representation of the error. */
  toString(): string
}
export type JsMontyException = MontyException

/**
 * Represents paused execution waiting for a name to be resolved.
 *
 * The host should check if the variable name corresponds to a known value
 * (e.g., an external function). Call `resume()` with the value to continue
 * execution, or call `resume()` with no value to raise `NameError`.
 */
export declare class MontyNameLookup {
  /** Returns the name of the script being executed. */
  get scriptName(): string
  /** Returns the name of the variable being looked up. */
  get variableName(): string
  /**
   * Resumes execution after resolving the name lookup.
   *
   * If `value` is provided, the name resolves to that value and execution continues.
   * If `value` is omitted or undefined, the VM raises a `NameError`.
   *
   * @param options - Optional object with `value` to resolve the name to
   * @returns MontySnapshot if paused at function call, MontyNameLookup if paused at
   *   another name lookup, MontyComplete if done, or MontyException if failed
   */
  resume(options?: NameLookupResumeOptions | undefined | null): MontySnapshot | Self | MontyComplete | MontyException
  /**
   * Serializes the MontyNameLookup to a binary format.
   *
   * The serialized data can be stored and later restored with `MontyNameLookup.load()`.
   *
   * @returns Buffer containing the serialized name lookup snapshot
   */
  dump(): Buffer
  /**
   * Deserializes a MontyNameLookup from binary format.
   *
   * @param data - The serialized data from `dump()`
   * @param options - Optional load options
   * @returns A new MontyNameLookup instance
   */
  static load(data: Buffer, options?: NameLookupLoadOptions | undefined | null): MontyNameLookup
  /** Returns a string representation of the MontyNameLookup. */
  repr(): string
}

/**
 * Stateful no-replay REPL session.
 *
 * Create with `new MontyRepl()` then call `feed()` to execute snippets
 * incrementally against persistent heap and namespace state.
 */
export declare class MontyRepl {
  /**
   * Creates an empty REPL session ready to receive snippets via `feed()`.
   *
   * No code is parsed or executed at construction time — all execution
   * is driven through `feed()`.
   *
   * @param options - Optional configuration (scriptName, limits)
   */
  constructor(options?: MontyReplOptions | undefined | null)
  /** Returns the script name for this REPL session. */
  get scriptName(): string
  /** Executes one incremental snippet against persistent REPL state. */
  feed(code: string): JsMontyObject | MontyException
  /** Serializes this REPL session to bytes. */
  dump(): Buffer
  /** Restores a REPL session from bytes produced by `dump()`. */
  static load(data: Buffer): MontyRepl
  /** Returns a string representation of the REPL session. */
  repr(): string
}

/**
 * Represents paused execution waiting for an external function call return value.
 *
 * Contains information about the pending external function call and allows
 * resuming execution with the return value or an exception.
 */
export declare class MontySnapshot {
  /** Returns the name of the script being executed. */
  get scriptName(): string
  /** Returns the name of the external function being called. */
  get functionName(): string
  /** Returns the positional arguments passed to the external function. */
  get args(): Array<JsMontyObject>
  /** Returns the keyword arguments passed to the external function as an object. */
  get kwargs(): object
  /**
   * Resumes execution with either a return value or an exception.
   *
   * Exactly one of `returnValue` or `exception` must be provided.
   *
   * @param options - Object with either `returnValue` or `exception`
   * @returns MontySnapshot if paused at function call, MontyNameLookup if paused at
   *   name lookup, MontyComplete if done, or MontyException if failed
   */
  resume(options: ResumeOptions): Self | MontyNameLookup | MontyComplete | MontyException
  /**
   * Serializes the MontySnapshot to a binary format.
   *
   * The serialized data can be stored and later restored with `MontySnapshot.load()`.
   * This allows suspending execution and resuming later, potentially in a different process.
   *
   * @returns Buffer containing the serialized snapshot
   */
  dump(): Buffer
  /**
   * Deserializes a MontySnapshot from binary format.
   *
   * @param data - The serialized snapshot data from `dump()`
   * @param options - Optional load options (reserved for future use)
   * @returns A new MontySnapshot instance
   */
  static load(data: Buffer, options?: SnapshotLoadOptions | undefined | null): MontySnapshot
  /** Returns a string representation of the MontySnapshot. */
  repr(): string
}

/**
 * Raised when type checking finds errors in the code.
 *
 * This exception is raised when static type analysis detects type errors.
 * Use `display()` to render diagnostics in various formats.
 */
export declare class MontyTypingError {
  /** Returns information about the inner exception. */
  get exception(): ExceptionInfo
  /** Returns the error message. */
  get message(): string
  /**
   * Renders the type error diagnostics with the specified format and color.
   *
   * @param format - Output format. One of:
   *   - 'full' - Full diagnostic output (default)
   *   - 'concise' - Concise output
   *   - 'azure' - Azure DevOps format
   *   - 'json' - JSON format
   *   - 'jsonlines' - JSON Lines format
   *   - 'rdjson' - RDJson format
   *   - 'pylint' - Pylint format
   *   - 'gitlab' - GitLab CI format
   *   - 'github' - GitHub Actions format
   * @param color - Whether to include ANSI color codes. Default: false
   */
  display(format?: string | undefined | null, color?: boolean | undefined | null): string
  /** Returns a string representation of the error. */
  toString(): string
}

/**
 * Information about the inner Python exception.
 *
 * This provides structured access to the exception type and message
 * for programmatic error handling.
 */
export interface ExceptionInfo {
  /** The exception type name (e.g., "ValueError", "TypeError", "SyntaxError"). */
  typeName: string
  /** The exception message. */
  message: string
}

/** Input for raising an exception during resume. */
export interface ExceptionInput {
  /** The exception type name (e.g., "ValueError"). */
  type: string
  /** The exception message. */
  message: string
}

/**
 * A single frame in a Monty traceback.
 *
 * Contains all the information needed to display a traceback line:
 * the file location, function name, and optional source code preview.
 */
export interface Frame {
  /** The filename where the code is located. */
  filename: string
  /** Line number (1-based). */
  line: number
  /** Column number (1-based). */
  column: number
  /** End line number (1-based). */
  endLine: number
  /** End column number (1-based). */
  endColumn: number
  /** The name of the function, or null for module-level code. */
  functionName?: string
  /** The source code line for preview in the traceback. */
  sourceLine?: string
}

/** Options for creating a new Monty instance. */
export interface MontyOptions {
  /** Name used in tracebacks and error messages. Default: 'main.py' */
  scriptName?: string
  /** List of input variable names available in the code. */
  inputs?: Array<string>
  /** Whether to perform type checking on the code. Default: false */
  typeCheck?: boolean
  /** Optional code to prepend before type checking. */
  typeCheckPrefixCode?: string
}

/**
 * Options for creating a new `MontyRepl` instance.
 *
 * Controls the script name shown in tracebacks and optional resource limits
 * that apply to all subsequent `feed()` calls.
 */
export interface MontyReplOptions {
  /** Name used in tracebacks and error messages. Default: 'main.py' */
  scriptName?: string
  /** Resource limits configuration applied to all snippet executions. */
  limits?: ResourceLimits
}

/** Options for loading a serialized name lookup snapshot. */
export interface NameLookupLoadOptions {
  /** Optional print callback function. */
  printCallback?: JsPrintCallback
}

/**
 * Options for resuming execution from a name lookup.
 *
 * If `value` is provided, the name resolves to that value and execution continues.
 * If `value` is omitted or undefined, the VM raises a `NameError`.
 */
export interface NameLookupResumeOptions {
  /** The value to provide for the name. */
  value?: unknown
}

/**
 * Resource limits configuration from JavaScript.
 *
 * All limits are optional. Omit a key to disable that limit.
 */
export interface ResourceLimits {
  /** Maximum number of heap allocations allowed. */
  maxAllocations?: number
  /** Maximum execution time in seconds. */
  maxDurationSecs?: number
  /** Maximum heap memory in bytes. */
  maxMemory?: number
  /** Run garbage collection every N allocations. */
  gcInterval?: number
  /** Maximum function call stack depth (default: 1000). */
  maxRecursionDepth?: number
}

/** Options for resuming execution. */
export interface ResumeOptions {
  /** The value to return from the external function call. */
  returnValue?: unknown
  /**
   * An exception to raise in the interpreter.
   * Format: { type: string, message: string }
   */
  exception?: ExceptionInput
}

/** Options for running code. */
export interface RunOptions {
  inputs?: object
  /** Resource limits configuration. */
  limits?: ResourceLimits
  /** Optional print callback function. */
  printCallback?: JsPrintCallback
  /**
   * Dict of external function callbacks.
   * Keys are function names, values are callable functions.
   */
  externalFunctions?: object
}

/** Options for loading a serialized snapshot. */
export interface SnapshotLoadOptions {
  /** Optional print callback function. */
  printCallback?: JsPrintCallback
}

/** Options for starting execution. */
export interface StartOptions {
  /** Dict of input variable values. */
  inputs?: object
  /** Resource limits configuration. */
  limits?: ResourceLimits
  /** Optional print callback function. */
  printCallback?: JsPrintCallback
}

/** Initializes the Monty WASM runtime. Must be awaited before usage on web. */
export declare function initMontyWasm(): Promise<Record<string, unknown>>
