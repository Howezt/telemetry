import { describe, it, expect, vi, beforeEach } from "vitest";
import { SpanStatusCode } from "@opentelemetry/api";

// Mock initSDK - all fns defined inside factory to avoid hoisting issues
const { mockForceFlush } = vi.hoisted(() => ({
  mockForceFlush: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../src/sdk.js", () => {
  return {
    initSDK: vi.fn().mockReturnValue({
      provider: {},
      meterProvider: {},
      shutdown: vi.fn().mockResolvedValue(undefined),
      forceFlush: mockForceFlush,
    }),
  };
});

// Mock the trace API
const mockSpanFns = {
  setAttribute: vi.fn(),
  setStatus: vi.fn(),
  recordException: vi.fn(),
  end: vi.fn(),
};

vi.mock("@opentelemetry/api", async () => {
  const actual = await vi.importActual("@opentelemetry/api");
  return {
    ...actual,
    trace: {
      getTracer: () => ({
        startActiveSpan: (_name: string, _opts: unknown, fn: (...args: unknown[]) => unknown) =>
          fn(mockSpanFns),
      }),
    },
  };
});

import {
  instrument,
  _resetInstrumentState,
} from "../src/runtimes/cloudflare/instrument.js";
import { initSDK } from "../src/sdk.js";

function createMockCtx() {
  return {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
  };
}

describe("instrument", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetInstrumentState();
  });

  describe("fetch handler", () => {
    it("wraps fetch handler and creates a span", async () => {
      const originalFetch = vi.fn().mockResolvedValue(new Response("ok"));
      const handler = instrument({
        serviceName: "test-service",
        handler: { fetch: originalFetch },
      });

      const req = new Request("https://example.com/api/test");
      const ctx = createMockCtx();

      const response = await handler.fetch!(req, {}, ctx);

      expect(originalFetch).toHaveBeenCalledWith(req, {}, ctx);
      expect(response).toBeInstanceOf(Response);
      expect(mockSpanFns.setAttribute).toHaveBeenCalledWith(
        "http.status_code",
        200,
      );
      expect(mockSpanFns.end).toHaveBeenCalled();
      expect(ctx.waitUntil).toHaveBeenCalled();
    });

    it("sets error status on 5xx responses", async () => {
      const originalFetch = vi
        .fn()
        .mockResolvedValue(new Response("error", { status: 500 }));
      const handler = instrument({
        serviceName: "test-service",
        handler: { fetch: originalFetch },
      });

      const ctx = createMockCtx();
      await handler.fetch!(new Request("https://example.com/"), {}, ctx);

      expect(mockSpanFns.setStatus).toHaveBeenCalledWith({
        code: SpanStatusCode.ERROR,
      });
    });

    it("records exception on thrown error", async () => {
      const error = new Error("fetch failed");
      const originalFetch = vi.fn().mockRejectedValue(error);
      const handler = instrument({
        serviceName: "test-service",
        handler: { fetch: originalFetch },
      });

      const ctx = createMockCtx();
      await expect(
        handler.fetch!(new Request("https://example.com/"), {}, ctx),
      ).rejects.toThrow("fetch failed");

      expect(mockSpanFns.setStatus).toHaveBeenCalledWith({
        code: SpanStatusCode.ERROR,
        message: "fetch failed",
      });
      expect(mockSpanFns.recordException).toHaveBeenCalledWith(error);
      expect(mockSpanFns.end).toHaveBeenCalled();
      expect(ctx.waitUntil).toHaveBeenCalled();
    });
  });

  describe("scheduled handler", () => {
    it("wraps scheduled handler and creates a span", async () => {
      const originalScheduled = vi.fn().mockResolvedValue(undefined);
      const handler = instrument({
        serviceName: "test-service",
        handler: { scheduled: originalScheduled },
      });

      const controller = {
        scheduledTime: Date.now(),
        cron: "*/5 * * * *",
        noRetry: vi.fn(),
      };
      const ctx = createMockCtx();

      await handler.scheduled!(controller, {}, ctx);

      expect(originalScheduled).toHaveBeenCalledWith(controller, {}, ctx);
      expect(mockSpanFns.end).toHaveBeenCalled();
      expect(ctx.waitUntil).toHaveBeenCalled();
    });

    it("records exception on thrown error", async () => {
      const error = new Error("scheduled failed");
      const originalScheduled = vi.fn().mockRejectedValue(error);
      const handler = instrument({
        serviceName: "test-service",
        handler: { scheduled: originalScheduled },
      });

      const controller = {
        scheduledTime: Date.now(),
        cron: "*/5 * * * *",
        noRetry: vi.fn(),
      };
      const ctx = createMockCtx();

      await expect(
        handler.scheduled!(controller, {}, ctx),
      ).rejects.toThrow("scheduled failed");

      expect(mockSpanFns.recordException).toHaveBeenCalledWith(error);
      expect(mockSpanFns.end).toHaveBeenCalled();
      expect(ctx.waitUntil).toHaveBeenCalled();
    });
  });

  describe("queue handler", () => {
    it("wraps queue handler and creates a span", async () => {
      const originalQueue = vi.fn().mockResolvedValue(undefined);
      const handler = instrument({
        serviceName: "test-service",
        handler: { queue: originalQueue },
      });

      const batch = {
        queue: "my-queue",
        messages: [
          {
            id: "1",
            timestamp: new Date(),
            body: "msg1",
            attempts: 1,
            ack: vi.fn(),
            retry: vi.fn(),
          },
        ],
        ackAll: vi.fn(),
        retryAll: vi.fn(),
      };
      const ctx = createMockCtx();

      await handler.queue!(batch, {}, ctx);

      expect(originalQueue).toHaveBeenCalledWith(batch, {}, ctx);
      expect(mockSpanFns.end).toHaveBeenCalled();
      expect(ctx.waitUntil).toHaveBeenCalled();
    });
  });

  describe("auto-init SDK", () => {
    it("initializes SDK on first call", async () => {
      const handler = instrument({
        serviceName: "auto-init-test",
        handler: { fetch: vi.fn().mockResolvedValue(new Response("ok")) },
      });

      const ctx = createMockCtx();
      await handler.fetch!(new Request("https://example.com/"), {}, ctx);

      expect(initSDK).toHaveBeenCalledWith({
        serviceName: "auto-init-test",
        runtime: "cloudflare-worker",
      });
    });

    it("does not re-initialize SDK on subsequent calls", async () => {
      const handler = instrument({
        serviceName: "auto-init-test",
        handler: { fetch: vi.fn().mockResolvedValue(new Response("ok")) },
      });

      const ctx = createMockCtx();
      await handler.fetch!(new Request("https://example.com/"), {}, ctx);
      await handler.fetch!(new Request("https://example.com/other"), {}, ctx);

      expect(initSDK).toHaveBeenCalledTimes(1);
    });
  });

  describe("handler passthrough", () => {
    it("does not wrap handlers that are not defined", () => {
      const handler = instrument({
        serviceName: "test-service",
        handler: {},
      });

      expect(handler.fetch).toBeUndefined();
      expect(handler.scheduled).toBeUndefined();
      expect(handler.queue).toBeUndefined();
    });
  });

  describe("flush", () => {
    it("calls waitUntil with forceFlush promise", async () => {
      const handler = instrument({
        serviceName: "test-service",
        handler: { fetch: vi.fn().mockResolvedValue(new Response("ok")) },
      });

      const ctx = createMockCtx();
      await handler.fetch!(new Request("https://example.com/"), {}, ctx);

      expect(ctx.waitUntil).toHaveBeenCalled();
      const waitUntilArg = ctx.waitUntil.mock.calls[0][0];
      expect(waitUntilArg).toBeInstanceOf(Promise);
    });

    it("forceFlush is called on each request (flushes traces and metrics)", async () => {
      const handler = instrument({
        serviceName: "test-service",
        enableMetrics: true,
        handler: { fetch: vi.fn().mockResolvedValue(new Response("ok")) },
      });

      const ctx = createMockCtx();
      await handler.fetch!(new Request("https://example.com/"), {}, ctx);

      // waitUntil is called with the result of flush(), which calls sdkResult.forceFlush()
      expect(ctx.waitUntil).toHaveBeenCalled();
      // Await the promise to ensure forceFlush was invoked
      await ctx.waitUntil.mock.calls[0][0];
      expect(mockForceFlush).toHaveBeenCalled();
    });
  });
});
