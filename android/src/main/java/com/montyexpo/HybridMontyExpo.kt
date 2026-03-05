package com.montyexpo

import com.margelo.nitro.montyexpo.HybridMontyExpoSpec

private const val MODULE_VERSION = "0.1.0"

class HybridMontyExpo : HybridMontyExpoSpec() {
  override fun version(): String {
    return MODULE_VERSION
  }

  override fun isNativeRuntimeLinked(): Boolean {
    return true
  }

  override fun runSync(code: String, runOptionsJson: String, montyOptionsJson: String): String {
    val normalizedRunOptions = runOptionsJson.takeIf { it.isNotBlank() && it != "null" }
    val normalizedMontyOptions = montyOptionsJson.takeIf { it.isNotBlank() && it != "null" }

    return try {
      MontyRustBridge.nativeRun(code, normalizedRunOptions, normalizedMontyOptions)
    } catch (error: Throwable) {
      val message = (error.message ?: "Rust bridge call failed").replace("\"", "\\\"")
      "{\"ok\":false,\"error\":{\"typeName\":\"RuntimeError\",\"message\":\"$message\",\"traceback\":[]}}"
    }
  }

  override fun startSync(code: String, runOptionsJson: String, montyOptionsJson: String): String {
    val normalizedRunOptions = runOptionsJson.takeIf { it.isNotBlank() && it != "null" }
    val normalizedMontyOptions = montyOptionsJson.takeIf { it.isNotBlank() && it != "null" }

    return try {
      MontyRustBridge.nativeStart(code, normalizedRunOptions, normalizedMontyOptions)
    } catch (error: Throwable) {
      val message = (error.message ?: "Rust bridge call failed").replace("\"", "\\\"")
      "{\"ok\":false,\"error\":{\"typeName\":\"RuntimeError\",\"message\":\"$message\",\"traceback\":[]}}"
    }
  }

  override fun resumeSync(snapshotId: String, resumeOptionsJson: String): String {
    val normalizedResumeOptions = resumeOptionsJson.takeIf { it.isNotBlank() && it != "null" }

    return try {
      MontyRustBridge.nativeResume(snapshotId, normalizedResumeOptions)
    } catch (error: Throwable) {
      val message = (error.message ?: "Rust bridge call failed").replace("\"", "\\\"")
      "{\"ok\":false,\"error\":{\"typeName\":\"RuntimeError\",\"message\":\"$message\",\"traceback\":[]}}"
    }
  }
}
