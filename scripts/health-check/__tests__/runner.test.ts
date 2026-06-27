// Test di integrazione per scripts/health-check/runner.ts
// Verifica: aggregazione dei risultati da più checker mockati,
// formato del report (HealthCheckReport), gestione dei checker che lanciano eccezioni.
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Checker, CheckResult } from "../types";

// -----------------------------------------------------------------------
// Hoisted mock — CHECKERS è un array mutabile condiviso tra tutti i test.
// Ogni test lo ripopola in beforeEach tramite splice + push.
// -----------------------------------------------------------------------
const { mockCheckers } = vi.hoisted(() => ({
  mockCheckers: [] as Checker[],
}));

vi.mock("../index", () => ({
  CHECKERS: mockCheckers,
}));

// annotateSafety viene lasciata girare normalmente: aggiunge solo `safeFix`
// e non altera la struttura del report.

import { runHealthCheck } from "../runner";

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------
function makeResult(overrides: Partial<CheckResult> = {}): CheckResult {
  return {
    checkId: "T-001",
    category: "logic",
    severity: "warning",
    description: "problema di test",
    ...overrides,
  };
}

function makeChecker(
  id: string,
  run: () => Promise<CheckResult[]>,
): Checker {
  return { id, label: `Label ${id}`, category: "test", run };
}

function setCheckers(...checkers: Checker[]): void {
  mockCheckers.splice(0, mockCheckers.length, ...checkers);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCheckers.splice(0, mockCheckers.length);
});

// -----------------------------------------------------------------------
// Formato del report
// -----------------------------------------------------------------------
describe("runHealthCheck — formato del report (HealthCheckReport)", () => {
  it("restituisce tutti i campi obbligatori del report", async () => {
    setCheckers(
      makeChecker("01-alpha", async () => [makeResult()]),
    );

    const report = await runHealthCheck({
      checkerIds: ["01-alpha"],
      mode: "analysis",
      aiProvider: null,
    });

    expect(typeof report.runId).toBe("string");
    expect(report.runId.length).toBeGreaterThan(0);

    expect(typeof report.runAt).toBe("string");
    expect(() => new Date(report.runAt)).not.toThrow();

    expect(typeof report.durationMs).toBe("number");
    expect(report.durationMs).toBeGreaterThanOrEqual(0);

    expect(report.checkersRun).toEqual(["01-alpha"]);
    expect(report.mode).toBe("analysis");
    expect(report.aiProvider).toBeNull();

    expect(report.summary).toMatchObject({
      critical: expect.any(Number),
      warning: expect.any(Number),
      info: expect.any(Number),
      skipped: expect.any(Number),
    });

    expect(Array.isArray(report.checkers)).toBe(true);
    expect(report.aiAnalysis).toBeNull();
  });

  it("runId è unico tra run consecutive", async () => {
    setCheckers(makeChecker("01-alpha", async () => []));

    const [r1, r2] = await Promise.all([
      runHealthCheck({ checkerIds: ["01-alpha"], mode: "analysis", aiProvider: null }),
      runHealthCheck({ checkerIds: ["01-alpha"], mode: "analysis", aiProvider: null }),
    ]);

    expect(r1.runId).not.toBe(r2.runId);
  });

  it("aiAnalysisStatus è 'skipped' quando mode=analysis e aiProvider=null", async () => {
    setCheckers(makeChecker("01-alpha", async () => []));

    const report = await runHealthCheck({
      checkerIds: ["01-alpha"],
      mode: "analysis",
      aiProvider: null,
    });

    expect(report.aiAnalysisStatus).toBe("skipped");
  });

  it("aiAnalysisStatus è 'pending' quando aiProvider è specificato", async () => {
    setCheckers(makeChecker("01-alpha", async () => []));

    const report = await runHealthCheck({
      checkerIds: ["01-alpha"],
      mode: "analysis",
      aiProvider: "groq",
    });

    expect(report.aiAnalysisStatus).toBe("pending");
  });

  it("aiAnalysisStatus è 'pending' quando mode=fix (indipendentemente da aiProvider)", async () => {
    setCheckers(makeChecker("01-alpha", async () => []));

    const report = await runHealthCheck({
      checkerIds: ["01-alpha"],
      mode: "fix",
      aiProvider: null,
    });

    expect(report.aiAnalysisStatus).toBe("pending");
  });

  it("checkersRun include solo i checker selezionati (non tutti dal registry)", async () => {
    setCheckers(
      makeChecker("01-alpha", async () => []),
      makeChecker("02-beta", async () => []),
      makeChecker("03-gamma", async () => []),
    );

    const report = await runHealthCheck({
      checkerIds: ["01-alpha", "03-gamma"],
      mode: "analysis",
      aiProvider: null,
    });

    expect(report.checkersRun).toEqual(["01-alpha", "03-gamma"]);
    expect(report.checkers).toHaveLength(2);
    expect(report.checkers.map((c) => c.id)).toEqual(["01-alpha", "03-gamma"]);
  });
});

