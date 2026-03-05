import { type HybridObject } from "react-native-nitro-modules";

export interface MontyExpo extends HybridObject<{ ios: "swift", android: "kotlin" }> {
  version(): string;
  isNativeRuntimeLinked(): boolean;
  runSync(code: string, runOptionsJson: string, montyOptionsJson: string): string;
  startSync(code: string, runOptionsJson: string, montyOptionsJson: string): string;
  resumeSync(snapshotId: string, resumeOptionsJson: string): string;
}
