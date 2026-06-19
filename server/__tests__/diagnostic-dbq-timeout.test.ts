import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks — refs shared between vi.mock factory and test body.
//
// Design: transactionFn creates a fresh per-transaction execute recorder so
// txExecuteCalls[i] = all SQL objects passed to tx.execute for the i-th
// db.transaction call.
//   txExecuteCalls[i][0] = SET LOCAL (must always be first)
//   txExecuteCalls[i][1] = the actual diagnostic query
// ---------------------------------------------------------------------------
const mocks = vi.hoisted(() => {
  const txExecuteCalls: unknown[][] = [];

  const transactionFn = vi.fn(
    async (fn: (tx: { execute: (q: unknown) => Promise<unknown> }) => Promise<unknown>) => {
      const callsThisTx: unknown[] = [];
      txExecuteCalls.push(callsThisTx);

      const mockTx = {
        execute: vi.fn(async (q: unknown) => {
          callsThisTx.push(q);
          return { rows: [{ cnt: "0" }] };
        }),
      };

      return fn(mockTx);
    },
  );

  return { txExecuteCalls, transactionFn };
});

vi.mock("../db", () => ({
  db: { transaction: mocks.transactionFn },
}));

vi.mock("../ai/watchdog/internal-token", () => ({
  getInternalProbeToken: vi.fn(() => "test-token"),
  getInternalProbeHeaderName: vi.fn(() => "x-internal-probe"),
}));

import {
  checkNotifications,
  checkGps,
  checkChat,
  checkEmbeddingBio,
  checkEmbeddingMusic,
  checkAiAssistant,
  checkSessionCrash,
} from "../ai/pipeline-monitor/checks/misc";

// ---------------------------------------------------------------------------
// Helper — flatten drizzle SQL queryChunks to plain text.
//
// drizzle SQL object shape (verified against actual runtime output):
//   { queryChunks: Array<StringChunk | SQL> }
//   StringChunk: { value: string[] }   ← value is an array, not a plain string
//   SQL: { queryChunks: [...] }        ← nested SQL (e.g. sql.raw())
// ---------------------------------------------------------------------------
function extractSqlText(sqlObj: unknown): string {
  const obj = sqlObj as { queryChunks?: unknown[]; value?: unknown };
  if (Array.isArray(obj?.value)) {
    return (obj.value as string[]).join("");
  }
  if (Array.isArray(obj?.queryChunks)) {
    return (obj.queryChunks as unknown[]).map(extractSqlText).join("");
  }
  return "";
}

// ---------------------------------------------------------------------------
// Extract the numeric timeout value from a SET LOCAL statement_timeout string.
// Returns NaN if the pattern is not found.
//
// Example: "SET LOCAL statement_timeout = 5000" → 5000
// Uses a regex that captures only the decimal digits immediately after "=",
// preventing substring false-positives (e.g. "50000" must not match "5000").
// ---------------------------------------------------------------------------
function extractTimeoutValue(text: string): number {
  const m = text.match(/SET\s+LOCAL\s+statement_timeout\s*=\s*(\d+)/i);
  return m ? parseInt(m[1], 10) : NaN;
}

// ---------------------------------------------------------------------------
// Reset per-test
// ---------------------------------------------------------------------------
beforeEach(() => {
  mocks.txExecuteCalls.length = 0;
  mocks.transactionFn.mockClear();
});

