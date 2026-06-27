// Test unitari per scripts/health-check/checkers/known-errors.ts
// Verifica checkId/category/severity per marcatori TODO/FIXME/BUG/HACK nel codice
// e per i crash riportati dal DB; verifica anche il fallback quando il DB non è disponibile.
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SourceFile } from "../scan-utils";

// --- vi.hoisted: variabili disponibili nelle factory dei mock --------------
const { mockListSourceFiles, mockSafeRead, dbChain } = vi.hoisted(() => {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {
    select: vi.fn(),
    from: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
  };
  chain.select.mockReturnValue(chain);
  chain.from.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.orderBy.mockReturnValue(chain);
  chain.limit.mockResolvedValue([]);
  return {
    mockListSourceFiles: vi.fn<[], SourceFile[]>(),
    mockSafeRead: vi.fn<[string], string>(),
    dbChain: chain,
  };
});

vi.mock("../scan-utils", () => ({
  ROOT: "/fake-root",
  listSourceFiles: mockListSourceFiles,
  safeRead: mockSafeRead,
  offsetToLine: () => 1,
  lineSnippet: () => "snippet",
}));

vi.mock("../../../server/db", () => ({ db: dbChain }));

vi.mock("@shared/db", () => ({
  appCrashLogs: {
    reportedAt: "reportedAt",
    crashType: "crashType",
    errorMessage: "errorMessage",
    appVersion: "appVersion",
  },
}));

vi.mock("drizzle-orm", () => ({
  desc: vi.fn((col: unknown) => col),
  gte: vi.fn(() => true),
}));

import { runKnownErrors } from "../checkers/known-errors";

function makeFile(rel: string): SourceFile {
  return { rel, abs: `/fake-root/${rel}`, ext: ".ts" };
}

beforeEach(() => {
  vi.clearAllMocks();
  dbChain.select.mockReturnValue(dbChain);
  dbChain.from.mockReturnValue(dbChain);
  dbChain.where.mockReturnValue(dbChain);
  dbChain.orderBy.mockReturnValue(dbChain);
  dbChain.limit.mockResolvedValue([]);
});

describe("runKnownErrors — nessun problema", () => {
  it("lista file vuota e DB vuoto → risultato vuoto", async () => {
    mockListSourceFiles.mockReturnValue([]);
    mockSafeRead.mockReturnValue("");
    const results = await runKnownErrors();
    expect(results).toHaveLength(0);
  });

  it("file senza marcatori → nessun risultato statico", async () => {
    mockListSourceFiles.mockReturnValue([makeFile("lib/clean.ts")]);
    mockSafeRead.mockReturnValue(`export const clean = true;`);
    const results = await runKnownErrors();
    expect(results.filter((r) => r.checkId !== "KE-crash")).toHaveLength(0);
  });
});

describe("runKnownErrors — marcatori statici", () => {
  const markerCases: Array<{ marker: string; expectedCheckId: string; expectedSeverity: string }> = [
    { marker: "TODO", expectedCheckId: "KE-TODO", expectedSeverity: "info" },
    { marker: "FIXME", expectedCheckId: "KE-FIXME", expectedSeverity: "warning" },
    { marker: "BUG", expectedCheckId: "KE-BUG", expectedSeverity: "warning" },
    { marker: "HACK", expectedCheckId: "KE-HACK", expectedSeverity: "info" },
    { marker: "XXX", expectedCheckId: "KE-XXX", expectedSeverity: "info" },
  ];

  for (const { marker, expectedCheckId, expectedSeverity } of markerCases) {
    it(`${marker}: nel codice → ${expectedCheckId} ${expectedSeverity}`, async () => {
      mockListSourceFiles.mockReturnValue([makeFile("lib/code.ts")]);
      mockSafeRead.mockReturnValue(`// ${marker}: sistemare questo`);

      const results = await runKnownErrors();
      const hit = results.find((r) => r.checkId === expectedCheckId);
      expect(hit).toBeDefined();
      expect(hit!.category).toBe("known-errors");
      expect(hit!.severity).toBe(expectedSeverity);
    });

    it(`${marker}: → file relativo riportato`, async () => {
      mockListSourceFiles.mockReturnValue([makeFile("server/routes/foo.ts")]);
      mockSafeRead.mockReturnValue(`// ${marker}: da rivedere`);

      const results = await runKnownErrors();
      const hit = results.find((r) => r.checkId === expectedCheckId);
      expect(hit!.file).toBe("server/routes/foo.ts");
    });
  }

  it("più marcatori nello stesso file → massimo 3 risultati per file", async () => {
    mockListSourceFiles.mockReturnValue([makeFile("lib/multi.ts")]);
    mockSafeRead.mockReturnValue(`
// TODO: fix a
// TODO: fix b
// TODO: fix c
// TODO: fix d
    `);

    const results = await runKnownErrors();
    const todos = results.filter((r) => r.checkId === "KE-TODO");
    expect(todos.length).toBeLessThanOrEqual(3);
    expect(todos.length).toBeGreaterThanOrEqual(1);
  });
});

