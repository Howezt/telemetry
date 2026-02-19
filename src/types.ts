import type { MeterProvider, TracerProvider } from "@opentelemetry/api";

export type RuntimeName = "node" | "cloudflare-worker" | (string & {});

export interface SDKConfig {
  serviceName: string;
  runtime?: RuntimeName;
  exporterEndpoint?: string;
  exporterHeaders?: Record<string, string>;
  spanProcessorType?: "batch" | "simple";
  resourceAttributes?: Record<string, string>;
  enableMetrics?: boolean;
  metricsExporterEndpoint?: string;
  metricsExportIntervalMs?: number;
}

export interface RuntimeAdapter {
  name: RuntimeName;
  detect(): boolean;
  setup(config: SDKConfig): SDKResult;
}

export interface SDKResult {
  provider: TracerProvider;
  meterProvider?: MeterProvider;
  shutdown(): Promise<void>;
  forceFlush(): Promise<void>;
}
