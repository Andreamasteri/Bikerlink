// Task #86 — Regressione: l'inventario di Horus DEVE coprire l'intera app.
//
// Il code review ha bocciato una versione che scandiva solo server/client/shared,
// mentre in questo repo (app Expo) il frontend vive sotto app/, components/,
// hooks/, lib/, constants/ e `client/` NON esiste. Questo test blocca il
// ri-restringersi dello scope: verifica che ogni radice configurata esista
// davvero su disco e che l'enumerazione includa file rappresentativi sia del
// backend sia del frontend, escludendo dipendenze/tipi generati/riferimenti.
import { describe, it, expect } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import { enumerateSourceFiles, SOURCE_ROOTS } from "../ai/assistant/codebase-inventory";

const ROOT = process.cwd();

describe("Horus codebase inventory coverage", () => {
  it("configures the real repository source roots (backend + shared + full Expo frontend)", () => {
    // Deve includere il backend, il codice condiviso e le radici reali del frontend.
    expect(SOURCE_ROOTS).toContain("server");
    expect(SOURCE_ROOTS).toContain("shared");
    expect(SOURCE_ROOTS).toContain("app");
    expect(SOURCE_ROOTS).toContain("components");
    // Non deve più fare affidamento su `client/`, che in questo repo non esiste.
    expect(SOURCE_ROOTS).not.toContain("client");
  });

  it("every configured root exists on disk (fails loudly if a root is missing/renamed)", async () => {
    for (const root of SOURCE_ROOTS) {
      const stat = await fs.stat(path.join(ROOT, root)).catch(() => null);
      expect(stat, `radice sorgente configurata mancante: ${root}/`).not.toBeNull();
      expect(stat!.isDirectory(), `${root}/ non è una directory`).toBe(true);
    }
  });

  it("enumerates representative files from both backend and frontend roots", async () => {
    const files = await enumerateSourceFiles();
    expect(files.length).toBeGreaterThan(100);

    const norm = files.map((f) => f.replace(/\\/g, "/"));
    // Almeno un file per ciascuna radice configurata → nessun'area saltata.
    for (const root of SOURCE_ROOTS) {
      const has = norm.some((f) => f.startsWith(`${root}/`));
      expect(has, `nessun file enumerato sotto ${root}/`).toBe(true);
    }
  });

  it("excludes dependencies, generated types, and external reference clones", async () => {
    const files = (await enumerateSourceFiles()).map((f) => f.replace(/\\/g, "/"));
    expect(files.some((f) => f.includes("node_modules/"))).toBe(false);
    expect(files.some((f) => f.startsWith(".bikerblog-ref/"))).toBe(false);
    expect(files.some((f) => f.endsWith(".d.ts"))).toBe(false);
    // Cartelle di build/asset non fanno parte dell'app principale.
    expect(files.some((f) => f.startsWith("dist/") || f.startsWith("server_dist/"))).toBe(false);
  });
});