describe("runKnownErrors — crash dal DB", () => {
  it("crash con n >= 3 occorrenze → KE-crash critical", async () => {
    const rows = [
      { crashType: "NullPointer", errorMessage: "Cannot read property x", appVersion: "1.0", reportedAt: new Date() },
      { crashType: "NullPointer", errorMessage: "Cannot read property x", appVersion: "1.0", reportedAt: new Date() },
      { crashType: "NullPointer", errorMessage: "Cannot read property x", appVersion: "1.0", reportedAt: new Date() },
    ];
    dbChain.limit.mockResolvedValue(rows);
    mockListSourceFiles.mockReturnValue([]);

    const results = await runKnownErrors();
    const crash = results.find((r) => r.checkId === "KE-crash");
    expect(crash).toBeDefined();
    expect(crash!.category).toBe("known-errors");
    expect(crash!.severity).toBe("critical");
  });

  it("crash con n < 3 occorrenze → KE-crash warning", async () => {
    const rows = [
      { crashType: "TypeError", errorMessage: "Unexpected undefined", appVersion: "1.0", reportedAt: new Date() },
      { crashType: "TypeError", errorMessage: "Unexpected undefined", appVersion: "1.0", reportedAt: new Date() },
    ];
    dbChain.limit.mockResolvedValue(rows);
    mockListSourceFiles.mockReturnValue([]);

    const results = await runKnownErrors();
    const crash = results.find((r) => r.checkId === "KE-crash");
    expect(crash).toBeDefined();
    expect(crash!.severity).toBe("warning");
  });

  it("crash con n === 3 (boundary) → KE-crash critical", async () => {
    const row = { crashType: "RangeError", errorMessage: "Stack overflow", appVersion: "1.0", reportedAt: new Date() };
    dbChain.limit.mockResolvedValue([row, row, row]);
    mockListSourceFiles.mockReturnValue([]);

    const results = await runKnownErrors();
    const crash = results.find((r) => r.checkId === "KE-crash");
    expect(crash!.severity).toBe("critical");
  });

  it("crash diversi → un KE-crash per tipo di messaggio (aggregazione)", async () => {
    const rows = [
      { crashType: "A", errorMessage: "Error type A", appVersion: "1.0", reportedAt: new Date() },
      { crashType: "B", errorMessage: "Error type B", appVersion: "1.0", reportedAt: new Date() },
    ];
    dbChain.limit.mockResolvedValue(rows);
    mockListSourceFiles.mockReturnValue([]);

    const results = await runKnownErrors();
    const crashes = results.filter((r) => r.checkId === "KE-crash");
    expect(crashes).toHaveLength(2);
  });

  it("DB non disponibile (exception) → nessun crash result, nessuna eccezione propagata", async () => {
    dbChain.limit.mockRejectedValue(new Error("Connection refused"));
    mockListSourceFiles.mockReturnValue([]);
    mockSafeRead.mockReturnValue("");

    await expect(runKnownErrors()).resolves.not.toThrow();
    const results = await runKnownErrors();
    expect(results.filter((r) => r.checkId === "KE-crash")).toHaveLength(0);
  });

  it("DB non disponibile → i risultati statici sono comunque restituiti", async () => {
    dbChain.limit.mockRejectedValue(new Error("timeout"));
    mockListSourceFiles.mockReturnValue([makeFile("lib/code.ts")]);
    mockSafeRead.mockReturnValue("// FIXME: da sistemare");

    const results = await runKnownErrors();
    const fixme = results.find((r) => r.checkId === "KE-FIXME");
    expect(fixme).toBeDefined();
  });
});

describe("runKnownErrors — campi obbligatori", () => {
  it("ogni risultato ha checkId, category e severity definiti", async () => {
    mockListSourceFiles.mockReturnValue([makeFile("lib/markers.ts")]);
    mockSafeRead.mockReturnValue("// TODO: a\n// FIXME: b\n// BUG: c");
    dbChain.limit.mockResolvedValue([]);

    const results = await runKnownErrors();
    for (const r of results) {
      expect(r.checkId).toBeTruthy();
      expect(r.category).toBe("known-errors");
      expect(["critical", "warning", "info"]).toContain(r.severity);
    }
  });
});
