import {
  context,
  metrics,
  propagation,
  trace,
  type TracerProvider,
} from "@opentelemetry/api";
import {
  CompositePropagator,
  W3CBaggagePropagator,
  W3CTraceContextPropagator,
} from "@opentelemetry/core";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  MeterProvider,
  PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics";
import {
  BasicTracerProvider,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import { detectCloudflareWorker } from "../detect.js";
import type { RuntimeAdapter, SDKConfig, SDKResult } from "../types.js";

export const cloudflareWorkerAdapter: RuntimeAdapter = {
  name: "cloudflare-worker",
  detect: detectCloudflareWorker,
  setup(config: SDKConfig): SDKResult {
    const resource = resourceFromAttributes({
      [ATTR_SERVICE_NAME]: config.serviceName,
      ...config.resourceAttributes,
    });

    const provider = new BasicTracerProvider({ resource });

    const traceExporter = new OTLPTraceExporter({
      url: config.exporterEndpoint,
      headers: config.exporterHeaders,
    });

    provider.addSpanProcessor(new SimpleSpanProcessor(traceExporter));

    // Manually register global provider and propagator for CF Workers
    trace.setGlobalTracerProvider(provider as unknown as TracerProvider);
    propagation.setGlobalPropagator(
      new CompositePropagator({
        propagators: [
          new W3CTraceContextPropagator(),
          new W3CBaggagePropagator(),
        ],
      }),
    );

    let meterProvider: MeterProvider | undefined;

    if (config.enableMetrics) {
      const metricExporter = new OTLPMetricExporter({
        url: config.metricsExporterEndpoint,
        headers: config.exporterHeaders,
      });

      const metricReader = new PeriodicExportingMetricReader({
        exporter: metricExporter,
        exportIntervalMillis: 2_147_483_647, // Disable periodic; rely on manual flush via ctx.waitUntil
      });

      meterProvider = new MeterProvider({
        resource,
        readers: [metricReader],
      });

      metrics.setGlobalMeterProvider(meterProvider);
    }

    return {
      provider: provider as unknown as TracerProvider,
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
