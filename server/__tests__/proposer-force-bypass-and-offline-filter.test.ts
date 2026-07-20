import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Task #890 — runProposer: force=true e filtro KNOWN_OFFLINE_PATTERNS
//
// Due comportamenti verificati qui:
// 1. force=true — premendo "Proponi" nell'header admin, il fingerprint check
//    viene bypassato e nuove proposte vengono generate indipendentemente dalla
//    chiamata precedente. Il ciclo automatico (scheduler) NON usa force, quindi
//    il suo cooldown/fingerprint rimane invariato.
//
// 2. KNOWN_OFFLINE_PATTERNS filtra i singoli problemi offline dal batch, ma
//    NON abortisce l'intera run quando altri problemi non-offline sono presenti.
//    Esempio: vacuum.last_attempt e pool.db devono generare proposte anche se
//    dragonfly.ping_ms è nella stessa lista.
// ---------------------------------------------------------------------------

// ─── hoist mocks ────────────────────────────────────────────────────────────
const writeWatchdogLogMock = vi.hoisted(() => vi.fn().mockResolvedValue("log-id-1"));
const generateStructuredMock = vi.hoisted(() => vi.fn());
const appSettingStore = vi.hoisted(() => new Map<string, string>());

const fakeOllamaModel = vi.hoisted(() => ({
  id: "ollama-local",
  providerName: "ollama",
  modelId: "qwen3:4b",
  scheduler: <T>(f: () => Promise<T>) => f(),
}));

vi.mock("../ai/watchdog/log", () => ({
  writeWatchdogLog: writeWatchdogLogMock,
}));

vi.mock("../ai/watchdog/kill-switch", () => ({
  isWatchdogEnabled: vi.fn().mockResolvedValue(true),
}));

vi.mock("../ai/watchdog/maps-kill-switch", () => ({
  isMapsFlagEnabled: vi.fn().mockResolvedValue(false),
}));

vi.mock("../lib/thinkcentre-ignore-tests", () => ({
  isThinkCentreIgnoredForTests: vi.fn().mockResolvedValue(false),
}));

vi.mock("../ai/moderation/budget", () => ({
  withBudget: vi.fn(async (_scope: string, fn: () => Promise<unknown>) => fn()),
}));

vi.mock("../ai/moderation/log", () => ({
  logAiCall: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../ai/audit", () => ({
  logAiUsage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../ai/moderation/provider", () => ({
  estimateCostUsd: vi.fn().mockReturnValue(0.0001),
  generateStructured: generateStructuredMock,
  resolveModel: vi.fn(() => fakeOllamaModel),
  // tryBuildOllama restituisce null → saltiamo Step 0 (Ollama) e usiamo la chain cloud.
  tryBuildOllama: vi.fn(() => null),
  runWithFallback: vi.fn(async (_opts: unknown, fn: (m: unknown) => Promise<unknown>) => {
    const model = {
      id: "groq-fallback", providerName: "groq", modelId: "llama-3.3-70b-versatile",
      scheduler: <T>(f: () => Promise<T>) => f(),
    };
    const value = await fn(model);
    return { value, model };
  }),
}));

vi.mock("../storage", () => ({
  storage: {
    getAppSetting: vi.fn(async (k: string) =>
      appSettingStore.has(k) ? { value: appSettingStore.get(k)! } : null,
    ),
    upsertAppSetting: vi.fn(async (k: string, v: string) => { appSettingStore.set(k, v); }),
  },
}));

import { runProposer, _resetProposerForTests } from "../ai/watchdog/proposer";
import type { HealthSnapshot, Problem } from "../ai/watchdog/types";

// Problema non-offline (db) — deve sempre produrre proposte.
const dbProblem: Problem = {
  id: "db.vacuum.last_attempt",
  severity: "high",
  source: "db",
  title: "Vacuum non eseguito da >7 giorni",
};

// Problema noto-offline (graphhopper) — deve essere filtrato dal batch.
const ghProblem: Problem = {
  id: "health.engine.graphhopper.down",
  severity: "high",
  source: "maps",
  title: "GraphHopper non raggiungibile",
};

function snapshot(problems: Problem[]): HealthSnapshot {
  return { status: "red", score: 45, problems, metrics: {}, generatedAt: new Date().toISOString() };
}

function validGenerateStructuredResponse() {
  return {
    object: {
      proposals: [{
        title: "Esegui VACUUM manuale sul DB",
        reasoning: "Il vacuum non è stato eseguito da oltre 7 giorni — bloat in crescita.",
        riskLevel: "low" as const,
        action: { kind: "manual_only" as const, target: "db", params: null },
        affectedComponents: ["db"],
        rollbackHint: null,
      }],
    },
    usage: { inputTokens: 100, outputTokens: 80 },
  };
}

