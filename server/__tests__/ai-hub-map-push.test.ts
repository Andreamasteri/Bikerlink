/**
 * Task #179 — Unit tests for pushAgentModelMapToHub (server/lib/ai-hub-map-push.ts).
 *
 * Verifies:
 *   - hubPost('/vram/agent-map', …) is called once with the correct map when
 *     isHubConfigured() is true and the TC is not powered-off.
 *   - No call is made when isHubConfigured() is false.
 *   - A hubPost failure (rejects or returns ok:false) does not propagate —
 *     the function always resolves without throwing.
 *   - The TC powered-off gate prevents the call.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── shared mocks ────────────────────────────────────────────────────────────

const hubPostMock = vi.fn();
const isHubConfiguredMock = vi.fn();
const isThinkCentrePoweredOffMock = vi.fn();

vi.mock("../lib/ai-hub-client", () => ({
  isHubConfigured: () => isHubConfiguredMock(),
  hubPost: (...args: unknown[]) => hubPostMock(...args),
}));

vi.mock("../lib/thinkcentre-powered-off", () => ({
  isThinkCentrePoweredOff: () => isThinkCentrePoweredOffMock(),
}));

// Dynamic import after mocks are registered.
async function loadPush() {
  vi.resetModules();
  const mod = await import("../lib/ai-hub-map-push");
  return mod.pushAgentModelMapToHub;
}

beforeEach(() => {
  vi.clearAllMocks();
  isHubConfiguredMock.mockReturnValue(true);
  isThinkCentrePoweredOffMock.mockResolvedValue(false);
  hubPostMock.mockResolvedValue({ ok: true });

  // Set env defaults for a clean slate.
  process.env.BOWIE_OLLAMA_MODEL = "qwen3:1.7b";
  process.env.HORUS_OLLAMA_MODEL = "qwen3:4b";
  process.env.QUEBRACHO_OLLAMA_MODEL = "granite4:tiny-h";
});

describe("pushAgentModelMapToHub", () => {
  it("calls hubPost with the correct model→agent map when hub is configured and TC is on", async () => {
    const push = await loadPush();
    await push();

    expect(hubPostMock).toHaveBeenCalledTimes(1);
    const [path, body] = hubPostMock.mock.calls[0];
    expect(path).toBe("/vram/agent-map");
    expect(body).toMatchObject({
      modelAgentMap: {
        "qwen3:1.7b": "Bowie",
        "qwen3:4b": "Horus",
        "granite4:tiny-h": "Quebracho",
        "all-minilm": "Nadir",
      },
    });
  });

  it("uses env var overrides when model env vars are set to custom values", async () => {
    process.env.BOWIE_OLLAMA_MODEL = "qwen3:0.6b";
    process.env.HORUS_OLLAMA_MODEL = "qwen3:8b";
    process.env.QUEBRACHO_OLLAMA_MODEL = "granite4:micro";

    const push = await loadPush();
    await push();

    const [, body] = hubPostMock.mock.calls[0];
    expect(body.modelAgentMap["qwen3:0.6b"]).toBe("Bowie");
    expect(body.modelAgentMap["qwen3:8b"]).toBe("Horus");
    expect(body.modelAgentMap["granite4:micro"]).toBe("Quebracho");
    expect(body.modelAgentMap["all-minilm"]).toBe("Nadir");
  });

  it("does NOT call hubPost when isHubConfigured is false", async () => {
    isHubConfiguredMock.mockReturnValue(false);

    const push = await loadPush();
    await push();

    expect(hubPostMock).not.toHaveBeenCalled();
  });

  it("does NOT call hubPost when TC is powered-off", async () => {
    isThinkCentrePoweredOffMock.mockResolvedValue(true);

    const push = await loadPush();
    await push();

    expect(hubPostMock).not.toHaveBeenCalled();
  });

  it("does not throw when hubPost returns ok:false", async () => {
    hubPostMock.mockResolvedValue({ ok: false, error: "connection refused" });

    const push = await loadPush();
    await expect(push()).resolves.toBeUndefined();
    expect(hubPostMock).toHaveBeenCalledTimes(1);
  });

  it("does not throw when hubPost rejects", async () => {
    hubPostMock.mockRejectedValue(new Error("network timeout"));

    const push = await loadPush();
    await expect(push()).resolves.toBeUndefined();
  });

  it("does not throw when isThinkCentrePoweredOff rejects", async () => {
    isThinkCentrePoweredOffMock.mockRejectedValue(new Error("probe error"));

    const push = await loadPush();
    // poweredOff probe failure is caught with .catch(()=>false) → push proceeds
    await expect(push()).resolves.toBeUndefined();
    // Hub post should still be attempted since powered-off check falls back to false
    expect(hubPostMock).toHaveBeenCalledTimes(1);
  });
});