// ---------------------------------------------------------------------------
// Contract 1 — every dbq call uses db.transaction (never a bare query)
// ---------------------------------------------------------------------------
describe("dbq — transaction gate", () => {
  it("checkNotifications usa db.transaction per ogni query DB", async () => {
    await checkNotifications();
    expect(mocks.transactionFn).toHaveBeenCalled();
  });

  it("checkGps usa db.transaction per ogni query DB", async () => {
    await checkGps();
    expect(mocks.transactionFn).toHaveBeenCalled();
  });

  it("checkChat usa db.transaction per ogni query DB", async () => {
    await checkChat();
    expect(mocks.transactionFn).toHaveBeenCalled();
  });

  it("checkEmbeddingBio usa db.transaction per ogni query DB", async () => {
    await checkEmbeddingBio();
    expect(mocks.transactionFn).toHaveBeenCalled();
  });

  it("checkEmbeddingMusic usa db.transaction per ogni query DB", async () => {
    await checkEmbeddingMusic();
    expect(mocks.transactionFn).toHaveBeenCalled();
  });

  it("checkAiAssistant usa db.transaction per ogni query DB", async () => {
    await checkAiAssistant();
    expect(mocks.transactionFn).toHaveBeenCalled();
  });

  it("checkSessionCrash usa db.transaction per ogni query DB", async () => {
    await checkSessionCrash();
    expect(mocks.transactionFn).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Contract 2 — SET LOCAL statement_timeout is the FIRST execute in every tx
// ---------------------------------------------------------------------------
describe("dbq — SET LOCAL statement_timeout è sempre il primo execute", () => {
  async function assertTimeoutFirst(checkFn: () => Promise<unknown>) {
    await checkFn();

    expect(mocks.txExecuteCalls.length).toBeGreaterThan(0);

    for (let i = 0; i < mocks.txExecuteCalls.length; i++) {
      const calls = mocks.txExecuteCalls[i];
      expect(calls.length).toBeGreaterThanOrEqual(1);

      const firstText = extractSqlText(calls[0]);
      expect(firstText, `tx[${i}] first execute deve essere SET LOCAL statement_timeout`).toMatch(
        /SET\s+LOCAL\s+statement_timeout/i,
      );
    }
  }

  it("checkNotifications", async () => assertTimeoutFirst(checkNotifications));
  it("checkGps", async () => assertTimeoutFirst(checkGps));
  it("checkChat", async () => assertTimeoutFirst(checkChat));
  it("checkEmbeddingBio", async () => assertTimeoutFirst(checkEmbeddingBio));
  it("checkEmbeddingMusic", async () => assertTimeoutFirst(checkEmbeddingMusic));
  it("checkAiAssistant", async () => assertTimeoutFirst(checkAiAssistant));
  it("checkSessionCrash", async () => assertTimeoutFirst(checkSessionCrash));
});

// ---------------------------------------------------------------------------
// Contract 3 — the timeout value must be exactly 5000 ms
// ---------------------------------------------------------------------------
describe("dbq — DIAGNOSTIC_STMT_TIMEOUT_MS deve essere 5000", () => {
  async function assertTimeoutValue(checkFn: () => Promise<unknown>) {
    await checkFn();

    expect(mocks.txExecuteCalls.length).toBeGreaterThan(0);

    for (let i = 0; i < mocks.txExecuteCalls.length; i++) {
      const calls = mocks.txExecuteCalls[i];
      const firstText = extractSqlText(calls[0]);
      const timeoutMs = extractTimeoutValue(firstText);

      expect(timeoutMs, `tx[${i}] SET LOCAL deve impostare timeout esattamente a 5000ms (trovato: ${timeoutMs})`).toBe(5000);
    }
  }

  it("checkNotifications — timeout è 5000ms", async () => assertTimeoutValue(checkNotifications));
  it("checkGps — timeout è 5000ms", async () => assertTimeoutValue(checkGps));
  it("checkChat — timeout è 5000ms", async () => assertTimeoutValue(checkChat));
  it("checkEmbeddingBio — timeout è 5000ms", async () => assertTimeoutValue(checkEmbeddingBio));
  it("checkEmbeddingMusic — timeout è 5000ms", async () => assertTimeoutValue(checkEmbeddingMusic));
  it("checkAiAssistant — timeout è 5000ms", async () => assertTimeoutValue(checkAiAssistant));
  it("checkSessionCrash — timeout è 5000ms", async () => assertTimeoutValue(checkSessionCrash));
});

// ---------------------------------------------------------------------------
// Regression guard — fails if SET LOCAL is removed or moved after the query
// ---------------------------------------------------------------------------
describe("dbq — regression guard (rimozione SET LOCAL o cambio valore)", () => {
  it("il primo execute di ogni tx è SET LOCAL con 5000 (checkNotifications)", async () => {
    await checkNotifications();

    const firstCall = mocks.txExecuteCalls[0]?.[0];
    expect(firstCall, "nessuna transazione registrata").toBeDefined();

    const text = extractSqlText(firstCall);
    expect(text).toMatch(/SET\s+LOCAL\s+statement_timeout/i);
    expect(extractTimeoutValue(text), "il valore del timeout deve essere esattamente 5000ms").toBe(5000);
  });

  it("ogni tx ha almeno 2 execute: SET LOCAL + query diagnostica", async () => {
    await checkNotifications();

    expect(mocks.txExecuteCalls.length).toBeGreaterThan(0);

    for (let i = 0; i < mocks.txExecuteCalls.length; i++) {
      expect(
        mocks.txExecuteCalls[i].length,
        `tx[${i}] deve avere almeno 2 execute (SET LOCAL + query)`,
      ).toBeGreaterThanOrEqual(2);
    }
  });

  it("il secondo execute NON è SET LOCAL (è la query diagnostica reale)", async () => {
    await checkNotifications();

    expect(mocks.txExecuteCalls.length).toBeGreaterThan(0);

    for (let i = 0; i < mocks.txExecuteCalls.length; i++) {
      const calls = mocks.txExecuteCalls[i];
      if (calls.length < 2) continue;

      const secondText = extractSqlText(calls[1]);
      expect(
        secondText,
        `tx[${i}] secondo execute non deve essere un altro SET LOCAL`,
      ).not.toMatch(/SET\s+LOCAL\s+statement_timeout/i);
    }
  });
});
