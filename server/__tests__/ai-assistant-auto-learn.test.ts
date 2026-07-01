// Task #5330 — Garantisce che l'auto-apprendimento di Bowie NON usi MAI un
// modello cloud a pagamento (Groq/Gemini/OpenAI), nemmeno come fallback.
//
// Il ciclo (`runCycle`) è esportato apposta per essere testabile in isolamento.
// L'unica via di generazione consentita è `callOllamaChat` (modello locale). Se
// Ollama non è configurato o non è raggiungibile il ciclo si salta SENZA
// fallback. Questo test è la rete di sicurezza contro un refactor futuro che
// introduca silenziosamente un fallback cloud e bruci quota a pagamento.
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock Ollama client (modello locale) ──────────────────────────────────────
const ollama = vi.hoisted(() => ({
  configured: true,
  reachable: true,
  chat: vi.fn(async () => "Risposta locale generata da Bowie sul modello Ollama."),
  modelId: vi.fn(() => "bikerlink:latest"),
}));

vi.mock("../lib/ollama-client", () => ({
  get isOllamaConfigured() {
    return ollama.configured;
  },
  isOllamaReachable: vi.fn(async () => ollama.reachable),
  callOllamaChat: ollama.chat,
  getOllamaModelId: ollama.modelId,
}));

// ── Spy sul provider cloud (chain Groq → Gemini → OpenAI) ─────────────────────
// runWithFallback è l'UNICO entry point del fallback cloud a pagamento. Se un
// refactor futuro lo invocasse dal job di auto-apprendimento, questa spia lo
// catturerebbe e il test fallirebbe.
const cloud = vi.hoisted(() => ({ runWithFallback: vi.fn() }));
vi.mock("../ai/moderation/provider", () => ({
  runWithFallback: cloud.runWithFallback,
}));

// ── Mock client cloud diretti (difesa in profondità) ──────────────────────────
const groqSpy = vi.hoisted(() => ({ getGroqModel: vi.fn(), getGroqParseModel: vi.fn() }));
vi.mock("../lib/groq-client", () => ({
  isGroqConfigured: true,
  getGroqModel: groqSpy.getGroqModel,
  getGroqParseModel: groqSpy.getGroqParseModel,
}));

// ── Mock DB (drizzle) con supporto a transaction READ ONLY ────────────────────
const dbState = vi.hoisted(() => ({
  gapRows: [] as Record<string, unknown>[],
  inserted: [] as Record<string, unknown>[],
  updates: [] as Record<string, unknown>[],
}));

vi.mock("../db", () => {
  const selectChain = (rows: Record<string, unknown>[]) => {
    const p: Record<string, unknown> = {};
    p.from = () => p;
    p.where = () => p;
    p.orderBy = () => p;
    p.limit = () => Promise.resolve(rows);
    return p;
  };
  const tx = {
    execute: vi.fn(() => Promise.resolve()),
    select: () => selectChain(dbState.gapRows),
  };
  return {
    db: {
      transaction: (fn: (t: typeof tx) => unknown) => Promise.resolve(fn(tx)),
      insert: () => ({
        values: (v: Record<string, unknown>) => ({
          onConflictDoUpdate: () => {
            dbState.inserted.push(v);
            return Promise.resolve();
          },
        }),
      }),
      update: () => ({
        set: (v: Record<string, unknown>) => ({
          where: () => {
            dbState.updates.push(v);
            return Promise.resolve();
          },
        }),
      }),
      select: () => selectChain([]),
    },
    pool: { query: vi.fn(), connect: vi.fn() },
  };
});

vi.mock("../lib/bg-db-limiter", () => ({
  withBgDbSlot: (fn: () => unknown) => Promise.resolve(fn()),
}));

