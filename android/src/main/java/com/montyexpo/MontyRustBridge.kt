package com.montyexpo

internal class MontyRustBridge {
  companion object {
    init {
      System.loadLibrary("monty_expo_ffi")
    }

    @JvmStatic
    external fun nativeRun(code: String, runOptionsJson: String?, montyOptionsJson: String?): String

    @JvmStatic
    external fun nativeStart(code: String, runOptionsJson: String?, montyOptionsJson: String?): String

    @JvmStatic
    external fun nativeResume(snapshotId: String, resumeOptionsJson: String?): String
  }
}
