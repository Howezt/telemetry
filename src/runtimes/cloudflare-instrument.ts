import {
  context,
  SpanKind,
  SpanStatusCode,
  trace,
  type Span,
} from "@opentelemetry/api";
import type { SDKConfig, SDKResult } from "../types.js";
import { initSDK } from "../sdk.js";

// Minimal CF types to avoid @cloudflare/workers-types dependency
interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

interface ScheduledController {
  scheduledTime: number;
  cron: string;
  noRetry(): void;
}

interface MessageBatch<T = unknown> {
  readonly queue: string;
  readonly messages: readonly Message<T>[];
  ackAll(): void;
  retryAll(options?: MessageRetryOptions): void;
}

interface Message<T = unknown> {
  readonly id: string;
  readonly timestamp: Date;
  readonly body: T;
  readonly attempts: number;
  ack(): void;
  retry(options?: MessageRetryOptions): void;
}

interface MessageRetryOptions {
  delaySeconds?: number;
}

type FetchHandler<Env = unknown> = (
  request: Request,
  env: Env,
  ctx: ExecutionContext,
) => Response | Promise<Response>;

type ScheduledHandler<Env = unknown> = (
  controller: ScheduledController,
  env: Env,
  ctx: ExecutionContext,
) => void | Promise<void>;

type QueueHandler<Env = unknown, T = unknown> = (
  batch: MessageBatch<T>,
  env: Env,
  ctx: ExecutionContext,
) => void | Promise<void>;

interface ExportedHandler<Env = unknown> {
  fetch?: FetchHandler<Env>;
  scheduled?: ScheduledHandler<Env>;
  queue?: QueueHandler<Env>;
}

export interface InstrumentConfig<Env = unknown>
  extends Omit<SDKConfig, "runtime"> {
  handler: ExportedHandler<Env>;
}

let sdkResult: SDKResult | null = null;

function ensureSDK(config: Omit<SDKConfig, "runtime">): SDKResult {
  if (!sdkResult) {
    sdkResult = initSDK({ ...config, runtime: "cloudflare-worker" });
  }
  return sdkResult;
}

function flush(): Promise<void> {
  if (!sdkResult) return Promise.resolve();
  return sdkResult.forceFlush();
}

export function instrument<Env = unknown>(
  config: InstrumentConfig<Env>,
): ExportedHandler<Env> {
  const { handler, ...sdkConfig } = config;
  const result: ExportedHandler<Env> = {};

  if (handler.fetch) {
    const originalFetch = handler.fetch;
    result.fetch = async (
      request: Request,
      env: Env,
      ctx: ExecutionContext,
    ): Promise<Response> => {
      ensureSDK(sdkConfig);
      const tracer = trace.getTracer(sdkConfig.serviceName);
      const url = new URL(request.url);
      let span: Span | undefined;

      try {
        return await tracer.startActiveSpan(
          `${request.method} ${url.pathname}`,
          {
            kind: SpanKind.SERVER,
            attributes: {
              "http.method": request.method,
              "http.url": request.url,
              "http.target": url.pathname + url.search,
              "http.host": url.host,
            },
          },
          async (s) => {
            span = s;
            const response = await originalFetch(request, env, ctx);
            span.setAttribute("http.status_code", response.status);
            if (response.status >= 500) {
              span.setStatus({ code: SpanStatusCode.ERROR });
            }
            return response;
          },
        );
      } catch (error) {
        span?.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : String(error),
        });
        span?.recordException(error as Error);
        throw error;
      } finally {
        span?.end();
        ctx.waitUntil(flush());
      }
    };
  }

  if (handler.scheduled) {
    const originalScheduled = handler.scheduled;
    result.scheduled = async (
      controller: ScheduledController,
      env: Env,
      ctx: ExecutionContext,
    ): Promise<void> => {
      ensureSDK(sdkConfig);
      const tracer = trace.getTracer(sdkConfig.serviceName);
      let span: Span | undefined;

      try {
        await tracer.startActiveSpan(
          `scheduled ${controller.cron}`,
          {
            kind: SpanKind.INTERNAL,
            attributes: {
              "faas.trigger": "timer",
              "faas.cron": controller.cron,
              "faas.time": new Date(
                controller.scheduledTime,
              ).toISOString(),
            },
          },
          async (s) => {
            span = s;
            await originalScheduled(controller, env, ctx);
          },
        );
      } catch (error) {
        span?.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : String(error),
        });
        span?.recordException(error as Error);
        throw error;
      } finally {
        span?.end();
        ctx.waitUntil(flush());
      }
    };
  }

  if (handler.queue) {
    const originalQueue = handler.queue;
    result.queue = async (
      batch: MessageBatch,
      env: Env,
      ctx: ExecutionContext,
    ): Promise<void> => {
      ensureSDK(sdkConfig);
      const tracer = trace.getTracer(sdkConfig.serviceName);
      let span: Span | undefined;

      try {
        await tracer.startActiveSpan(
          `queue ${batch.queue}`,
          {
            kind: SpanKind.CONSUMER,
            attributes: {
              "faas.trigger": "pubsub",
              "messaging.system": "cloudflare",
              "messaging.destination": batch.queue,
              "messaging.batch.message_count": batch.messages.length,
            },
          },
          async (s) => {
            span = s;
            await originalQueue(batch, env, ctx);
          },
        );
      } catch (error) {
        span?.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : String(error),
        });
        span?.recordException(error as Error);
        throw error;
      } finally {
        span?.end();
        ctx.waitUntil(flush());
      }
    };
  }

  return result;
}

/** Reset internal SDK state (for testing) */
export function _resetInstrumentState(): void {
  sdkResult = null;
}
