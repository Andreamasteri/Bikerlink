/**
 * Regression guard — buildPersonaModels: Quebracho row absent after Task #591.
 *
 * Confirms that:
 *   1. buildPersonaModels() returns exactly { bowie, horus, ares } — no quebracho key.
 *   2. The Horus row is separately labelled "horus" in the server type
 *      (PERSONA_LABELS check is in the component; here we guard the server function).
 *   3. available=true/false/null are set correctly based on the ollama list.
 *
 * Strategy: hoist mocks for every heavy import in thinkcentre-health.ts so that
 * only the pure buildPersonaModels() function is exercised.
 */

import { describe, it, expect, vi } from "vitest";

// ── Hoisted mocks — must be declared before any import that triggers them ──

// ollama-client: expose getOllamaModelId with controllable per-persona values
const getOllamaModelIdMock = vi.hoisted(() =>
  vi.fn((persona: string) => {
    const map: Record<string, string> = {
      bowie: "qwen3:1.7b",
      horus: "qwen3:4b",
      ares:  "devstral:latest",
    };
    return map[persona] ?? "unknown";
  }),
);
vi.mock("../../lib/ollama-client", () => ({
  getOllamaModelId: getOllamaModelIdMock,
}));

// ── Stub every other import the route file pulls in ───────────────────────
vi.mock("../../db", () => ({ db: {}, withDbRetry: vi.fn() }));
vi.mock("@shared/db", () => ({ appSettings: {}, thinkcentreHealthEvents: {} }));
vi.mock("drizzle-orm", () => ({ desc: vi.fn(), eq: vi.fn() }));
vi.mock("../../lib/thinkcentre-maintenance",   () => ({ isThinkCentreInMaintenance: vi.fn(), resetThinkCentreMaintenanceCache: vi.fn() }));
vi.mock("../../lib/thinkcentre-powered-off",   () => ({ isThinkCentrePoweredOff: vi.fn(), resetThinkCentrePoweredOffCache: vi.fn() }));
vi.mock("../../lib/thinkcentre-offline",       () => ({ resetThinkCentreOfflineCache: vi.fn() }));
vi.mock("../../lib/thinkcentre-ignore-tests",  () => ({ isThinkCentreIgnoredForTests: vi.fn(), resetThinkCentreIgnoreForTestsCache: vi.fn() }));
vi.mock("./thinkcentre-health-utils",          () => ({ isStartingUp: vi.fn(), tokenFingerprint: vi.fn(() => null) }));
vi.mock("./thinkcentre-health-vn-probes",      () => ({ probeValhallaDetailed: vi.fn(), probePhotonDetailed: vi.fn(), probeUfwDetailed: vi.fn() }));
vi.mock("./thinkcentre-health-infra-probes",   () => ({ probeDragonflyInfra: vi.fn(), probeNginxInfra: vi.fn(), probeNginxSymlinksInfra: vi.fn(), probeUptimeKuma: vi.fn(), probeAiHub: vi.fn() }));
vi.mock("./thinkcentre-health-gh-probes",      () => ({ probeGraphHopperAreas: vi.fn(), probeOllama: vi.fn(), probeWhisper: vi.fn() }));
vi.mock("./thinkcentre-health-ares-probe",     () => ({ probeAres: vi.fn() }));
vi.mock("./thinkcentre-health-repodrift-probe",() => ({ probeRepoDrift: vi.fn(), fixRepoDrift: vi.fn() }));
vi.mock("../../lib/api-response",              () => ({ sendError: vi.fn() }));
vi.mock("../../storage",                       () => ({ storage: { invalidateAppSettingCache: vi.fn() } }));
vi.mock("./thinkcentre-health.part2",          () => ({ updateThinkCentreSystemStatus: vi.fn(), probeThinkCentreStatusSnapshot: vi.fn() }));
vi.mock("../../ai/watchdog/routing-correctness-probes", () => ({ getLastCorrectnessResults: vi.fn(() => ({ results: [] })) }));
vi.mock("express", () => {
  const router = { get: vi.fn(), post: vi.fn() };
  return { Router: () => router, default: { Router: () => router } };
});

// ── Unit under test ────────────────────────────────────────────────────────
import { buildPersonaModels } from "../routes/admin/thinkcentre-health";

// ══════════════════════════════════════════════════════════════════════════
// Tests
// ══════════════════════════════════════════════════════════════════════════

describe("buildPersonaModels — Quebracho removal (Task #591)", () => {

  it("returns exactly the keys bowie, horus, ares — no quebracho", () => {
    const result = buildPersonaModels(["qwen3:1.7b", "qwen3:4b"], ["devstral:latest"]);
    expect(Object.keys(result).sort()).toEqual(["ares", "bowie", "horus"]);
    expect(Object.keys(result)).not.toContain("quebracho");
  });

  it("marks bowie available:true when its model is in the TC list", () => {
    const result = buildPersonaModels(["qwen3:1.7b", "qwen3:4b"], null);
    expect(result.bowie.configured).toBe("qwen3:1.7b");
    expect(result.bowie.available).toBe(true);
  });

  it("marks horus available:true when its model is in the TC list", () => {
    const result = buildPersonaModels(["qwen3:1.7b", "qwen3:4b"], null);
    expect(result.horus.configured).toBe("qwen3:4b");
    expect(result.horus.available).toBe(true);
  });

  it("marks ares available:true when its model is in the Ares list", () => {
    const result = buildPersonaModels(null, ["devstral:latest"]);
    expect(result.ares.configured).toBe("devstral:latest");
    expect(result.ares.available).toBe(true);
  });

  it("marks bowie available:false when its model is missing from the TC list", () => {
    const result = buildPersonaModels(["some-other:model"], ["devstral:latest"]);
    expect(result.bowie.available).toBe(false);
  });

  it("marks horus available:false when its model is missing from the TC list", () => {
    const result = buildPersonaModels(["qwen3:1.7b"], ["devstral:latest"]);
    expect(result.horus.available).toBe(false);
  });

  it("marks ares available:false when its model is missing from the Ares list", () => {
    const result = buildPersonaModels(["qwen3:1.7b", "qwen3:4b"], ["other:model"]);
    expect(result.ares.available).toBe(false);
  });

  it("marks TC personas available:null when the TC list is null (probe KO)", () => {
    const result = buildPersonaModels(null, ["devstral:latest"]);
    expect(result.bowie.available).toBeNull();
    expect(result.horus.available).toBeNull();
  });

  it("marks ares available:null when the Ares list is null (probe KO)", () => {
    const result = buildPersonaModels(["qwen3:1.7b", "qwen3:4b"], null);
    expect(result.ares.available).toBeNull();
  });

  it("result shape has exactly 3 keys and no quebracho — cross-check against OllamaModelPersona", () => {
    // This is a pure server-side check: buildPersonaModels is driven by the
    // same OllamaModelPersona type as PERSONA_LABELS in the component.
    // Verifying the keys here ensures both the server response and the
    // client rendering loop (which iterates PERSONA_LABELS ⊆ PersonaModels keys)
    // will show exactly 3 rows.
    const result = buildPersonaModels([], []);
    const keys = Object.keys(result);
    expect(keys).toHaveLength(3);
    expect(keys).toContain("bowie");
    expect(keys).toContain("horus");
    expect(keys).toContain("ares");
    expect(keys).not.toContain("quebracho");
  });
});
