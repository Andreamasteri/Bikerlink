import { describe, it, expect, vi, beforeEach } from "vitest";

// Task #10 (Quebracho c) — Autolearning di Quebracho: legge pattern ricorrenti
// da ai_watchdog_log e li sintetizza col modello locale. Invariante critica:
// MAI un fallback cloud — se Quebracho non è configurato/raggiungibile il
// ciclo si salta in silenzio.

const isQuebrachoConfiguredMock = vi.hoisted(() => ({ value: true }));
const isQuebrachoReachableMock = vi.hoisted(() => vi.fn(async () => true));
const streamQuebrachoChatMock = vi.hoisted(() => vi.fn(async () => ({ text: "Nota di sintesi sul pattern ricorrente." })));
const getQuebrachoModelIdMock = vi.hoisted(() => vi.fn(() => "quebracho-model:latest"));
vi.mock("../lib/quebracho-client", () => ({
  get isQuebrachoConfigured() { return isQuebrachoConfiguredMock.value; },
  isQuebrachoReachable: isQuebrachoReachableMock,
  streamQuebrachoChat: streamQuebrachoChatMock,
  getQuebrachoModelId: getQuebrachoModelIdMock,
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

import { runQuebrachoAutoLearnCycle, readRecurringPatterns, __resetQuebrachoAutoLearnStateForTest } from "../ai/coordinator/quebracho-auto-learn";

beforeEach(() => {
  __resetQuebrachoAutoLearnStateForTest();
  isQuebrachoConfiguredMock.value = true;
  isQuebrachoReachableMock.mockReset().mockResolvedValue(true);
  streamQuebrachoChatMock.mockReset().mockResolvedValue({ text: "Nota di sintesi sul pattern ricorrente." });
  getQuebrachoModelIdMock.mockReset().mockReturnValue("quebracho-model:latest");
  withBgDbSlotMock.mockReset().mockImplementation(async (fn: () => unknown) => fn());
  insertValuesMock.mockReset().mockReturnValue({ onConflictDoUpdate: vi.fn(async () => ({})) });
  dbMock.insert.mockReset().mockReturnValue({ values: insertValuesMock });
  dbMock.select.mockReset();
});

describe("runQuebrachoAutoLearnCycle", () => {
  it("si salta senza chiamate se Quebracho non è configurato", async () => {
    isQuebrachoConfiguredMock.value = false;
    await runQuebrachoAutoLearnCycle();
    expect(streamQuebrachoChatMock).not.toHaveBeenCalled();
  });

  it("si salta senza chiamate se Quebracho non è raggiungibile (nessun fallback cloud)", async () => {
    isQuebrachoReachableMock.mockResolvedValue(false);
    await runQuebrachoAutoLearnCycle();
    expect(streamQuebrachoChatMock).not.toHaveBeenCalled();
  });

  it("non scrive nulla se non ci sono pattern ricorrenti", async () => {
    dbMock.select.mockImplementation(() => ({
      from: () => ({
        where: () => ({
          groupBy: () => ({
            having: () => ({
              orderBy: () => ({ limit: async () => [] }),
            }),
          }),
        }),
      }),
    }));
    await runQuebrachoAutoLearnCycle();
    expect(dbMock.insert).not.toHaveBeenCalled();
  });
});

describe("readRecurringPatterns", () => {
  it("mappa gli scope raggruppati con l'ultimo summary osservato", async () => {
    let call = 0;
    dbMock.select.mockImplementation(() => {
      call++;
      if (call === 1) {
        return {
          from: () => ({
            where: () => ({
              groupBy: () => ({
                having: () => ({
                  orderBy: () => ({ limit: async () => [{ scope: "guard_x", occurrences: 5 }] }),
                }),
              }),
            }),
          }),
        };
      }
      return {
        from: () => ({
          where: () => ({
            orderBy: () => ({ limit: async () => [{ summary: "ultimo dettaglio" }] }),
          }),
        }),
      };
    });
    const patterns = await readRecurringPatterns(3);
    expect(patterns).toEqual([{ scope: "guard_x", occurrences: 5, latestSummary: "ultimo dettaglio" }]);
  });
});
