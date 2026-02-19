import {
  context,
  propagation,
  ROOT_CONTEXT,
  SpanKind,
  SpanStatusCode,
  trace,
  type Context,
  type TextMapSetter,
} from "@opentelemetry/api";
import type { SDKConfig } from "../../types.js";
import { ensureSDK } from "./instrument.js";

// Minimal CF Workflow types to avoid @cloudflare/workers-types dependency
interface WorkflowStepConfig {
  retries?: { limit: number; delay?: string; backoff?: string };
  timeout?: string;
}

interface WorkflowStep {
  do<T>(name: string, callback: () => Promise<T>): Promise<T>;
  do<T>(
    name: string,
    config: WorkflowStepConfig,
    callback: () => Promise<T>,
  ): Promise<T>;
  sleep(name: string, duration: string): Promise<void>;
  sleepUntil(name: string, timestamp: Date | string): Promise<void>;
}

const objectSetter: TextMapSetter<Record<string, string>> = {
  set(carrier, key, value) {
    carrier[key] = value;
  },
};

/**
 * Configuration for {@link instrumentWorkflow}.
 */
export type InstrumentWorkflowOptions = Omit<
  SDKConfig,
  "runtime" | "instrumentations"
>;

/**
 * Run `fn` inside a new span, recording errors and ending the span automatically.
 */
async function withSpan<T>(
  parentCtx: Context,
  name: string,
  fn: () => Promise<T>,
): Promise<T> {
  const tracer = trace.getTracer("workflow");
  return tracer.startActiveSpan(
    name,
    { kind: SpanKind.INTERNAL },
    parentCtx,
    async (span) => {
      try {
        return await fn();
      } catch (error) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : String(error),
        });
        span.recordException(error as Error);
        throw error;
      } finally {
        span.end();
      }
    },
  );
}

function tracedDo(
  target: WorkflowStep,
  parentCtxPromise: Promise<Context>,
): WorkflowStep["do"] {
  return (async (
    name: string,
    configOrCallback: WorkflowStepConfig | (() => Promise<unknown>),
    maybeCallback?: () => Promise<unknown>,
  ) => {
    const parentCtx = await parentCtxPromise;
    const [config, callback] =
      typeof configOrCallback === "function"
        ? [undefined, configOrCallback]
        : [configOrCallback, maybeCallback!];

    return withSpan(parentCtx, name, () =>
      config !== undefined
        ? target.do(name, config, callback)
        : target.do(name, callback),
    );
  }) as WorkflowStep["do"];
}

function tracedSleep(
  target: WorkflowStep,
  parentCtxPromise: Promise<Context>,
): WorkflowStep["sleep"] {
  return async (name: string, duration: string) => {
    const parentCtx = await parentCtxPromise;
    return withSpan(parentCtx, name, () => target.sleep(name, duration));
  };
}

function tracedSleepUntil(
  target: WorkflowStep,
  parentCtxPromise: Promise<Context>,
): WorkflowStep["sleepUntil"] {
  return async (name: string, timestamp: Date | string) => {
    const parentCtx = await parentCtxPromise;
    return withSpan(parentCtx, name, () =>
      target.sleepUntil(name, timestamp),
    );
  };
}

/**
 * Create a traced step Proxy that intercepts `do`, `sleep`, and `sleepUntil`
 * to create OpenTelemetry spans. Unknown methods/properties pass through to
 * the original step (forward-compatible with future CF API changes).
 *
 * @internal
 */