describe("proposer (Task #890) — force bypass e filtro offline", () => {
  beforeEach(() => {
    writeWatchdogLogMock.mockClear();
    generateStructuredMock.mockReset();
    appSettingStore.clear();
    _resetProposerForTests();
  });

  // ── force=true bypassa il fingerprint check ───────────────────────────────

  it("senza force=true, la seconda chiamata con stesso fingerprint viene saltata", async () => {
    generateStructuredMock.mockResolvedValue(validGenerateStructuredResponse());

    // Prima chiamata → AI chiamata, fingerprint salvato.
    const out1 = await runProposer(snapshot([dbProblem]));
    expect(out1).not.toBeNull();
    expect(generateStructuredMock).toHaveBeenCalledTimes(1);

    // Seconda chiamata con stesso snapshot → fingerprint identico → AI saltata.
    const out2 = await runProposer(snapshot([dbProblem]));
    expect(out2).toBeNull();
    expect(generateStructuredMock).toHaveBeenCalledTimes(1); // non incrementato
  });

  it("force=true bypassa il fingerprint check: l'AI viene chiamata anche con fingerprint invariato", async () => {
    generateStructuredMock.mockResolvedValue(validGenerateStructuredResponse());

    // Prima chiamata senza force → fingerprint salvato.
    const out1 = await runProposer(snapshot([dbProblem]));
    expect(out1).not.toBeNull();
    expect(generateStructuredMock).toHaveBeenCalledTimes(1);

    // Seconda chiamata con force=true e STESSO snapshot → deve chiamare l'AI.
    generateStructuredMock.mockClear();
    const out2 = await runProposer(snapshot([dbProblem]), { force: true });
    expect(out2).not.toBeNull();
    expect(generateStructuredMock).toHaveBeenCalledTimes(1);
  });

  it("chiamate successive con force=true continuano a generare proposte ogni volta", async () => {
    generateStructuredMock.mockResolvedValue(validGenerateStructuredResponse());

    for (let i = 0; i < 3; i++) {
      generateStructuredMock.mockClear();
      const out = await runProposer(snapshot([dbProblem]), { force: true });
      expect(out).not.toBeNull();
      expect(generateStructuredMock).toHaveBeenCalledTimes(1);
    }
  });

  // ── filtro KNOWN_OFFLINE_PATTERNS — singoli problemi, non il batch intero ─

  it("se TUTTI i problemi sono offline, skip (quota AI preservata)", async () => {
    // Solo GraphHopper/Valhalla → tutti known-offline → null.
    const out = await runProposer(snapshot([
      ghProblem,
      { id: "health.engine.valhalla.down", severity: "high", source: "maps", title: "Valhalla giù" },
    ]));
    expect(out).toBeNull();
    expect(generateStructuredMock).not.toHaveBeenCalled();
  });

  it("se un problema è offline ma un altro NO, l'AI viene chiamata con il problema non-offline", async () => {
    generateStructuredMock.mockResolvedValue(validGenerateStructuredResponse());

    // Mix: GraphHopper (offline) + vacuum.last_attempt (non-offline).
    const out = await runProposer(snapshot([ghProblem, dbProblem]));
    expect(out).not.toBeNull();
    expect(generateStructuredMock).toHaveBeenCalledTimes(1);

    // Il prompt passato a generateStructured deve contenere il problema db (vacuum),
    // ma NON il problema GraphHopper (è stato filtrato dal batch).
    const [, callOpts] = generateStructuredMock.mock.calls[0] as [unknown, { prompt: string }];
    expect(callOpts.prompt.toLowerCase()).toContain("vacuum");
    expect(callOpts.prompt.toLowerCase()).not.toContain("graphhopper");
  });

  it("problema dragonfly (thinkcentre pattern) filtrato: pool.db non-offline genera proposte", async () => {
    generateStructuredMock.mockResolvedValue(validGenerateStructuredResponse());

    const dragonfly: Problem = {
      id: "thinkcentre.dragonfly.ping_ms",
      severity: "high",
      source: "db",
      title: "DragonflyDB non raggiungibile",
    };
    const poolProblem: Problem = {
      id: "db.pool.waiting_count",
      severity: "high",
      source: "db",
      title: "Pool DB: connessioni in attesa elevate",
    };

    const out = await runProposer(snapshot([dragonfly, poolProblem]));
    expect(out).not.toBeNull();
    expect(generateStructuredMock).toHaveBeenCalledTimes(1);
  });
});