// -----------------------------------------------------------------------
// Aggregazione dei risultati da più checker
// -----------------------------------------------------------------------
describe("runHealthCheck — aggregazione risultati da più checker", () => {
  it("aggrega i risultati di due checker distinti", async () => {
    setCheckers(
      makeChecker("01-alpha", async () => [
        makeResult({ checkId: "A-001", severity: "critical" }),
        makeResult({ checkId: "A-002", severity: "warning" }),
      ]),
      makeChecker("02-beta", async () => [
        makeResult({ checkId: "B-001", severity: "info" }),
      ]),
    );

    const report = await runHealthCheck({
      checkerIds: ["01-alpha", "02-beta"],
      mode: "analysis",
      aiProvider: null,
    });

    expect(report.checkers).toHaveLength(2);

    const alpha = report.checkers.find((c) => c.id === "01-alpha")!;
    expect(alpha.status).toBe("ok");
    expect(alpha.results).toHaveLength(2);

    const beta = report.checkers.find((c) => c.id === "02-beta")!;
    expect(beta.status).toBe("ok");
    expect(beta.results).toHaveLength(1);
  });

  it("conteggio summary per severity è corretto su più checker", async () => {
    setCheckers(
      makeChecker("01-alpha", async () => [
        makeResult({ severity: "critical" }),
        makeResult({ severity: "warning" }),
        makeResult({ severity: "warning" }),
      ]),
      makeChecker("02-beta", async () => [
        makeResult({ severity: "info" }),
        makeResult({ severity: "critical" }),
      ]),
    );

    const report = await runHealthCheck({
      checkerIds: ["01-alpha", "02-beta"],
      mode: "analysis",
      aiProvider: null,
    });

    expect(report.summary.critical).toBe(2);
    expect(report.summary.warning).toBe(2);
    expect(report.summary.info).toBe(1);
    expect(report.summary.skipped).toBe(0);
  });

  it("checker senza risultati contribuisce con 0 al summary", async () => {
    setCheckers(
      makeChecker("01-alpha", async () => []),
      makeChecker("02-beta", async () => [makeResult({ severity: "info" })]),
    );

    const report = await runHealthCheck({
      checkerIds: ["01-alpha", "02-beta"],
      mode: "analysis",
      aiProvider: null,
    });

    expect(report.summary.info).toBe(1);
    expect(report.summary.critical).toBe(0);
    expect(report.summary.warning).toBe(0);
    expect(report.summary.skipped).toBe(0);
  });

  it("nessun checker selezionato → report vuoto con summary a zero", async () => {
    setCheckers(makeChecker("01-alpha", async () => [makeResult()]));

    const report = await runHealthCheck({
      checkerIds: [],
      mode: "analysis",
      aiProvider: null,
    });

    expect(report.checkers).toHaveLength(0);
    expect(report.checkersRun).toHaveLength(0);
    expect(report.summary).toEqual({ critical: 0, warning: 0, info: 0, skipped: 0 });
  });

  it("ogni CheckerResult ha id, status, durationMs e results", async () => {
    setCheckers(
      makeChecker("01-alpha", async () => [makeResult()]),
      makeChecker("02-beta", async () => []),
    );

    const report = await runHealthCheck({
      checkerIds: ["01-alpha", "02-beta"],
      mode: "analysis",
      aiProvider: null,
    });

    for (const cr of report.checkers) {
      expect(typeof cr.id).toBe("string");
      expect(["ok", "skipped", "error"]).toContain(cr.status);
      expect(typeof cr.durationMs).toBe("number");
      expect(cr.durationMs).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(cr.results)).toBe(true);
    }
  });

  it("annotateSafety viene applicata: ogni CheckResult ha il campo safeFix", async () => {
    setCheckers(
      makeChecker("01-alpha", async () => [
        makeResult({ category: "imports", severity: "warning" }),
        makeResult({ category: "logic", severity: "warning" }),
      ]),
    );

    const report = await runHealthCheck({
      checkerIds: ["01-alpha"],
      mode: "analysis",
      aiProvider: null,
    });

    const results = report.checkers[0].results;
    expect(results).toHaveLength(2);
    for (const r of results) {
      expect(typeof r.safeFix).toBe("boolean");
    }
    // imports/warning → safeFix true; logic/warning → safeFix false
    expect(results.find((r) => r.category === "imports")!.safeFix).toBe(true);
    expect(results.find((r) => r.category === "logic")!.safeFix).toBe(false);
  });
});

