// Test unitari per scripts/health-check/checkers/dead-code.ts
// Verifica che il checker emetta DC-unused per moduli non importati e che
// salti correttamente gli entrypoint (app/, test, index, scripts, ...).
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SourceFile } from "../scan-utils";

const { mockListSourceFiles, mockSafeRead } = vi.hoisted(() => ({
  mockListSourceFiles: vi.fn<() => SourceFile[]>(),
  mockSafeRead: vi.fn<(s: string) => string>(),
}));

vi.mock("../scan-utils", () => ({
  ROOT: "/fake-root",
  listSourceFiles: mockListSourceFiles,
  safeRead: mockSafeRead,
  offsetToLine: () => 1,
  lineSnippet: () => "snippet",
}));

import { runDeadCode } from "../checkers/dead-code";

function makeFile(rel: string): SourceFile {
  return { rel, abs: `/fake-root/${rel}`, ext: ".ts" };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("runDeadCode — nessun problema", () => {
  it("lista file vuota → risultato vuoto", async () => {
    mockListSourceFiles.mockReturnValue([]);
    mockSafeRead.mockReturnValue("");
    const results = await runDeadCode();
    expect(results).toHaveLength(0);
  });

  it("modulo che viene importato → non segnalato", async () => {
    const libFile = makeFile("lib/helpers.ts");
    const consumerFile = makeFile("components/Button.tsx");

    mockListSourceFiles.mockReturnValue([libFile, consumerFile]);
    mockSafeRead.mockImplementation((abs: string) => {
      if (abs === libFile.abs) return "export function helper() {}";
      if (abs === consumerFile.abs) return `import { helper } from "../lib/helpers";`;
      return "";
    });

    const results = await runDeadCode();
    expect(results.filter((r) => r.file === "lib/helpers.ts")).toHaveLength(0);
  });
});

describe("runDeadCode — entrypoint saltati", () => {
  const entrypoints: Array<[string, string]> = [
    ["route Expo Router", "app/index.tsx"],
    ["route tab Expo", "app/(tabs)/home.tsx"],
    ["test file .test.ts", "lib/__tests__/foo.test.ts"],
    ["test file .spec.ts", "server/helpers.spec.ts"],
    ["file in __tests__", "shared/__tests__/utils.ts"],
    ["config file", "vitest.config.ts"],
    ["server/index.ts", "server/index.ts"],
    ["server/migrate.ts", "server/migrate.ts"],
    ["server/boot-sequence.ts", "server/boot-sequence.ts"],
    ["file in scripts/", "scripts/health-check/run.ts"],
    ["index.ts (basename)", "lib/components/index.ts"],
    ["index.tsx (basename)", "components/index.tsx"],
  ];

  for (const [label, rel] of entrypoints) {
    it(`${label} → saltato (non emette DC-unused)`, async () => {
      mockListSourceFiles.mockReturnValue([makeFile(rel)]);
      mockSafeRead.mockReturnValue("export const x = 1;");

      const results = await runDeadCode();
      expect(results).toHaveLength(0);
    });
  }
});

describe("runDeadCode — DC-unused", () => {
  it("modulo non importato (non entrypoint) → DC-unused", async () => {
    const orphan = makeFile("lib/orphan-module.ts");
    mockListSourceFiles.mockReturnValue([orphan]);
    mockSafeRead.mockReturnValue("export const orphan = true;");

    const results = await runDeadCode();
    expect(results).toHaveLength(1);
    expect(results[0].checkId).toBe("DC-unused");
  });

  it("DC-unused → category 'dead-code'", async () => {
    mockListSourceFiles.mockReturnValue([makeFile("lib/ghost.ts")]);
    mockSafeRead.mockReturnValue("export const ghost = true;");

    const results = await runDeadCode();
    expect(results[0].category).toBe("dead-code");
  });

  it("DC-unused → severity 'info'", async () => {
    mockListSourceFiles.mockReturnValue([makeFile("hooks/useUnused.ts")]);
    mockSafeRead.mockReturnValue("export function useUnused() {}");

    const results = await runDeadCode();
    expect(results[0].severity).toBe("info");
  });

  it("DC-unused → file relativo riportato correttamente", async () => {
    mockListSourceFiles.mockReturnValue([makeFile("lib/dead.ts")]);
    mockSafeRead.mockReturnValue("export const dead = 1;");

    const results = await runDeadCode();
    expect(results[0].file).toBe("lib/dead.ts");
  });

  it("DC-unused → descrizione menziona il nome del modulo", async () => {
    mockListSourceFiles.mockReturnValue([makeFile("lib/dead.ts")]);
    mockSafeRead.mockReturnValue("export const dead = 1;");

    const results = await runDeadCode();
    expect(results[0].description).toContain("dead");
  });

  it("più moduli non importati → uno DC-unused per file", async () => {
    const files = [makeFile("lib/alpha.ts"), makeFile("lib/beta.ts")];
    mockListSourceFiles.mockReturnValue(files);
    mockSafeRead.mockReturnValue("export const x = 1;");

    const results = await runDeadCode();
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.checkId === "DC-unused")).toBe(true);
  });

  it("se un altro file importa il modulo tramite nome → non segnalato", async () => {
    const lib = makeFile("lib/tracker.ts");
    const consumer = makeFile("hooks/useTracker.ts");

    mockListSourceFiles.mockReturnValue([lib, consumer]);
    mockSafeRead.mockImplementation((abs: string) => {
      if (abs === lib.abs) return "export const track = () => {};";
      if (abs === consumer.abs) return `import { track } from "../lib/tracker";`;
      return "";
    });

    const results = await runDeadCode();
    expect(results.find((r) => r.file === "lib/tracker.ts")).toBeUndefined();
  });
});
