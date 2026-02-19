export { initSDK } from "./sdk.js";
export { register, resolve, getRegisteredAdapters } from "./registry.js";
export { instrument } from "./runtimes/cloudflare-instrument.js";
export type { InstrumentConfig } from "./runtimes/cloudflare-instrument.js";
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
