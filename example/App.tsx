import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text } from "react-native";
import {
  loadMonty,
  Monty,
  MontyRuntimeError,
  montyExpoNativeRuntimeLinked,
  montyExpoVersion,
} from "expo-monty";

type ProbeResult =
  | {
      ok: true;
      output: unknown;
    }
  | {
      ok: false;
      error: string;
    };

function formatError(error: unknown): string {
  if (error instanceof MontyRuntimeError) {
    return error.display("traceback");
  }
  return String(error);
}

function runBasicProbe(): ProbeResult {
  try {
    const monty = new Monty("def add(a, b):\n    return a + b\n\nadd(x, y)", {
      scriptName: "example.py",
      inputs: ["x", "y"],
    });
    const output = monty.run({
      inputs: {
        x: 2,
        y: 5,
      },
    });
    return {
      ok: true,
      output,
    };
  } catch (error) {
    return {
      ok: false,
      error: formatError(error),
    };
  }
}

function runExternalProbe(): ProbeResult {
  try {
    const monty = new Monty(
      "def run(value):\n    return multiply_and_add(value, 10)\n\nrun(input_value)",
      {
        scriptName: "external-function.py",
        inputs: ["input_value"],
      },
    );
    const output = monty.run({
      inputs: {
        input_value: 2,
      },
      externalFunctions: {
        multiply_and_add: (value: unknown, factor: unknown) => Number(value) * Number(factor) + 7,
      },
    });
    return {
      ok: true,
      output,
    };
  } catch (error) {
    return {
      ok: false,
      error: formatError(error),
    };
  }
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [probe, setProbe] = useState<ProbeResult | null>(null);
  const [externalFunctionProbe, setExternalFunctionProbe] = useState<ProbeResult | null>(null);

  useEffect(() => {
    let mounted = true;

    const run = async () => {
      try {
        console.log("[expo-monty example] loading Monty runtime");
        await loadMonty();
        console.log("[expo-monty example] Monty runtime loaded");

        if (!mounted) {
          return;
        }

        console.log("[expo-monty example] running basic probe");
        const nextProbe = runBasicProbe();
        console.log("[expo-monty example] running external probe");
        const nextExternalProbe = runExternalProbe();

        setProbe(nextProbe);
        setExternalFunctionProbe(nextExternalProbe);
      } catch (error) {
        console.log("[expo-monty example] load failed", error);
        if (mounted) {
          setLoadError(formatError(error));
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    run();

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>expo-monty native check</Text>
      <Text style={styles.line}>native linked: {String(montyExpoNativeRuntimeLinked())}</Text>
      <Text style={styles.line}>module version: {montyExpoVersion()}</Text>
      <Text style={styles.line}>runtime loaded: {loading ? "loading" : loadError ? "error" : "ready"}</Text>
      {loadError ? <Text style={styles.error}>{loadError}</Text> : null}

      <Text style={styles.line}>basic run result: {probe?.ok ? JSON.stringify(probe.output) : probe ? "error" : "pending"}</Text>
      {probe && !probe.ok ? <Text style={styles.error}>{probe.error}</Text> : null}

      <Text style={styles.line}>
        external call result: {externalFunctionProbe?.ok ? JSON.stringify(externalFunctionProbe.output) : externalFunctionProbe ? "error" : "pending"}
      </Text>
      {externalFunctionProbe && !externalFunctionProbe.ok ? <Text style={styles.error}>{externalFunctionProbe.error}</Text> : null}
      <StatusBar style="auto" />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    paddingTop: 72,
    gap: 10,
    backgroundColor: "#fff",
    minHeight: "100%",
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
  },
  line: {
    fontSize: 16,
  },
  error: {
    marginTop: 8,
    fontSize: 13,
    color: "#aa0000",
  },
});
