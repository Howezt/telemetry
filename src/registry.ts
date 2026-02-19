import type { RuntimeAdapter, RuntimeName } from "./types.js";
import { nodeAdapter } from "./runtimes/node.js";
import { cloudflareWorkerAdapter } from "./runtimes/cloudflare-worker.js";

const adapters: RuntimeAdapter[] = [];

export function register(adapter: RuntimeAdapter): void {
  adapters.push(adapter);
}

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

export function getRegisteredAdapters(): readonly RuntimeAdapter[] {
  return adapters;
}

// Pre-register built-in adapters (detection order matters: CF Workers first, then Node)
register(cloudflareWorkerAdapter);
register(nodeAdapter);