function createTracedStep(
  step: WorkflowStep,
  traceparent?: string,
): WorkflowStep {
  const parentCtxPromise = (async () => {
    let tp = traceparent;
    if (!tp) {
      const carrier: Record<string, string> = {};
      propagation.inject(context.active(), carrier, objectSetter);
      tp = carrier.traceparent ?? "";
    }
    const persisted: string = await step.do("__traceparent", () =>
      Promise.resolve(tp!),
    );
    return persisted
      ? propagation.extract(ROOT_CONTEXT, { traceparent: persisted })
      : context.active();
  })();

  // Cache wrapped methods so the Proxy doesn't create new functions on every access
  const methodCache = new Map<string | symbol, unknown>();

  return new Proxy(step, {
    get(target, prop, receiver) {
      if (prop === "do" || prop === "sleep" || prop === "sleepUntil") {
        let cached = methodCache.get(prop);
        if (!cached) {
          if (prop === "do") cached = tracedDo(target, parentCtxPromise);
          else if (prop === "sleep")
            cached = tracedSleep(target, parentCtxPromise);
          else cached = tracedSleepUntil(target, parentCtxPromise);
          methodCache.set(prop, cached);
        }
        return cached;
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}

/**
 * TC39 class decorator that instruments a Cloudflare Workflow with OpenTelemetry tracing.
 *
 * Intercepts the `run` method to:
 * 1. Initialise the SDK (handles fresh isolates after hibernation)
 * 2. Auto-extract `__traceparent` from `event.payload` for cross-workflow propagation
 * 3. Create a root `workflow.run` span wrapping the entire execution
 * 4. Wrap the `step` object with traced versions of `do`, `sleep`, and `sleepUntil`
 *
 * @param opts - SDK configuration. `env` falls back to `this.env` from WorkflowEntrypoint at runtime.
 * @returns A TC39 class decorator.
 *
 * @example
 * ```ts
 * import { instrumentWorkflow } from "@howezt/telemetry";
 *
 * @instrumentWorkflow({ serviceName: "my-workflow" })
 * export class MyWorkflow extends WorkflowEntrypoint {
 *   async run(event: WorkflowEvent, step: WorkflowStep) {
 *     await step.do("fetch-data", async () => { ... });
 *   }
 * }
 * ```
 */
export function instrumentWorkflow(opts: InstrumentWorkflowOptions = {}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TC39 decorator constraint requires `any`
  return function <T extends abstract new (...args: any[]) => any>(
    target: T,
    _context: ClassDecoratorContext<T>,
  ): T {
    const originalRun = target.prototype.run;
    target.prototype.run = async function (
      event: { payload?: Record<string, unknown> },
      step: WorkflowStep,
    ) {
      const env = opts.env ?? this.env;
      const sdkOpts = { ...opts, env };

      // Auto-extract traceparent from payload
      let traceparent: string | undefined;
      if (
        event?.payload &&
        typeof event.payload === "object" &&
        "__traceparent" in event.payload
      ) {
        traceparent = event.payload.__traceparent as string;
      }

      ensureSDK(sdkOpts);
      const tracedStep = createTracedStep(step, traceparent);

      // Root span wrapping the entire workflow run
      const tracer = trace.getTracer("workflow");
      const rootCtx = traceparent
        ? propagation.extract(ROOT_CONTEXT, { traceparent })
        : context.active();

      return tracer.startActiveSpan(
        "workflow.run",
        { kind: SpanKind.INTERNAL },
        rootCtx,
        async (span) => {
          try {
            return await originalRun.call(this, event, tracedStep);
          } catch (error) {
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message:
                error instanceof Error ? error.message : String(error),
            });
            span.recordException(error as Error);
            throw error;
          } finally {
            span.end();
          }
        },
      );
    };
    return target;
  };
}

/**
 * Inject the current trace context into workflow params for cross-workflow propagation.
 *
 * @param params - The params object to augment.
 * @returns A new object with `__traceparent` added.
 *
 * @example
 * ```ts
 * const params = injectTraceparent({ userId: "abc" });
 * await env.CHILD_WORKFLOW.create({ params });
 * ```
 */
export function injectTraceparent<T extends Record<string, unknown>>(
  params: T,
): T & { __traceparent: string } {
  const carrier: Record<string, string> = {};
  propagation.inject(context.active(), carrier, objectSetter);
  return { ...params, __traceparent: carrier.traceparent ?? "" };
}

/**
 * Extract trace context from workflow params received via cross-workflow propagation.
 *
 * @param params - The params object containing `__traceparent`.
 * @returns An object with cleaned `params` (without `__traceparent`) and the extracted `traceparent`.
 *
 * @example
 * ```ts
 * const { params: clean, traceparent } = extractTraceparent(event.payload);
 * ```
 */
export function extractTraceparent<T extends Record<string, unknown>>(
  params: T,
): { params: Omit<T, "__traceparent">; traceparent: string | undefined } {
  const { __traceparent, ...rest } = params;
  return {
    params: rest as Omit<T, "__traceparent">,
    traceparent: typeof __traceparent === "string" ? __traceparent : undefined,
  };
}
