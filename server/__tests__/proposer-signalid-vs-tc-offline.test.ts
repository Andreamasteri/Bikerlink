import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Task #909 — runProposer: signalId puntato a un problema non-TC quando il
// resto dello snapshot contiene solo pattern TC-offline.
//
// Edge-case verificato:
//   Il proposer ha un early-exit quando TUTTI i problemi high/critical sono
//   "noti offline" (GraphHopper/Valhalla/TC patterns). Quando il chiamante
//   specifica signalId, il filtro signalId viene applicato PRIMA del filtro
//   offline: così un problema non-TC viene correttamente incluso anche se
//   tutto il resto dello snapshot è roba TC-offline.
//
//   Senza questo ordinamento, il filtro offline vedrebbe la lista completa
//   (non solo il segnale target) e abortirebbe silenziosamente.
//
// Scenari coperti:
//   1. signalId non-TC + snapshot pieno di TC-offline → AI chiamata, non null.
//   2. signalId non-TC + snapshot pieno di TC-offline + force=true → AI chiamata.
//   3. signalId puntato a un problema TC-offline → la scoping-to-one avviene
//      prima del filtro offline → hiSev diventa [tcProblem] → offline-filter
//      lo rimuove → hiSev vuoto → return null (non chiama l'AI per qualcosa
//      che sappiamo irrisolvibile).
//   4. signalId non trovato tra high/critical → return null senza AI.
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

// ─── fixtures ────────────────────────────────────────────────────────────────

// Problema non-TC (DB) — è quello puntato da signalId nel test principale.
const dbCrashProblem: Problem = {
  id: "db.pool.waiting_count",
  severity: "high",
  source: "db",
  title: "Pool DB: connessioni in attesa elevate",
};

// Problemi TC-offline che riempiono il resto dello snapshot.
const tcOfflineProblems: Problem[] = [
  {
    id: "health.engine.graphhopper.down",
    severity: "high",
    source: "maps",
    title: "GraphHopper non raggiungibile",
  },
  {
    id: "health.engine.valhalla.down",
    severity: "high",
    source: "maps",
    title: "Valhalla non raggiungibile",
  },
  {
    id: "thinkcentre.tunnel_offline",
    severity: "critical",
    source: "db",
    title: "ThinkCentre tunnel offline",
  },
];

function snapshot(problems: Problem[]): HealthSnapshot {
  return { status: "red", score: 30, problems, metrics: {}, generatedAt: new Date().toISOString() };
}

function validGenerateStructuredResponse() {
  return {
    object: {
      proposals: [{
        title: "Riduci pool connections in attesa",
        reasoning: "Il pool DB ha troppe connessioni in attesa — possibile saturazione.",
        riskLevel: "medium" as const,
        action: { kind: "manual_only" as const, target: "db", params: null },
        affectedComponents: ["db"],
        rollbackHint: null,
      }],
    },
    usage: { inputTokens: 110, outputTokens: 85 },
  };
}

// ─── test suite ──────────────────────────────────────────────────────────────

describe("proposer (Task #909) — signalId su problema non-TC con snapshot pieno di TC-offline", () => {
  beforeEach(() => {
    writeWatchdogLogMock.mockClear();
    generateStructuredMock.mockReset();
    appSettingStore.clear();
    _resetProposerForTests();
  });

  it("signalId non-TC con resto snapshot tutto TC-offline → proposer NON ritorna null e chiama l'AI", async () => {
    generateStructuredMock.mockResolvedValue(validGenerateStructuredResponse());

    // Lo snapshot contiene il problema DB (target) + tutti TC-offline.
    const allProblems = [dbCrashProblem, ...tcOfflineProblems];
    const out = await runProposer(snapshot(allProblems), { signalId: dbCrashProblem.id });

    // Il proposer deve NON essere null: il filtro signalId precede il filtro offline.
    expect(out).not.toBeNull();
    // L'AI deve essere stata chiamata esattamente una volta.
    expect(generateStructuredMock).toHaveBeenCalledTimes(1);
  });

  it("il prompt inviato all'AI contiene il problema target (non-TC) e non i problemi TC-offline", async () => {
    generateStructuredMock.mockResolvedValue(validGenerateStructuredResponse());

    const allProblems = [dbCrashProblem, ...tcOfflineProblems];
    await runProposer(snapshot(allProblems), { signalId: dbCrashProblem.id });

    expect(generateStructuredMock).toHaveBeenCalledTimes(1);
    const [, callOpts] = generateStructuredMock.mock.calls[0] as [unknown, { prompt: string }];

    // Il prompt deve menzionare il problema target.
    expect(callOpts.prompt.toLowerCase()).toContain("pool");

    // Il prompt NON deve contenere i problemi TC filtrati via signalId.
    expect(callOpts.prompt.toLowerCase()).not.toContain("graphhopper");
    expect(callOpts.prompt.toLowerCase()).not.toContain("valhalla");
    expect(callOpts.prompt.toLowerCase()).not.toContain("tunnel_offline");
  });

  it("signalId non-TC + force=true con snapshot tutto TC-offline → AI chiamata correttamente", async () => {
    generateStructuredMock.mockResolvedValue(validGenerateStructuredResponse());

    // Prima chiamata senza force per impostare il fingerprint.
    const allProblems = [dbCrashProblem, ...tcOfflineProblems];
    const out1 = await runProposer(snapshot(allProblems), { signalId: dbCrashProblem.id });
    expect(out1).not.toBeNull();
    expect(generateStructuredMock).toHaveBeenCalledTimes(1);

    // Seconda chiamata con force=true e stesso snapshot → il fingerprint check è bypassato.
    generateStructuredMock.mockClear();
    const out2 = await runProposer(snapshot(allProblems), { signalId: dbCrashProblem.id, force: true });
    expect(out2).not.toBeNull();
    expect(generateStructuredMock).toHaveBeenCalledTimes(1);
  });

  it("signalId puntato a un problema TC-offline → scoping rimuove tutto via offline-filter → null, AI non chiamata", async () => {
    // Il segnale target è esso stesso un pattern TC-offline (graphhopper).
    // Dopo il signalId-filter, hiSev = [ghProblem]. Il filtro offline poi lo
    // rimuove perché è known-offline → remaining = [] → return null.
    const allProblems = [dbCrashProblem, ...tcOfflineProblems];
    const out = await runProposer(snapshot(allProblems), { signalId: "health.engine.graphhopper.down" });

    expect(out).toBeNull();
    expect(generateStructuredMock).not.toHaveBeenCalled();
  });

  it("signalId non trovato tra i problemi high/critical → null, AI non chiamata", async () => {
    // Il segnale "db.vacuum.stale" non è in hiSev → il proposer torna null
    // senza chiamare l'AI (segnale già rientrato o non high/critical).
    const allProblems = [dbCrashProblem, ...tcOfflineProblems];
    const out = await runProposer(snapshot(allProblems), { signalId: "db.vacuum.stale" });

    expect(out).toBeNull();
    expect(generateStructuredMock).not.toHaveBeenCalled();
  });

  it("senza signalId e con snapshot tutto TC-offline → null (comportamento baseline invariato)", async () => {
    // Verifica che il comportamento base (tutti TC-offline senza signalId) resti null.
    const out = await runProposer(snapshot(tcOfflineProblems));

    expect(out).toBeNull();
    expect(generateStructuredMock).not.toHaveBeenCalled();
  });
});
