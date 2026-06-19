/**
 * Task #4443 — Test di regressione per la fix "batching probe" (Task #4436).
 *
 * runPipelineChecks esegue le probe in batch da 3 in parallelo (non tutte
 * insieme) per non saturare il pool DB da 10 connessioni. Con 13 check totali
 * la concorrenza massima osservata deve essere esattamente 3.
 *
 * Pattern: mock di tutti i moduli check con fn che tracciano la concorrenza,
 * mock di watchdog/log e server/db (per il salvataggio storico).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => {
  const state = { current: 0, max: 0, total: 0 };
  const make = (pipeline: string) => async () => {
    state.current++;
    state.total++;
    if (state.current > state.max) state.max = state.current;
    await new Promise((r) => setTimeout(r, 15));
    state.current--;
    return {
      pipeline,
      label: pipeline,
      overall: "ok" as const,
      steps: [],
      suggestedFix: null,
      durationMs: 0,
    };
  };
  return { state, make };
});

vi.mock("../ai/pipeline-monitor/checks/telemetry", () => ({
  checkTelemetryRide: h.make("telemetry_ride"),
  checkTelemetryMaps: h.make("telemetry_maps"),
}));
vi.mock("../ai/pipeline-monitor/checks/matching", () => ({ checkMatching: h.make("matching") }));
vi.mock("../ai/pipeline-monitor/checks/campaigns", () => ({ checkCampaigns: h.make("campaigns") }));
vi.mock("../ai/pipeline-monitor/checks/misc", () => ({
  checkNotifications: h.make("notifications"),
  checkOta: h.make("ota"),
  checkGps: h.make("gps"),
  checkEmbeddingBio: h.make("embedding_bio"),
  checkEmbeddingMusic: h.make("embedding_music"),
  checkChat: h.make("chat"),
  checkRoadHazards: h.make("road_hazards"),
  checkAiAssistant: h.make("ai_assistant"),
  checkSessionCrash: h.make("session_crash"),
}));

vi.mock("../ai/watchdog/log", () => ({ writeWatchdogLog: vi.fn().mockResolvedValue(null) }));

vi.mock("../db", () => ({
  db: { insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue(undefined) })) },
}));

import { runPipelineChecks } from "../ai/pipeline-monitor/runner";

beforeEach(() => {
  h.state.current = 0;
  h.state.max = 0;
  h.state.total = 0;
});

describe("runPipelineChecks — batching da 3", () => {
  it("esegue tutti i 13 check con concorrenza massima 3", async () => {
    const result = await runPipelineChecks({ scope: "all", triggeredBy: "manual" });

    expect(h.state.total).toBe(13);
    expect(h.state.max).toBe(3);
    expect(result.pipelines).toHaveLength(13);
    expect(result.overall).toBe("ok");
  });

  it("con scope singolo esegue un solo check (concorrenza 1)", async () => {
    const result = await runPipelineChecks({ scope: "ota", triggeredBy: "manual" });

    expect(h.state.total).toBe(1);
    expect(h.state.max).toBe(1);
    expect(result.pipelines).toHaveLength(1);
    expect(result.pipelines[0].pipeline).toBe("ota");
  });
});
