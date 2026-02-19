/**
 * @packageDocumentation
 *
 * `@howezt/telemetry` — OpenTelemetry SDK setup abstraction for multiple runtimes.
 *
 * @example
 * ```ts
 * import { initSDK } from "@howezt/telemetry";
 *
 * const sdk = initSDK({ serviceName: "my-api" });
 * ```
 */

export { initSDK } from "./sdk.js";
export { register, resolve, getRegisteredAdapters } from "./registry.js";
export { instrument } from "./runtimes/cloudflare/instrument.js";
export type { InstrumentConfig } from "./runtimes/cloudflare/instrument.js";
export { withTrace } from "./with-trace.js";
export type { WithTraceOptions } from "./with-trace.js";
export { traced } from "./traced.js";
export type { TracedInput, TracedCallContext } from "./traced.js";
export type {
  RuntimeName,
  SDKConfig,
  RuntimeAdapter,
  SDKResult,
} from "./types.js";

// Metrics API re-exports
export { metrics } from "@opentelemetry/api";
export type {
  MeterProvider,
  Meter,
  Counter,
  Histogram,
  UpDownCounter,
} from "@opentelemetry/api";
