import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/registry.js", () => {
  const mockSetup = vi.fn();
  return {
    resolve: vi.fn().mockReturnValue({
      name: "mock-runtime",
      detect: () => true,
      setup: mockSetup,
    }),
    register: vi.fn(),
    __mockSetup: mockSetup,
  };
});

import { initSDK } from "../src/sdk.js";
import { resolve } from "../src/registry.js";

// Access the mock setup function through the module
const { __mockSetup: mockSetup } = await import("../src/registry.js") as Record<string, unknown>;

describe("initSDK", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const mockProvider = {};
    mockSetup.mockReturnValue({
      provider: mockProvider,
      shutdown: vi.fn().mockResolvedValue(undefined),
      forceFlush: vi.fn().mockResolvedValue(undefined),
    });
  });

  it("calls resolve with config.runtime", () => {
    initSDK({ serviceName: "test-service", runtime: "node" });
    expect(resolve).toHaveBeenCalledWith("node");
  });

  it("calls resolve without runtime when not provided", () => {
    initSDK({ serviceName: "test-service" });
    expect(resolve).toHaveBeenCalledWith(undefined);
  });

  it("calls adapter.setup with the full config", () => {
    const config = {
      serviceName: "test-service",
      runtime: "node" as const,
      exporterEndpoint: "http://localhost:4318",
    };
    initSDK(config);
    expect(mockSetup).toHaveBeenCalledWith(config);
  });

  it("returns the SDKResult from adapter.setup", () => {
    const result = initSDK({ serviceName: "test-service" });
    expect(result).toHaveProperty("provider");
    expect(result).toHaveProperty("shutdown");
  });

  it("shutdown function is callable", async () => {
    const result = initSDK({ serviceName: "test-service" });
    await expect(result.shutdown()).resolves.toBeUndefined();
  });

  it("returns meterProvider when adapter provides it", () => {
    const mockMeterProvider = { forceFlush: vi.fn(), shutdown: vi.fn() };
    mockSetup.mockReturnValue({
      provider: {},
      meterProvider: mockMeterProvider,
      shutdown: vi.fn().mockResolvedValue(undefined),
      forceFlush: vi.fn().mockResolvedValue(undefined),
    });
    const result = initSDK({ serviceName: "test-service", enableMetrics: true });
    expect(result.meterProvider).toBe(mockMeterProvider);
  });

  it("does not return meterProvider when adapter omits it", () => {
    const result = initSDK({ serviceName: "test-service" });
    expect(result.meterProvider).toBeUndefined();
  });
});
