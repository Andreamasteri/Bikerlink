// Test unitari per scripts/health-check/checkers/file-placement.ts
// Verifica che il checker emetta i checkId/category/severity corretti per
// route pollution, stub orfani e file troppo grandi.
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SourceFile } from "../scan-utils";

const { mockListSourceFiles, mockSafeRead } = vi.hoisted(() => ({
  mockListSourceFiles: vi.fn<[], SourceFile[]>(),
  mockSafeRead: vi.fn<[string], string>(),
}));

vi.mock("../scan-utils", () => ({
  ROOT: "/fake-root",
  listSourceFiles: mockListSourceFiles,
  safeRead: mockSafeRead,
  offsetToLine: () => 1,
  lineSnippet: () => "snippet",
}));

import { runFilePlacement } from "../checkers/file-placement";

function makeFile(rel: string): SourceFile {
  return { rel, abs: `/fake-root/${rel}`, ext: ".ts" };
}

function makeContent(lines: number): string {
  return Array.from({ length: lines }, (_, i) => `// line ${i + 1}`).join("\n");
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("runFilePlacement — nessun problema", () => {
  it("lista file vuota → risultato vuoto", async () => {
    mockListSourceFiles.mockReturnValue([]);
    mockSafeRead.mockReturnValue("// normale");
    const results = await runFilePlacement();
    expect(results).toHaveLength(0);
  });

  it("file normale fuori da app/(tabs)/ → risultato vuoto", async () => {
    mockListSourceFiles.mockReturnValue([makeFile("components/Button.tsx")]);
    mockSafeRead.mockReturnValue(makeContent(10));
    const results = await runFilePlacement();
    expect(results).toHaveLength(0);
  });

  it("file di route valido in app/(tabs)/ (no suffisso helper) → nessun FP-tabs-pollution", async () => {
    mockListSourceFiles.mockReturnValue([makeFile("app/(tabs)/home.tsx")]);
    mockSafeRead.mockReturnValue(makeContent(10));
    const results = await runFilePlacement();
    expect(results.filter((r) => r.checkId === "FP-tabs-pollution")).toHaveLength(0);
  });

  it("file .part1.ts NON vuoto → nessun FP-orphan-stub", async () => {
    mockListSourceFiles.mockReturnValue([makeFile("lib/foo.part1.ts")]);
    mockSafeRead.mockReturnValue("export const x = 1;");
    const results = await runFilePlacement();
    expect(results.filter((r) => r.checkId === "FP-orphan-stub")).toHaveLength(0);
  });

  it("file di 600 righe esatte (al limite) → nessun FP-large-file", async () => {
    mockListSourceFiles.mockReturnValue([makeFile("lib/big.ts")]);
    mockSafeRead.mockReturnValue(makeContent(600));
    const results = await runFilePlacement();
    expect(results.filter((r) => r.checkId === "FP-large-file")).toHaveLength(0);
  });
});

describe("runFilePlacement — FP-tabs-pollution", () => {
  const helperExtensions = ["styles", "types", "utils", "helpers", "constants"];

  for (const ext of helperExtensions) {
    it(`app/(tabs)/foo.${ext}.ts → FP-tabs-pollution warning`, async () => {
      mockListSourceFiles.mockReturnValue([makeFile(`app/(tabs)/foo.${ext}.ts`)]);
      mockSafeRead.mockReturnValue(makeContent(5));

      const results = await runFilePlacement();
      const hit = results.find((r) => r.checkId === "FP-tabs-pollution");
      expect(hit).toBeDefined();
      expect(hit!.category).toBe("file-placement");
      expect(hit!.severity).toBe("warning");
    });

    it(`app/(tabs)/bar.${ext}.tsx → FP-tabs-pollution warning`, async () => {
      mockListSourceFiles.mockReturnValue([makeFile(`app/(tabs)/bar.${ext}.tsx`)]);
      mockSafeRead.mockReturnValue(makeContent(5));

      const results = await runFilePlacement();
      const hit = results.find((r) => r.checkId === "FP-tabs-pollution");
      expect(hit).toBeDefined();
      expect(hit!.category).toBe("file-placement");
      expect(hit!.severity).toBe("warning");
    });
  }

  it("FP-tabs-pollution → file relativo riportato correttamente", async () => {
    mockListSourceFiles.mockReturnValue([makeFile("app/(tabs)/nav.styles.ts")]);
    mockSafeRead.mockReturnValue(makeContent(5));

    const results = await runFilePlacement();
    const hit = results.find((r) => r.checkId === "FP-tabs-pollution");
    expect(hit!.file).toBe("app/(tabs)/nav.styles.ts");
  });

  it("FP-tabs-pollution → descrizione menziona components/", async () => {
    mockListSourceFiles.mockReturnValue([makeFile("app/(tabs)/nav.utils.ts")]);
    mockSafeRead.mockReturnValue(makeContent(5));

    const results = await runFilePlacement();
    const hit = results.find((r) => r.checkId === "FP-tabs-pollution");
    expect(hit!.description).toContain("components/");
  });
});

describe("runFilePlacement — FP-orphan-stub", () => {
  it("file .part1.ts vuoto → FP-orphan-stub info", async () => {
    mockListSourceFiles.mockReturnValue([makeFile("lib/module.part1.ts")]);
    mockSafeRead.mockReturnValue("   \n  ");

    const results = await runFilePlacement();
    const hit = results.find((r) => r.checkId === "FP-orphan-stub");
    expect(hit).toBeDefined();
    expect(hit!.category).toBe("file-placement");
    expect(hit!.severity).toBe("info");
  });

  it("file .next.tsx vuoto → FP-orphan-stub info", async () => {
    mockListSourceFiles.mockReturnValue([makeFile("app/wizard.next.tsx")]);
    mockSafeRead.mockReturnValue("");

    const results = await runFilePlacement();
    const hit = results.find((r) => r.checkId === "FP-orphan-stub");
    expect(hit).toBeDefined();
    expect(hit!.severity).toBe("info");
  });

  it("file .part3.ts vuoto → FP-orphan-stub con file relativo corretto", async () => {
    mockListSourceFiles.mockReturnValue([makeFile("server/boot.part3.ts")]);
    mockSafeRead.mockReturnValue("");

    const results = await runFilePlacement();
    const hit = results.find((r) => r.checkId === "FP-orphan-stub");
    expect(hit!.file).toBe("server/boot.part3.ts");
  });
});

describe("runFilePlacement — FP-large-file", () => {
  it("file da 601 righe → FP-large-file warning", async () => {
    mockListSourceFiles.mockReturnValue([makeFile("server/routes/big.ts")]);
    mockSafeRead.mockReturnValue(makeContent(601));

    const results = await runFilePlacement();
    const hit = results.find((r) => r.checkId === "FP-large-file");
    expect(hit).toBeDefined();
    expect(hit!.category).toBe("file-placement");
    expect(hit!.severity).toBe("warning");
  });

  it("FP-large-file → line riporta il conteggio righe reale", async () => {
    mockListSourceFiles.mockReturnValue([makeFile("lib/large.ts")]);
    mockSafeRead.mockReturnValue(makeContent(750));

    const results = await runFilePlacement();
    const hit = results.find((r) => r.checkId === "FP-large-file");
    expect(hit!.line).toBe(750);
  });

  it("FP-large-file → file relativo riportato correttamente", async () => {
    mockListSourceFiles.mockReturnValue([makeFile("components/Monster.tsx")]);
    mockSafeRead.mockReturnValue(makeContent(620));

    const results = await runFilePlacement();
    const hit = results.find((r) => r.checkId === "FP-large-file");
    expect(hit!.file).toBe("components/Monster.tsx");
  });
});

describe("runFilePlacement — combinazioni di problemi sullo stesso file", () => {
  it("file helper in app/(tabs)/ E troppo grande → entrambi i check emessi", async () => {
    mockListSourceFiles.mockReturnValue([makeFile("app/(tabs)/foo.styles.ts")]);
    mockSafeRead.mockReturnValue(makeContent(700));

    const results = await runFilePlacement();
    const ids = results.map((r) => r.checkId);
    expect(ids).toContain("FP-tabs-pollution");
    expect(ids).toContain("FP-large-file");
  });
});
