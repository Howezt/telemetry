import { metrics } from "@opentelemetry/api";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  MeterProvider,
  PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics";
import {
  BatchSpanProcessor,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import { detectNode } from "../detect.js";
import type { RuntimeAdapter, SDKConfig, SDKResult } from "../types.js";

export const nodeAdapter: RuntimeAdapter = {
  name: "node",
  detect: detectNode,
  setup(config: SDKConfig): SDKResult {
    const resource = resourceFromAttributes({
      [ATTR_SERVICE_NAME]: config.serviceName,
      ...config.resourceAttributes,
    });

    const traceExporter = new OTLPTraceExporter({
      url: config.exporterEndpoint,
      headers: config.exporterHeaders,
    });

    const Processor =
      config.spanProcessorType === "simple"
        ? SimpleSpanProcessor
        : BatchSpanProcessor;

    const provider = new NodeTracerProvider({
      resource,
      spanProcessors: [new Processor(traceExporter)],
    });
    provider.register();

    let meterProvider: MeterProvider | undefined;

    if (config.enableMetrics) {
      const metricExporter = new OTLPMetricExporter({
        url: config.metricsExporterEndpoint,
        headers: config.exporterHeaders,
      });

      const metricReader = new PeriodicExportingMetricReader({
        exporter: metricExporter,
        exportIntervalMillis: config.metricsExportIntervalMs ?? 60_000,
      });

      meterProvider = new MeterProvider({
        resource,
        readers: [metricReader],
      });

      metrics.setGlobalMeterProvider(meterProvider);
    }

    return {
      provider,
      meterProvider,
      async shutdown() {
        await provider.shutdown();
        await meterProvider?.shutdown();
      },
      async forceFlush() {
        await provider.forceFlush();
        await meterProvider?.forceFlush();
      },
    };
  },
};
