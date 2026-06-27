// Test unitari per scripts/health-check/checkers/typecheck.ts
// Verifica che il checker parsi correttamente l'output di tsc e produca
// checkId/category/severity corretti senza eseguire tsc realmente.
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockExecFileSync } = vi.hoisted(() => ({
  mockExecFileSync: vi.fn<[string, string[], object], string>(),
}));

vi.mock("child_process", () => ({
  execFileSync: mockExecFileSync,
}));

vi.mock("../scan-utils", () => ({
  ROOT: "/fake-root",
  listSourceFiles: vi.fn().mockReturnValue([]),
  safeRead: vi.fn().mockReturnValue(""),
  offsetToLine: () => 1,
  lineSnippet: () => "snippet",
}));

import { runTypecheck } from "../checkers/typecheck";

function makeTscError(
  file: string,
  line: number,
  col: number,
  code: string,
  message: string
): string {
  return `${file}(${line},${col}): error ${code}: ${message}`;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("runTypecheck — nessun errore", () => {
  it("tsc senza output → risultato vuoto", async () => {
    mockExecFileSync.mockReturnValue("");
    const results = await runTypecheck();
    expect(results).toHaveLength(0);
  });

  it("tsc con solo righe non parsabili → risultato vuoto", async () => {
    mockExecFileSync.mockImplementation(() => {
      throw { stdout: "Found 0 errors.\n\nDone.", stderr: "" };
    });
    const results = await runTypecheck();
    expect(results).toHaveLength(0);
  });
});

describe("runTypecheck — parsing di un errore tsc", () => {
  beforeEach(() => {
    const output = makeTscError(
      "app/screen.tsx",
      12,
      5,
      "TS2345",
      "Argument of type 'string' is not assignable to parameter of type 'number'"
    );
    mockExecFileSync.mockImplementation(() => {
      throw { stdout: output, stderr: "" };
    });
  });

  it("checkId corrisponde al codice TS (es. TS2345)", async () => {
    const results = await runTypecheck();
    expect(results[0].checkId).toBe("TS2345");
  });

  it("category è 'typecheck'", async () => {
    const results = await runTypecheck();
    expect(results[0].category).toBe("typecheck");
  });

  it("severity è 'critical'", async () => {
    const results = await runTypecheck();
    expect(results[0].severity).toBe("critical");
  });

  it("file riportato correttamente", async () => {
    const results = await runTypecheck();
    expect(results[0].file).toBe("app/screen.tsx");
  });

  it("line riportata come numero", async () => {
    const results = await runTypecheck();
    expect(results[0].line).toBe(12);
  });

  it("column riportata come numero", async () => {
    const results = await runTypecheck();
    expect(results[0].column).toBe(5);
  });

  it("description contiene il messaggio di errore tsc", async () => {
    const results = await runTypecheck();
    expect(results[0].description).toContain("Argument of type");
  });
});

describe("runTypecheck — più errori nello stesso progetto", () => {
  it("due errori dal primo progetto → due risultati distinti (secondo progetto ok)", async () => {
    const output = [
      makeTscError("app/a.tsx", 1, 1, "TS2322", "Type mismatch"),
      makeTscError("server/routes.ts", 99, 3, "TS2551", "Property does not exist"),
    ].join("\n");
    let callCount = 0;
    mockExecFileSync.mockImplementation(() => {
      callCount++;
      if (callCount === 1) throw { stdout: output, stderr: "" };
      return ""; // secondo progetto: nessun errore
    });

    const results = await runTypecheck();
    expect(results).toHaveLength(2);
    expect(results[0].checkId).toBe("TS2322");
    expect(results[1].checkId).toBe("TS2551");
  });
});

describe("runTypecheck — due progetti (client + server)", () => {
  it("errori da entrambi i progetti sono aggregati", async () => {
    let callCount = 0;
    mockExecFileSync.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        throw { stdout: makeTscError("app/client.tsx", 5, 1, "TS2304", "Cannot find name"), stderr: "" };
      }
      throw { stdout: makeTscError("server/api.ts", 10, 2, "TS7006", "Parameter implicitly has 'any' type"), stderr: "" };
    });

    const results = await runTypecheck();
    expect(results).toHaveLength(2);
    const ids = results.map((r) => r.checkId);
    expect(ids).toContain("TS2304");
    expect(ids).toContain("TS7006");
  });

  it("primo progetto senza errori + secondo con errori → solo quelli del secondo", async () => {
    let callCount = 0;
    mockExecFileSync.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return "";
      throw { stdout: makeTscError("server/db.ts", 42, 1, "TS2345", "Type error"), stderr: "" };
    });

    const results = await runTypecheck();
    expect(results).toHaveLength(1);
    expect(results[0].checkId).toBe("TS2345");
    expect(results[0].file).toBe("server/db.ts");
  });

  it("stderr viene incluso nel parsing (primo progetto)", async () => {
    const errLine = makeTscError("lib/foo.ts", 3, 2, "TS1005", "';' expected");
    let callCount = 0;
    mockExecFileSync.mockImplementation(() => {
      callCount++;
      if (callCount === 1) throw { stdout: "", stderr: errLine };
      return ""; // secondo progetto: ok
    });

    const results = await runTypecheck();
    expect(results).toHaveLength(1);
    expect(results[0].checkId).toBe("TS1005");
  });
});

describe("runTypecheck — campi obbligatori", () => {
  it("ogni risultato ha checkId, category e severity definiti", async () => {
    const output = [
      makeTscError("app/x.tsx", 1, 1, "TS2322", "error one"),
      makeTscError("app/y.tsx", 2, 2, "TS2551", "error two"),
    ].join("\n");
    mockExecFileSync.mockImplementation(() => {
      throw { stdout: output, stderr: "" };
    });

    const results = await runTypecheck();
    for (const r of results) {
      expect(r.checkId).toBeTruthy();
      expect(r.category).toBe("typecheck");
      expect(r.severity).toBe("critical");
    }
  });
});
