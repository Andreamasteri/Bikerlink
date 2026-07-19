import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Task #25 — Il proposer di routing di Horus gestisce il namespace "horus"
// (correttezza routing/geocoding) che il proposer generico esclude, genera la
// proposta col prompt dedicato + firma persona:"horus", e la scrive con lo
// stesso meccanismo (writeWatchdogLog) così appare nel pannello admin.
//
// Isoliamo la logica mockando le dipendenze esterne (provider AI, log, storage,
// kill-switch, offline-flags). TC marcato offline → si salta Ollama e si usa la
// chain cloud mockata (deterministica).
// ---------------------------------------------------------------------------

const writeWatchdogLogMock = vi.hoisted(() => vi.fn().mockResolvedValue("log-id-1"));
const generateStructuredMock = vi.hoisted(() => vi.fn());
const appSettingStore = vi.hoisted(() => new Map<string, string>());
// Controls whether isOllamaConfigured is truthy within a test.
const ollamaConfiguredRef = vi.hoisted(() => ({ value: false }));

vi.mock("../ai/watchdog/log", () => ({
  writeWatchdogLog: writeWatchdogLogMock,
}));

vi.mock("../ai/watchdog/kill-switch", () => ({
  isWatchdogEnabled: vi.fn().mockResolvedValue(true),
}));

vi.mock("../lib/thinkcentre-ignore-tests", () => ({
  isThinkCentreIgnoredForTests: vi.fn().mockResolvedValue(false),
}));

// TC offline → runHorusRoutingProposer salta Ollama e va sulla chain cloud mockata.
vi.mock("../lib/thinkcentre-offline", () => ({
  isThinkCentreOffline: vi.fn().mockResolvedValue(true),
}));