// -----------------------------------------------------------------------
// Gestione dei checker che lanciano eccezioni
// -----------------------------------------------------------------------
describe("runHealthCheck — gestione delle eccezioni nei checker", () => {
  it("un checker che lancia → status error, results vuoti, runner continua", async () => {
    setCheckers(
      makeChecker("01-alpha", async () => [makeResult({ severity: "info" })]),
      makeChecker("02-crash", async () => {
        throw new Error("checker esploso");
      }),
      makeChecker("03-gamma", async () => [makeResult({ severity: "warning" })]),
    );

    const report = await runHealthCheck({
      checkerIds: ["01-alpha", "02-crash", "03-gamma"],
      mode: "analysis",
      aiProvider: null,
    });

    expect(report.checkers).toHaveLength(3);

    const crash = report.checkers.find((c) => c.id === "02-crash")!;
    expect(crash.status).toBe("error");
    expect(crash.results).toHaveLength(0);
    expect(crash.error).toContain("checker esploso");

    const alpha = report.checkers.find((c) => c.id === "01-alpha")!;
    expect(alpha.status).toBe("ok");
    expect(alpha.results).toHaveLength(1);

    const gamma = report.checkers.find((c) => c.id === "03-gamma")!;
    expect(gamma.status).toBe("ok");
    expect(gamma.results).toHaveLength(1);
  });

  it("un checker che lancia → summary.skipped incrementato, altri severity non alterati", async () => {
    setCheckers(
      makeChecker("01-alpha", async () => [makeResult({ severity: "critical" })]),
      makeChecker("02-crash", async () => {
        throw new Error("errore imprevisto");
      }),
      makeChecker("03-gamma", async () => [makeResult({ severity: "info" })]),
    );

    const report = await runHealthCheck({
      checkerIds: ["01-alpha", "02-crash", "03-gamma"],
      mode: "analysis",
      aiProvider: null,
    });

    expect(report.summary.skipped).toBe(1);
    expect(report.summary.critical).toBe(1);
    expect(report.summary.info).toBe(1);
    expect(report.summary.warning).toBe(0);
  });

  it("tutti i checker lanciano → tutti error, summary solo skipped", async () => {
    setCheckers(
      makeChecker("01-alpha", async () => { throw new Error("A"); }),
      makeChecker("02-beta", async () => { throw new Error("B"); }),
    );

    const report = await runHealthCheck({
      checkerIds: ["01-alpha", "02-beta"],
      mode: "analysis",
      aiProvider: null,
    });

    expect(report.checkers.every((c) => c.status === "error")).toBe(true);
    expect(report.summary.skipped).toBe(2);
    expect(report.summary.critical).toBe(0);
    expect(report.summary.warning).toBe(0);
    expect(report.summary.info).toBe(0);
  });

  it("messaggio di errore del checker è preservato in CheckerResult.error", async () => {
    const errorMsg = "stack overflow simulato nel checker";
    setCheckers(
      makeChecker("01-crash", async () => {
        throw new Error(errorMsg);
      }),
    );

    const report = await runHealthCheck({
      checkerIds: ["01-crash"],
      mode: "analysis",
      aiProvider: null,
    });

    const cr = report.checkers[0];
    expect(cr.error).toBe(errorMsg);
  });
});

// -----------------------------------------------------------------------
// Callback onProgress
// -----------------------------------------------------------------------
describe("runHealthCheck — callback onProgress", () => {
  it("onProgress chiamata per ogni checker completato con successo", async () => {
    setCheckers(
      makeChecker("01-alpha", async () => [makeResult()]),
      makeChecker("02-beta", async () => []),
    );

    const calls: Array<{ id: string; status: string }> = [];

    await runHealthCheck({
      checkerIds: ["01-alpha", "02-beta"],
      mode: "analysis",
      aiProvider: null,
      onProgress: (id, status) => calls.push({ id, status }),
    });

    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual({ id: "01-alpha", status: "ok" });
    expect(calls[1]).toEqual({ id: "02-beta", status: "ok" });
  });

  it("onProgress chiamata con status error per checker che lancia", async () => {
    setCheckers(
      makeChecker("01-crash", async () => { throw new Error("boom"); }),
    );

    const calls: Array<{ id: string; status: string }> = [];

    await runHealthCheck({
      checkerIds: ["01-crash"],
      mode: "analysis",
      aiProvider: null,
      onProgress: (id, status) => calls.push({ id, status }),
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({ id: "01-crash", status: "error" });
  });

  it("onProgress riceve durationMs >= 0", async () => {
    setCheckers(makeChecker("01-alpha", async () => []));

    const durations: number[] = [];

    await runHealthCheck({
      checkerIds: ["01-alpha"],
      mode: "analysis",
      aiProvider: null,
      onProgress: (_id, _status, durationMs) => durations.push(durationMs),
    });

    expect(durations).toHaveLength(1);
    expect(durations[0]).toBeGreaterThanOrEqual(0);
  });
});
