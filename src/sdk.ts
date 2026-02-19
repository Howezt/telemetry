import { resolve } from "./registry.js";
import type { SDKConfig, SDKResult } from "./types.js";

/**
 * Initialise the OpenTelemetry SDK for the detected (or explicitly specified) runtime.
 *
 * @param config - SDK configuration options.
 * @returns An {@link SDKResult} with the active providers and lifecycle helpers.
 *
 * @example
 * ```ts
 * import { initSDK } from "@howezt/telemetry";
 *
 * const sdk = initSDK({
 *   serviceName: "my-api",
 *   exporterEndpoint: "https://otel.example.com/v1/traces",
 * });
 * ```
 */
export function initSDK(config: SDKConfig): SDKResult {
  const adapter = resolve(config.runtime);
  return adapter.setup(config);
}
