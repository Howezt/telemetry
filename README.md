# @howezt/telemetry

OpenTelemetry SDK setup abstraction for multiple runtimes. Initialise tracing (and optionally metrics) with a single function call — the library auto-detects your runtime and wires up the correct providers, exporters, and processors.

## Install

```bash
pnpm add @howezt/telemetry
```

## Quick Start — Node.js

```ts
import { initSDK } from "@howezt/telemetry";

const sdk = initSDK({
  serviceName: "my-api",
  exporterEndpoint: "https://otel.example.com/v1/traces",
});

// Graceful shutdown
process.on("SIGTERM", () => sdk.shutdown());
```

## Quick Start — Cloudflare Workers

```ts
import { instrument } from "@howezt/telemetry";

export default instrument({
  serviceName: "my-worker",
  exporterEndpoint: "https://otel.example.com/v1/traces",
  handler: {
    async fetch(request, env, ctx) {
      return new Response("Hello from Workers!");
    },
  },
});
```

## Enabling Metrics

Pass `enableMetrics: true` to start an OTLP metrics pipeline alongside tracing:

```ts
const sdk = initSDK({
  serviceName: "my-api",
  enableMetrics: true,
  metricsExporterEndpoint: "https://otel.example.com/v1/metrics",
  metricsExportIntervalMs: 30_000,
});
```

You can then use the re-exported `metrics` API:

```ts
import { metrics } from "@howezt/telemetry";

const meter = metrics.getMeter("my-api");
const counter = meter.createCounter("http.requests");
counter.add(1, { method: "GET" });
```

## Configuration Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `serviceName` | `string` | **(required)** | Logical service name in every span |
| `runtime` | `RuntimeName` | auto-detect | `"node"`, `"cloudflare-worker"`, or custom |
| `exporterEndpoint` | `string` | — | OTLP HTTP trace exporter URL |
| `exporterHeaders` | `Record<string, string>` | — | Headers for OTLP requests (e.g. auth) |
| `spanProcessorType` | `"batch" \| "simple"` | `"batch"` | Span processor strategy |
| `resourceAttributes` | `Record<string, string>` | — | Extra Resource attributes |
| `enableMetrics` | `boolean` | `false` | Enable OTLP metrics pipeline |
| `metricsExporterEndpoint` | `string` | `exporterEndpoint` | OTLP HTTP metrics exporter URL |
| `metricsExportIntervalMs` | `number` | `60000` | Metrics collection interval (ms) |

## Custom Runtime Adapters

Register a custom adapter for runtimes that aren't built-in:

```ts
import { register, initSDK } from "@howezt/telemetry";
import type { RuntimeAdapter } from "@howezt/telemetry";

const denoAdapter: RuntimeAdapter = {
  name: "deno",
  detect: () => "Deno" in globalThis,
  setup(config) {
    // Return { provider, shutdown, forceFlush } ...
  },
};

register(denoAdapter);

const sdk = initSDK({ serviceName: "deno-app" });
```

## API Reference

Full auto-generated API docs are available on [GitHub Pages](https://howezt.github.io/monitoring/).

## License

[Apache-2.0](LICENSE)
