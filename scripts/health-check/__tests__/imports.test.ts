// Test unitari per scripts/health-check/checkers/imports.ts
// Verifica che il checker emetta checkId/category/severity corretti a fronte di
// import relativi rotti o validi, senza toccare il filesystem reale.
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SourceFile } from "../scan-utils";

// --- vi.hoisted: variabili disponibili nelle factory dei mock --------------
const { mockExistsSync, mockListSourceFiles, mockSafeRead } = vi.hoisted(() => ({
  mockExistsSync: vi.fn<(s: string) => boolean>(),
  mockListSourceFiles: vi.fn<() => SourceFile[]>(),
  mockSafeRead: vi.fn<(s: string) => string>(),
}));

vi.mock("fs", () => ({
  existsSync: mockExistsSync,
}));

vi.mock("../scan-utils", () => ({
  ROOT: "/fake-root",
  listSourceFiles: mockListSourceFiles,
  safeRead: mockSafeRead,
  offsetToLine: (_text: string, _offset: number) => 1,
  lineSnippet: (_text: string, _line: number) => "snippet",
}));

import { runImports } from "../checkers/imports";

function makeFile(rel: string): SourceFile {
  return { rel, abs: `/fake-root/${rel}`, ext: ".ts" };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("runImports — nessun problema", () => {
  it("lista file vuota → risultato vuoto", async () => {
    mockListSourceFiles.mockReturnValue([]);
    const results = await runImports();
    expect(results).toHaveLength(0);
  });

  it("file senza import relativi → risultato vuoto", async () => {
    mockListSourceFiles.mockReturnValue([makeFile("lib/utils.ts")]);
    mockSafeRead.mockReturnValue(`import { foo } from "some-package";`);
    const results = await runImports();
    expect(results).toHaveLength(0);
  });

  it("import relativo che si risolve → risultato vuoto", async () => {
    mockListSourceFiles.mockReturnValue([makeFile("app/index.tsx")]);
    mockSafeRead.mockReturnValue(`import { Foo } from "./Foo";`);
    mockExistsSync.mockReturnValue(true);
    const results = await runImports();
    expect(results).toHaveLength(0);
  });

  it("import non-relativo (alias @/) → ignorato", async () => {
    mockListSourceFiles.mockReturnValue([makeFile("app/index.tsx")]);
    mockSafeRead.mockReturnValue(`import { Foo } from "@/components/Foo";`);
    const results = await runImports();
    expect(results).toHaveLength(0);
  });

  it("safeRead restituisce stringa vuota → risultato vuoto", async () => {
    mockListSourceFiles.mockReturnValue([makeFile("lib/empty.ts")]);
    mockSafeRead.mockReturnValue("");
    const results = await runImports();
    expect(results).toHaveLength(0);
  });
});

describe("runImports — IM-broken", () => {
  it("import relativo non risolvibile → emette checkId IM-broken", async () => {
    mockListSourceFiles.mockReturnValue([makeFile("app/screen.tsx")]);
    mockSafeRead.mockReturnValue(`import { Foo } from "./missing-module";`);
    mockExistsSync.mockReturnValue(false);

    const results = await runImports();
    expect(results).toHaveLength(1);
    expect(results[0].checkId).toBe("IM-broken");
  });

  it("import rotto → category 'imports'", async () => {
    mockListSourceFiles.mockReturnValue([makeFile("app/screen.tsx")]);
    mockSafeRead.mockReturnValue(`import { Foo } from "./nope";`);
    mockExistsSync.mockReturnValue(false);

    const results = await runImports();
    expect(results[0].category).toBe("imports");
  });

  it("import rotto → severity 'critical'", async () => {
    mockListSourceFiles.mockReturnValue([makeFile("app/screen.tsx")]);
    mockSafeRead.mockReturnValue(`import { Foo } from "./nope";`);
    mockExistsSync.mockReturnValue(false);

    const results = await runImports();
    expect(results[0].severity).toBe("critical");
  });

  it("import rotto → file relativo riportato nel risultato", async () => {
    mockListSourceFiles.mockReturnValue([makeFile("app/screen.tsx")]);
    mockSafeRead.mockReturnValue(`import { Foo } from "./nope";`);
    mockExistsSync.mockReturnValue(false);

    const results = await runImports();
    expect(results[0].file).toBe("app/screen.tsx");
  });

  it("descrizione menziona il path non risolvibile", async () => {
    mockListSourceFiles.mockReturnValue([makeFile("app/screen.tsx")]);
    mockSafeRead.mockReturnValue(`import { Foo } from "./nope";`);
    mockExistsSync.mockReturnValue(false);

    const results = await runImports();
    expect(results[0].description).toContain("./nope");
  });

  it("più import rotti → un risultato per ciascuno", async () => {
    mockListSourceFiles.mockReturnValue([makeFile("lib/foo.ts")]);
    mockSafeRead.mockReturnValue(`
import { A } from "./missing-a";
import { B } from "./missing-b";
    `);
    mockExistsSync.mockReturnValue(false);

    const results = await runImports();
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.checkId === "IM-broken")).toBe(true);
  });

  it("un import valido e uno rotto → solo quello rotto segnalato", async () => {
    mockListSourceFiles.mockReturnValue([makeFile("lib/foo.ts")]);
    mockSafeRead.mockReturnValue(`
import { A } from "./exists";
import { B } from "./missing";
    `);
    mockExistsSync.mockImplementation((p: string) => p.includes("exists"));

    const results = await runImports();
    expect(results).toHaveLength(1);
    expect(results[0].description).toContain("./missing");
  });

  it("più file sorgente → errori da file distinti aggregati", async () => {
    mockListSourceFiles.mockReturnValue([
      makeFile("app/a.tsx"),
      makeFile("app/b.tsx"),
    ]);
    mockSafeRead.mockReturnValue(`import { X } from "./ghost";`);
    mockExistsSync.mockReturnValue(false);

    const results = await runImports();
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.file)).toEqual(
      expect.arrayContaining(["app/a.tsx", "app/b.tsx"])
    );
  });
});
