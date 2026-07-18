import { describe, it, expect, vi, beforeEach } from "vitest";

// Task #591 — Horus Auto-Learn: legge pattern ricorrenti da ai_watchdog_log
// e li sintetizza col modello Horus locale. Invariante critica:
// MAI un fallback cloud — se Horus non è configurato/raggiungibile il
// ciclo si salta in silenzio.
// (Originariamente Quebracho auto-learn — unificato in Horus con Task #591.)

const isOllamaConfiguredMock = vi.hoisted(() => ({ value: true }));
const isOllamaReachableMock = vi.hoisted(() => vi.fn(async () => true));
const callOllamaChatMock = vi.hoisted(() => vi.fn(async () => "Nota di sintesi sul pattern ricorrente."));
vi.mock("../lib/ollama-client", () => ({
  get isOllamaConfigured() { return isOllamaConfiguredMock.value; },
  isOllamaReachable: isOllamaReachableMock,
  callOllamaChat: callOllamaChatMock,
}));

const withBgDbSlotMock = vi.hoisted(() => vi.fn(async (fn: () => unknown) => fn()));
vi.mock("../lib/bg-db-limiter", () => ({ withBgDbSlot: withBgDbSlotMock }));

const insertValuesMock = vi.hoisted(() => vi.fn(() => ({ onConflictDoUpdate: vi.fn(async () => ({})) })));
const dbMock = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(() => ({ values: insertValuesMock })),
}));
vi.mock("../db", () => ({ db: dbMock }));

vi.mock("@shared/db", () => ({ aiWatchdogLog: {}, aiLearnedKnowledge: {} }));

import { runHorusAutoLearnCycle, readRecurringPatterns, __resetHorusAutoLearnStateForTest } from "../ai/coordinator/horus-auto-learn";

beforeEach(() => {
  __resetHorusAutoLearnStateForTest();
  isOllamaConfiguredMock.value = true;
  isOllamaReachableMock.mockReset().mockResolvedValue(true);
  callOllamaChatMock.mockReset().mockResolvedValue("Nota di sintesi sul pattern ricorrente.");
  withBgDbSlotMock.mockReset().mockImplementation(async (fn: () => unknown) => fn());
  insertValuesMock.mockReset().mockReturnValue({ onConflictDoUpdate: vi.fn(async () => ({})) });
  dbMock.insert.mockReset().mockReturnValue({ values: insertValuesMock });
  dbMock.select.mockReset();
});

describe("runHorusAutoLearnCycle", () => {
  it("si salta senza chiamate se Horus Ollama non è configurato", async () => {
    isOllamaConfiguredMock.value = false;
    await runHorusAutoLearnCycle();
    expect(callOllamaChatMock).not.toHaveBeenCalled();
  });

  it("si salta senza chiamate se Horus non è raggiungibile (nessun fallback cloud)", async () => {
    isOllamaReachableMock.mockResolvedValue(false);
    await runHorusAutoLearnCycle();
    expect(callOllamaChatMock).not.toHaveBeenCalled();
  });

  it("non scrive nulla se non ci sono pattern ricorrenti", async () => {
    dbMock.select.mockImplementation(() => ({
      from: () => ({
        where: () => ({
          groupBy: () => ({
            having: () => ({
              orderBy: () => ({
                limit: vi.fn(async () => []),
              }),
            }),
          }),
        }),
      }),
    }));

    await runHorusAutoLearnCycle();
    expect(callOllamaChatMock).not.toHaveBeenCalled();
    expect(insertValuesMock).not.toHaveBeenCalled();
  });

  it("chiama callOllamaChat con persona horus e scrive su ai_learned_knowledge se ci sono pattern", async () => {
    // Two different DB query shapes are used:
    //   1. Grouped: select().from().where().groupBy().having().orderBy().limit() → returns pattern list
    //   2. Per-scope: select().from().where().orderBy().limit() → returns latest summary
    let callCount = 0;
    dbMock.select.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // First call: grouped aggregate query
        return {
          from: () => ({
            where: () => ({
              groupBy: () => ({
                having: () => ({
                  orderBy: () => ({
                    limit: vi.fn(async () => [
                      { scope: "routing_guard", occurrences: 5 },
                    ]),
                  }),
                }),
              }),
            }),
          }),
        };
      }
      // Second call: per-scope latest summary query
      return {
        from: () => ({
          where: () => ({
            orderBy: () => ({
              limit: vi.fn(async () => [{ summary: "Routing bloccato" }]),
            }),
          }),
        }),
      };
    });

    await runHorusAutoLearnCycle();
    expect(callOllamaChatMock).toHaveBeenCalled();
    const callArgs = callOllamaChatMock.mock.calls[0];
    // callOllamaChat(prompt, history, opts) — opts is the 3rd argument (index 2)
    expect(callArgs[2]).toMatchObject({ persona: "horus" });
    expect(insertValuesMock).toHaveBeenCalled();
  });
});

describe("readRecurringPatterns", () => {
  it("restituisce i pattern trovati nel DB", async () => {
    const grouped = [{ scope: "routing_guard", occurrences: 3 }];
    let callCount = 0;
    dbMock.select.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return {
          from: () => ({
            where: () => ({
              groupBy: () => ({
                having: () => ({
                  orderBy: () => ({
                    limit: vi.fn(async () => grouped),
                  }),
                }),
              }),
            }),
          }),
        };
      }
      return {
        from: () => ({
          where: () => ({
            orderBy: () => ({
              limit: vi.fn(async () => [{ summary: "Dettaglio" }]),
            }),
          }),
        }),
      };
    });

    const result = await readRecurringPatterns(10);
    expect(result).toHaveLength(1);
    expect(result[0].scope).toBe("routing_guard");
    expect(result[0].occurrences).toBe(3);
  });
});
