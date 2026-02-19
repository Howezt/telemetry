import type { MeterProvider, TracerProvider } from "@opentelemetry/api";

/**
 * Supported runtime identifiers.
 *
 * Built-in values are `"node"` and `"cloudflare-worker"`.
 * Any other string is accepted for custom adapters.
 */
export type RuntimeName = "node" | "cloudflare-worker" | (string & {});

/**
 * Configuration passed to {@link initSDK} to initialise tracing and (optionally) metrics.
 */
export interface SDKConfig {
  /** The logical name of the service reported in every span. */
  serviceName: string;

  /**
   * Explicit runtime to use. When omitted the SDK auto-detects
   * by calling each registered adapter's `detect()` method.
   */
  runtime?: RuntimeName;

  /** OTLP HTTP endpoint for the trace exporter (e.g. `"https://otel.example.com/v1/traces"`). */
  exporterEndpoint?: string;

  /** Additional headers sent with every OTLP export request (e.g. auth tokens). */
  exporterHeaders?: Record<string, string>;

  /**
   * Span processor strategy.
   * - `"batch"` (default) — buffers spans and exports periodically.
   * - `"simple"` — exports each span immediately.
   */
  spanProcessorType?: "batch" | "simple";

  /** Extra key/value pairs merged into the OpenTelemetry `Resource`. */
  resourceAttributes?: Record<string, string>;

  /** Set to `true` to enable the OTLP metrics pipeline alongside tracing. */
  enableMetrics?: boolean;

  /** OTLP HTTP endpoint for the metrics exporter. Falls back to `exporterEndpoint` when omitted. */
  metricsExporterEndpoint?: string;

  /** Metrics collection interval in milliseconds (default `60000`). */
  metricsExportIntervalMs?: number;
}

/**
 * A runtime-specific adapter that the SDK uses to wire up
 * providers, processors, and exporters for a given environment.
 */
export interface RuntimeAdapter {
  /** Unique identifier for this runtime (e.g. `"node"`). */
  name: RuntimeName;

  /**
   * Return `true` if the current process is running in this runtime.
   * Called during auto-detection when no explicit `runtime` is provided.
   */
  detect(): boolean;

  /**
   * Create providers, processors, and exporters for this runtime.
   *
   * @param config - SDK configuration supplied by the caller.
   * @returns An {@link SDKResult} containing the initialised providers plus lifecycle helpers.
   */
  setup(config: SDKConfig): SDKResult;
}

/**
 * The object returned by {@link initSDK} after the SDK has been initialised.
 */
export interface SDKResult {
  /** The active `TracerProvider`. */
  provider: TracerProvider;

  /** The active `MeterProvider` (present only when `enableMetrics` is `true`). */
  meterProvider?: MeterProvider;

  /** Gracefully shut down all providers and flush pending data. */
  shutdown(): Promise<void>;

  /** Force-flush all pending spans and metrics without shutting down. */
  forceFlush(): Promise<void>;
}
