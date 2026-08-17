import { describe, expect, it, vi } from "vitest";
import { submitAiHubJob } from "./ai-hub-job-adapter";

describe("inactive AI-Hub adapter", () => {
  it("does not submit traffic while the flag is off", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const previous = process.env.AI_HUB_WIRING_ENABLED;
    delete process.env.AI_HUB_WIRING_ENABLED;

    const result = await submitAiHubJob({
      job_type: "create_soundtrack",
      request_id: "test-request",
      correlation_id: "test-correlation",
      idempotency_key: "test-idempotency",
      requested_agent: "nadir",
      capability: "audio.create_soundtrack",
      payload: { mode_config_ref: "nadir.audio_creation" },
    });

    expect(result).toMatchObject({ ok: false, status: "disabled" });
    expect(fetchSpy).not.toHaveBeenCalled();

    if (previous === undefined) delete process.env.AI_HUB_WIRING_ENABLED;
    else process.env.AI_HUB_WIRING_ENABLED = previous;
    fetchSpy.mockRestore();
  });

  it("rejects an agent/capability mismatch before network activity", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    process.env.AI_HUB_WIRING_ENABLED = "true";
    process.env.AI_HUB_CONTROL_URL = "https://example.invalid";
    process.env.AI_HUB_BEARER_TOKEN = "test-only";

    const result = await submitAiHubJob({
      job_type: "create_soundtrack",
      request_id: "test-request",
      correlation_id: "test-correlation",
      idempotency_key: "test-idempotency",
      requested_agent: "horus",
      capability: "audio.create_soundtrack",
      payload: {},
    });

    expect(result).toMatchObject({ ok: false, status: "error", error: "capability_agent_mismatch" });
    expect(fetchSpy).not.toHaveBeenCalled();

    delete process.env.AI_HUB_WIRING_ENABLED;
    delete process.env.AI_HUB_CONTROL_URL;
    delete process.env.AI_HUB_BEARER_TOKEN;
    fetchSpy.mockRestore();
  });
});
