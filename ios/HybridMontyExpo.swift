import Foundation

private let moduleVersion = "0.1.0"

@_silgen_name("monty_expo_run_json")
private func monty_expo_run_json(
  _ code: UnsafePointer<CChar>?,
  _ runOptionsJson: UnsafePointer<CChar>?,
  _ montyOptionsJson: UnsafePointer<CChar>?
) -> UnsafeMutablePointer<CChar>?

@_silgen_name("monty_expo_start_json")
private func monty_expo_start_json(
  _ code: UnsafePointer<CChar>?,
  _ runOptionsJson: UnsafePointer<CChar>?,
  _ montyOptionsJson: UnsafePointer<CChar>?
) -> UnsafeMutablePointer<CChar>?

@_silgen_name("monty_expo_resume_json")
private func monty_expo_resume_json(
  _ snapshotId: UnsafePointer<CChar>?,
  _ resumeOptionsJson: UnsafePointer<CChar>?
) -> UnsafeMutablePointer<CChar>?

@_silgen_name("monty_expo_string_free")
private func monty_expo_string_free(_ pointer: UnsafeMutablePointer<CChar>?)

private func normalizeOptionalJSON(_ value: String) -> String? {
  let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
  if trimmed.isEmpty || trimmed == "null" {
    return nil
  }
  return trimmed
}

private func withOptionalCString<T>(_ value: String?, body: (UnsafePointer<CChar>?) -> T) -> T {
  guard let value else {
    return body(nil)
  }
  return value.withCString { ptr in
    body(ptr)
  }
}

private func buildErrorResponse(_ message: String) -> String {
  let escapedMessage = message
    .replacingOccurrences(of: "\\", with: "\\\\")
    .replacingOccurrences(of: "\"", with: "\\\"")
  return "{\"ok\":false,\"error\":{\"typeName\":\"RuntimeError\",\"message\":\"\(escapedMessage)\",\"traceback\":[]}}"
}

class HybridMontyExpo: HybridMontyExpoSpec {
  func version() throws -> String {
    return moduleVersion
  }

  func isNativeRuntimeLinked() throws -> Bool {
    return true
  }

  func runSync(code: String, runOptionsJson: String, montyOptionsJson: String) throws -> String {
    let normalizedRunOptions = normalizeOptionalJSON(runOptionsJson)
    let normalizedMontyOptions = normalizeOptionalJSON(montyOptionsJson)

    let resultPointer = code.withCString { codePointer in
      withOptionalCString(normalizedRunOptions) { runOptionsPointer in
        withOptionalCString(normalizedMontyOptions) { montyOptionsPointer in
          monty_expo_run_json(codePointer, runOptionsPointer, montyOptionsPointer)
        }
      }
    }

    guard let resultPointer else {
      return buildErrorResponse("monty_expo_run_json returned nil")
    }

    let text = String(cString: resultPointer)
    monty_expo_string_free(resultPointer)
    return text
  }

  func startSync(code: String, runOptionsJson: String, montyOptionsJson: String) throws -> String {
    let normalizedRunOptions = normalizeOptionalJSON(runOptionsJson)
    let normalizedMontyOptions = normalizeOptionalJSON(montyOptionsJson)

    let resultPointer = code.withCString { codePointer in
      withOptionalCString(normalizedRunOptions) { runOptionsPointer in
        withOptionalCString(normalizedMontyOptions) { montyOptionsPointer in
          monty_expo_start_json(codePointer, runOptionsPointer, montyOptionsPointer)
        }
      }
    }

    guard let resultPointer else {
      return buildErrorResponse("monty_expo_start_json returned nil")
    }

    let text = String(cString: resultPointer)
    monty_expo_string_free(resultPointer)
    return text
  }

  func resumeSync(snapshotId: String, resumeOptionsJson: String) throws -> String {
    let normalizedResumeOptions = normalizeOptionalJSON(resumeOptionsJson)

    let resultPointer = snapshotId.withCString { snapshotPointer in
      withOptionalCString(normalizedResumeOptions) { resumeOptionsPointer in
        monty_expo_resume_json(snapshotPointer, resumeOptionsPointer)
      }
    }

    guard let resultPointer else {
      return buildErrorResponse("monty_expo_resume_json returned nil")
    }

    let text = String(cString: resultPointer)
    monty_expo_string_free(resultPointer)
    return text
  }
}
