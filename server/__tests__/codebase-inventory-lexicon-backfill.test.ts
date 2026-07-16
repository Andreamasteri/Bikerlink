// Task #184 — Regressione: il backfill lexiconNote introdotto da Task #176 in
// `computePending` NON deve scomparire.
//
// Scenario critico: dopo un upgrade, un file app/*.tsx il cui hash non è cambiato
// ma che manca di `lexiconNote` (scansioni pre-Task #152 o completamenti parziali)
// DEVE rientrare nei `pending` in modalità manual, così processFile può produrre
// la nota lessicale. Senza questo backfill, il dizionario dell'interfaccia non
// copre mai le schermate che non sono cambiate dall'ultimo ciclo.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "node:crypto";

// ── Hoisted mock factories (eseguiti prima di qualsiasi import) ────────────
const { readdirMock, readFileMock } = vi.hoisted(() => ({
  readdirMock: vi.fn(),
  readFileMock: vi.fn(),
}));

// Mock node:fs/promises — intercetta enumerateSourceFiles e readAndHashFile.
vi.mock("node:fs", () => ({
  promises: {
    readdir: readdirMock,
    readFile: readFileMock,
  },
}));

// Mock storage — intercetta loadFileScanStore (legge da storage.getAppSetting).
vi.mock("../storage", () => ({
  storage: {
    getAppSetting: vi.fn(),
    upsertAppSetting: vi.fn(),
  },
}));

import { computePending } from "../ai/assistant/codebase-inventory";
import { storage } from "../storage";

// ── Costanti di test ───────────────────────────────────────────────────────
/** Contenuto fittizio: stabile tra le chiamate readFile del ciclo. */
const FAKE_CONTENT = "export default function TestScreen() { return null; }";

/** Hash atteso — identico a quello calcolato da readAndHashFile con FAKE_CONTENT. */
const FAKE_HASH = createHash("sha256").update(FAKE_CONTENT).digest("hex").slice(0, 32);

// ── Helpers ────────────────────────────────────────────────────────────────

/** Simula una Dirent che rappresenta un file (non una directory). */
function makeFile(name: string) {
  return { name, isDirectory: () => false, isFile: () => true };
}

/**
 * Configura readdir per restituire `fileName` nella sola cartella `subDir`
 * e array vuoti per tutte le altre cartelle (evita di camminare l'intero repo).
 */
function setupReaddirSingleFile(subDir: string, fileName: string) {
  readdirMock.mockImplementation(async (absDir: string) => {
    const normalized = absDir.replace(/\\/g, "/");
    if (normalized.endsWith(`/${subDir}`)) return [makeFile(fileName)];
    return [];
  });
}

/**
 * Configura `storage.getAppSetting` per restituire lo store con una sola
 * entry per `rel`. `record` è il FileScanRecord (parziale o completo).
 */
function setupStore(rel: string, record: Record<string, unknown>) {
  (storage.getAppSetting as ReturnType<typeof vi.fn>).mockResolvedValue({
    valueJson: { [rel]: record },
  });
}

// ── Suite ──────────────────────────────────────────────────────────────────

describe("computePending — backfill lexiconNote (Task #184)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // readFile ritorna sempre FAKE_CONTENT → hash stabile e prevedibile.
    readFileMock.mockResolvedValue(FAKE_CONTENT);
  });

  // ── Caso 1: BACKFILL atteso ───────────────────────────────────────────────
  it(
    "re-accoda app/*.tsx con hash invariato ma lexiconNote mancante " +
      "(backfill: deve comparire in pending)",
    async () => {
      const rel = "app/TestScreen.tsx";
      setupReaddirSingleFile("app", "TestScreen.tsx");
      // Store con hash aggiornato ma senza lexiconNote → il file è "fermo"
      // da prima che Task #152 introducesse il campo.
      setupStore(rel, {
        hash: FAKE_HASH,
        note: "nota funzionale esistente",
        at: "2026-01-01T00:00:00Z",
        // lexiconNote: assente
      });

      const result = await computePending("manual");

      expect(result.pending).toContain(rel);
      expect(result.unchanged).toBe(0);
    },
  );

  // ── Caso 2: lexiconNote già presente → nessun backfill ───────────────────
  it(
    "NON re-accoda app/*.tsx se lexiconNote è già presente " +
      "(nessun backfill necessario → unchanged++)",
    async () => {
      const rel = "app/TestScreen.tsx";
      setupReaddirSingleFile("app", "TestScreen.tsx");
      setupStore(rel, {
        hash: FAKE_HASH,
        note: "nota funzionale esistente",
        lexiconNote: "Titolo: TestScreen\nBottone: Salva",
        at: "2026-01-01T00:00:00Z",
      });

      const result = await computePending("manual");

      expect(result.pending).not.toContain(rel);
      expect(result.unchanged).toBe(1);
    },
  );

  // ── Caso 3: file .ts sotto server/ → non eleggibile ──────────────────────
  it(
    "NON re-accoda server/*.ts anche senza lexiconNote " +
      "(non eleggibile: solo .tsx in app/ e components/)",
    async () => {
      const rel = "server/test.ts";
      setupReaddirSingleFile("server", "test.ts");
      setupStore(rel, {
        hash: FAKE_HASH,
        note: "nota backend",
        at: "2026-01-01T00:00:00Z",
        // lexiconNote assente — non dovrebbe importare
      });

      const result = await computePending("manual");

      expect(result.pending).not.toContain(rel);
      expect(result.unchanged).toBe(1);
    },
  );

  // ── Caso 4: modalità analysis → nessun backfill ──────────────────────────
  it(
    "NON re-accoda in modalità 'analysis' anche se lexiconNote manca " +
      "(il backfill è solo per la modalità manual)",
    async () => {
      const rel = "app/TestScreen.tsx";
      setupReaddirSingleFile("app", "TestScreen.tsx");
      setupStore(rel, {
        hash: FAKE_HASH,
        note: "nota analisi",
        at: "2026-01-01T00:00:00Z",
        // lexiconNote assente
      });

      const result = await computePending("analysis");

      expect(result.pending).not.toContain(rel);
      expect(result.unchanged).toBe(1);
    },
  );

  // ── Caso 5: file in components/ → anch'esso eleggibile ───────────────────
  it(
    "re-accoda anche components/*.tsx con hash invariato e lexiconNote mancante " +
      "(components/ è nella allowlist di isLexiconEligible)",
    async () => {
      const rel = "components/BikeCard.tsx";
      setupReaddirSingleFile("components", "BikeCard.tsx");
      setupStore(rel, {
        hash: FAKE_HASH,
        note: "nota componente",
        at: "2026-01-01T00:00:00Z",
      });

      const result = await computePending("manual");

      expect(result.pending).toContain(rel);
      expect(result.unchanged).toBe(0);
    },
  );
});