vi.mock("../lib/ollama-client", () => ({
  get isOllamaConfigured() { return ollamaConfiguredRef.value; },
  getOllamaModel: vi.fn(),
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
  // Chain cloud: costruisce un modello fittizio e invoca la fn.
  runWithFallback: vi.fn(async (_opts: unknown, fn: (m: unknown) => Promise<unknown>) => {
    const model = {
      id: "groq", providerName: "groq", modelId: "gpt-oss-20b",
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

import {
  runHorusRoutingProposer,
  filterHorusProblems,
  buildHorusProposerPrompt,
  _resetHorusProposerForTests,
} from "../ai/watchdog/horus-proposer";
import type { HealthSnapshot, Problem } from "../ai/watchdog/types";
import { isThinkCentreOffline } from "../lib/thinkcentre-offline";
import { getOllamaModel } from "../lib/ollama-client";
import { runWithFallback } from "../ai/moderation/provider";

const valhallaKO: Problem = {
  id: "horus.routing.valhalla.correct",
  severity: "critical",
  source: "horus",
  title: "Routing valhalla: correttezza KO — percorso implausibile (0.2km per 480km attesi)",
  suggestion: "valhalla risponde ma restituisce un percorso non plausibile. Verifica i tile sul ThinkCentre.",
  detail: JSON.stringify({ reachable: true, plausible: false, distanceKm: 0.2, reason: "implausible_short" }),
};

const photonKO: Problem = {
  id: "horus.geocoding.photon.correct",
  severity: "high",
  source: "horus",
  title: "Geocoding Photon: correttezza KO — risultato vuoto",
  detail: JSON.stringify({ reachable: true, plausible: false, reason: "empty_result" }),
};

// Rumore: problemi NON routing e routing di severity bassa → devono essere ignorati.
const dbNoise: Problem = { id: "db.ping", severity: "high", source: "db", title: "DB ping lento" };
const horusWarn: Problem = { id: "horus.pipeline.correct", severity: "warn", source: "horus", title: "Pipeline degradata" };

function snapshot(problems: Problem[]): HealthSnapshot {
  return { status: "red", score: 40, problems, metrics: {}, generatedAt: new Date().toISOString() };
}

describe("horus routing proposer (Task #25)", () => {
  beforeEach(() => {
    writeWatchdogLogMock.mockClear();
    generateStructuredMock.mockReset();
    vi.mocked(runWithFallback).mockClear();
    appSettingStore.clear();
    _resetHorusProposerForTests();
    // Default: TC offline + Ollama non configurato (comportamento dei test precedenti).
    vi.mocked(isThinkCentreOffline).mockResolvedValue(true);
    ollamaConfiguredRef.value = false;
  });

  it("filterHorusProblems seleziona solo i problemi horus high/critical", () => {
    const got = filterHorusProblems([valhallaKO, photonKO, dbNoise, horusWarn]);
    expect(got.map((p) => p.id)).toEqual([
      "horus.routing.valhalla.correct",
      "horus.geocoding.photon.correct",
    ]);
  });

  it("buildHorusProposerPrompt include i log reali dei motori (coerenza)", () => {
    const prompt = buildHorusProposerPrompt([valhallaKO, photonKO], snapshot([valhallaKO, photonKO]));
    expect(prompt).toContain("Routing valhalla: correttezza KO");
    expect(prompt).toContain("implausible_short");
    expect(prompt).toContain("Geocoding Photon");
    // Il rumore non-routing non entra nel prompt.
    expect(prompt).not.toContain("DB ping");
  });

  it("genera una proposta a firma Horus coerente coi log, scritta via writeWatchdogLog", async () => {
    generateStructuredMock.mockResolvedValue({
      object: {
        proposals: [{
          title: "Rebuild tile Valhalla sul ThinkCentre",
          reasoning: "Valhalla è raggiungibile ma restituisce percorsi implausibili (0.2km): probabile corruzione tile.",
          riskLevel: "high",
          action: { kind: "manual_only", target: "valhalla", params: null },
          affectedComponents: ["valhalla"],
          rollbackHint: "Ripristina i tile dal backup precedente.",
        }],
      },
      usage: { inputTokens: 100, outputTokens: 80 },
    });

    const out = await runHorusRoutingProposer(snapshot([valhallaKO, dbNoise]));

    expect(out).not.toBeNull();
    expect(out!.proposals).toHaveLength(1);
    // Prompt di sistema DEDICATO (voce di Horus), non quello generico.
    const [, callOpts] = generateStructuredMock.mock.calls[0] as [unknown, { system: string; prompt: string; providerOptions?: Record<string, Record<string, unknown>> }];
    expect(callOpts.system).toContain("Horus");
    expect(callOpts.prompt).toContain("valhalla");

    // Task #858 — think:false OBBLIGATORIO per generateObject (JSON strutturato).
    // Con think:true su Ollama 0.30.11 + qwen3, il path non-streaming restituisce 400 Bad Request.
    expect(callOpts.providerOptions).toMatchObject({ ollama: { think: false } });

    // Scritta con lo stesso meccanismo + firma persona:"horus".
    expect(writeWatchdogLogMock).toHaveBeenCalledTimes(1);
    const entry = writeWatchdogLogMock.mock.calls[0][0] as {
      kind: string; status: string; details: { persona?: string; title?: string };
    };
    expect(entry.kind).toBe("proposal");
    expect(entry.status).toBe("pending");
    expect(entry.details.persona).toBe("horus");
    expect(entry.details.title).toContain("Valhalla");
  });

  it("ritorna null se non ci sono problemi di routing (namespace horus)", async () => {
    const out = await runHorusRoutingProposer(snapshot([dbNoise, horusWarn]));
    expect(out).toBeNull();
    expect(generateStructuredMock).not.toHaveBeenCalled();
  });

  it("path TC online: enforces think:false sul modello Ollama di Horus (Task #863)", async () => {
    // Arrange — ThinkCentre raggiungibile + Ollama configurato con modello fittizio.
    vi.mocked(isThinkCentreOffline).mockResolvedValue(false);
    ollamaConfiguredRef.value = true;
    // getOllamaModel deve restituire un valore non-null (viene castato a LanguageModelV2 internamente).
    vi.mocked(getOllamaModel).mockReturnValue({} as ReturnType<typeof getOllamaModel>);

    generateStructuredMock.mockResolvedValue({
      object: {
        proposals: [{
          title: "Rebuild tile Valhalla (via Ollama)",
          reasoning: "Percorso implausibile rilevato da Horus.",
          riskLevel: "high",
          action: { kind: "manual_only", target: "valhalla", params: null },
          affectedComponents: ["valhalla"],
          rollbackHint: "Ripristina tile dal backup.",
        }],
      },
      usage: { inputTokens: 90, outputTokens: 70 },
    });

    const out = await runHorusRoutingProposer(snapshot([valhallaKO]));

    // Act + Assert
    expect(out).not.toBeNull();
    expect(generateStructuredMock).toHaveBeenCalledTimes(1);

    const [, callOpts] = generateStructuredMock.mock.calls[0] as [
      unknown,
      { system: string; prompt: string; providerOptions?: Record<string, Record<string, unknown>> },
    ];

    // Task #858/#863 — think:false OBBLIGATORIO anche sul path Ollama diretto (TC online).
    // Con think:true su Ollama 0.30.11 + qwen3 non-streaming, generateObject riceve 400 Bad Request.
    expect(callOpts.providerOptions).toMatchObject({ ollama: { think: false } });

    // Il mock non lancia Bad Request → nessun fallback cloud deve essere stato chiamato.
    // runWithFallback NON deve essere invocato quando Ollama è live e risponde.
    expect(vi.mocked(runWithFallback)).not.toHaveBeenCalled();
  });

  it("fingerprint: non rigenera se il set di problemi routing è invariato", async () => {
    generateStructuredMock.mockResolvedValue({
      object: { proposals: [] },
      usage: { inputTokens: 10, outputTokens: 5 },
    });
    await runHorusRoutingProposer(snapshot([valhallaKO]));
    const secondCall = await runHorusRoutingProposer(snapshot([valhallaKO]));
    expect(secondCall).toBeNull();
    // La prima chiamata invoca l'AI, la seconda è saltata dal fingerprint.
    expect(generateStructuredMock).toHaveBeenCalledTimes(1);
  });
});