import {
  isOllamaReachable,
  callOllamaChat,
  getOllamaModelId,
} from "../lib/ollama-client";
import { runWithFallback } from "../ai/moderation/provider";
import { getGroqModel, getGroqParseModel } from "../lib/groq-client";
import { runCycle, getAutoLearnStats, __resetAutoLearnStateForTest } from "../ai/assistant/auto-learn";

/** Asserisce che NESSUN provider cloud sia stato toccato durante il ciclo. */
function expectNoCloudUsage() {
  expect(runWithFallback).not.toHaveBeenCalled();
  expect(getGroqModel).not.toHaveBeenCalled();
  expect(getGroqParseModel).not.toHaveBeenCalled();
}

beforeEach(() => {
  __resetAutoLearnStateForTest();
  ollama.configured = true;
  ollama.reachable = true;
  ollama.chat.mockClear();
  ollama.chat.mockImplementation(async () => "Risposta locale generata da Bowie sul modello Ollama.");
  ollama.modelId.mockClear();
  (isOllamaReachable as unknown as ReturnType<typeof vi.fn>).mockClear();
  cloud.runWithFallback.mockClear();
  groqSpy.getGroqModel.mockClear();
  groqSpy.getGroqParseModel.mockClear();
  dbState.gapRows = [];
  dbState.inserted = [];
  dbState.updates = [];
});

describe("auto-learn runCycle — invariante local-only (nessun cloud)", () => {
  it("salta il ciclo quando Ollama NON è configurato (nessun cloud, nessun DB)", async () => {
    ollama.configured = false;
    dbState.gapRows = [{ id: "g1", question: "come funziona il matching?", persona: "bowie" }];

    await runCycle();

    expect(isOllamaReachable).not.toHaveBeenCalled(); // esce prima ancora del probe
    expect(callOllamaChat).not.toHaveBeenCalled();
    expect(dbState.inserted).toHaveLength(0);
    expectNoCloudUsage();
  });

  it("salta il ciclo quando Ollama è configurato ma NON raggiungibile (nessun fallback cloud)", async () => {
    ollama.reachable = false;
    dbState.gapRows = [{ id: "g1", question: "come funziona il matching?", persona: "bowie" }];

    await runCycle();

    expect(isOllamaReachable).toHaveBeenCalledTimes(1);
    expect(callOllamaChat).not.toHaveBeenCalled();
    expect(dbState.inserted).toHaveLength(0);
    expectNoCloudUsage();
  });

  it("con Ollama raggiungibile genera SOLO in locale e non tocca mai il cloud", async () => {
    dbState.gapRows = [
      { id: "g1", question: "come funziona il matching?", persona: "bowie" },
      { id: "g2", question: "come cambio la mia moto nel profilo?", persona: "bowie" },
    ];

    await runCycle();

    expect(callOllamaChat).toHaveBeenCalledTimes(2); // una per lacuna, solo locale
    expect(getOllamaModelId).toHaveBeenCalled();
    expect(dbState.inserted).toHaveLength(2); // apprese e persistite
    expect(dbState.inserted[0]?.source).toBe("auto-learn:gap");
    expect(getAutoLearnStats().totalLearned).toBe(2);
    expectNoCloudUsage();
  });

  it("nessuna lacuna aperta: nessuna generazione, nessun cloud", async () => {
    dbState.gapRows = [];

    await runCycle();

    expect(callOllamaChat).not.toHaveBeenCalled();
    expect(dbState.inserted).toHaveLength(0);
    expectNoCloudUsage();
  });

  it("anche se il modello locale fallisce, NON scala mai a un provider cloud", async () => {
    ollama.chat.mockImplementation(async () => {
      throw new Error("ollama timeout");
    });
    dbState.gapRows = [{ id: "g1", question: "come funziona il matching?", persona: "bowie" }];

    await runCycle();

    expect(callOllamaChat).toHaveBeenCalledTimes(1); // tentato in locale...
    expect(dbState.inserted).toHaveLength(0); // ...ma niente appreso
    expectNoCloudUsage(); // e MAI un fallback cloud
  });
});
