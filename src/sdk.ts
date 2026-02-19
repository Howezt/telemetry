import { resolve } from "./registry.js";
import type { SDKConfig, SDKResult } from "./types.js";

export function initSDK(config: SDKConfig): SDKResult {
  const adapter = resolve(config.runtime);
  return adapter.setup(config);
}
