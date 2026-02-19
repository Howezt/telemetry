import type { RuntimeAdapter, RuntimeName } from "./types.js";
import { nodeAdapter } from "./runtimes/node.js";
import { cloudflareWorkerAdapter } from "./runtimes/cloudflare/worker.js";

const adapters: RuntimeAdapter[] = [];

/**
 * Register a custom {@link RuntimeAdapter}.
 *
 * Adapters are evaluated in registration order during auto-detection.
 *
 * @param adapter - The adapter to register.
 *
 * @example
 * ```ts
 * import { register } from "@howezt/telemetry";
 *
 * register({
 *   name: "deno",
 *   detect: () => "Deno" in globalThis,
 *   setup: (config) => { /* ... *\/ },
 * });
 * ```
 */
export function register(adapter: RuntimeAdapter): void {
  adapters.push(adapter);
}

/**
 * Resolve a {@link RuntimeAdapter} by name or by auto-detection.
 *
 * @param runtimeName - Explicit runtime name. When omitted, each registered adapter's
 *   `detect()` method is called in order and the first match is returned.
 * @returns The matched adapter.
 * @throws If no adapter matches.
 */
export function resolve(runtimeName?: RuntimeName): RuntimeAdapter {
  if (runtimeName) {
    const adapter = adapters.find((a) => a.name === runtimeName);
    if (!adapter) {
      throw new Error(`No adapter registered for runtime: ${runtimeName}`);
    }
    return adapter;
  }

  for (const adapter of adapters) {
    if (adapter.detect()) {
      return adapter;
    }
  }

  throw new Error(
    "Could not detect runtime. Provide an explicit runtime in config or register a custom adapter.",
  );
}

/**
 * Return a read-only snapshot of all currently registered adapters.
 *
 * @returns An array of registered {@link RuntimeAdapter} instances.
 */
export function getRegisteredAdapters(): readonly RuntimeAdapter[] {
  return adapters;
}

// Pre-register built-in adapters (detection order matters: CF Workers first, then Node)
register(cloudflareWorkerAdapter);
register(nodeAdapter);
