/**
 * Task #184 — Regressione: il backfill lexiconNote di computePending DEVE
 * inserire nel batch i file `.tsx` eleggibili il cui hash non è cambiato ma la
 * cui nota lessicale è assente (es. dopo un upgrade da una versione pre-Task #152).
 *
 * Tre casi chiave:
 *   1. app/*.tsx, hash invariato, lexiconNote assente  → DEVE stare in `pending`
 *   2. app/*.tsx, hash invariato, lexiconNote presente → NON deve stare in `pending`
 *   3. server/*.ts, hash invariato, lexiconNote assente → NON deve stare in `pending`
 *      (ineleggibile: non è .tsx in app/ o components/)
 */
import { vi, describe, it, expect, beforeEach } from "vitest";

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgres://test:test@localhost:5432/test"; // pragma: allowlist secret
}

// ── Costanti condivise tra test e mock ────────────────────────────────────────
const SCREEN_FILE = "app/SomeScreen.tsx";
const BACKEND_FILE = "server/routes/some-route.ts";
const HASH_A = "abc123deadbeef0000000000000000ab"; // 32-char hex simulato

// ── Mock node:fs — controlla readdir + readFile senza toccare il filesystem ──
// Usiamo vi.hoisted per definire le factory prima dell'hoisting di vi.mock.
const { readdirImpl, readFileImpl } = vi.hoisted(() => {
  /**
   * readdir stub: per semplicità restituisce ZERO entry per tutte le radici
   * ad eccezione di "app" (o "server"), che restituisce un file controllato.
   * `computePending` delega la traversal a `enumerateSourceFiles`, che usa
   * readdir ricorsivamente; questo stub funziona perché i file simulati
   * provengono direttamente dal mock.
   */
  const readdirImpl = vi.fn();
  const readFileImpl = vi.fn();
  return { readdirImpl, readFileImpl };
});

vi.mock("node:fs", () => ({
  promises: {
    readdir: readdirImpl,
    readFile: readFileImpl,
    stat: vi.fn(),
  },
}));

// ── Mock ../storage — controlla loadFileScanStore senza DB ──────────────────
const { mockGetAppSetting } = vi.hoisted(() => ({
  mockGetAppSetting: vi.fn(),
}));

vi.mock("../storage", () => ({
  storage: {
    getAppSetting: mockGetAppSetting,
    upsertAppSetting: vi.fn(),
  },
}));

// ── Importa DOPO i mock ──────────────────────────────────────────────────────
import path from "node:path";
import { computePending, isLexiconEligible } from "../ai/assistant/codebase-inventory";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Simula un'entry Dirent con i metodi necessari a walk(). */
function makeDirent(name: string, isDir = false) {
  return {
    name,
    isDirectory: () => isDir,
    isFile: () => !isDir,
  };
}

/**
 * Configura readdir in modo che restituisca ONE file nell'unica cartella
 * desiderata (es. "app/" → SCREEN_FILE) e cartelle vuote per tutte le altre
 * radici SOURCE_ROOTS. Gestisce la chiamata ricorsiva (walk va in profondità
 * di 1 livello per i file diretti, mai per le cartelle vuote).
 */
function setupFs(activeDir: string, fileName: string, content = "// code") {
  const ROOT = process.cwd();
  const absActive = path.join(ROOT, activeDir);

  readdirImpl.mockImplementation(async (absDir: string) => {
    if (absDir === absActive) {
      return [makeDirent(fileName)];
    }
    // Tutte le altre radici/sottocartelle: vuote.
    return [];
  });

  readFileImpl.mockImplementation(async (absPath: string) => {
    if (absPath === path.join(ROOT, activeDir, fileName)) {
      return content;
    }
    throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
  });
}

/**
 * Configura getAppSetting in modo che restituisca lo store serializzato dato.
 */
function setupStore(store: Record<string, unknown>) {
  mockGetAppSetting.mockResolvedValue({ valueJson: store });
}

// ── Test ─────────────────────────────────────────────────────────────────────

describe("isLexiconEligible", () => {
  it("returns true per .tsx in app/", () => {
    expect(isLexiconEligible("app/SomeScreen.tsx")).toBe(true);
    expect(isLexiconEligible("app/sub/deep/Screen.tsx")).toBe(true);
  });

  it("returns true per .tsx in components/", () => {
    expect(isLexiconEligible("components/Button.tsx")).toBe(true);
  });

  it("returns false per .ts (non .tsx)", () => {
    expect(isLexiconEligible("app/routes.ts")).toBe(false);
  });

  it("returns false per .tsx fuori da app/ e components/", () => {
    expect(isLexiconEligible("server/foo.tsx")).toBe(false);
    expect(isLexiconEligible("hooks/useBar.tsx")).toBe(false);
    expect(isLexiconEligible("lib/utils.tsx")).toBe(false);
  });
});

describe("computePending — backfill lexiconNote (modalità manual)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("inserisce in pending un .tsx in app/ il cui hash non è cambiato ma lexiconNote è assente", async () => {
    // File su disco: app/SomeScreen.tsx
    setupFs("app", "SomeScreen.tsx", "// contenuto schermata");

    // Store: hash coincide, ma lexiconNote assente (scansione pre-Task #152)
    setupStore({
      [SCREEN_FILE]: { hash: HASH_A, note: "nota funzionale", at: "2025-01-01T00:00:00Z" },
    });

    // L'hash calcolato deve coincidere con quello nello store per testare
    // il ramo "hash invariato ma lexiconNote mancante".
    // Usiamo createHash direttamente per ricavare l'hash atteso dal contenuto mock.
    const { createHash } = await import("node:crypto");
    const content = "// contenuto schermata";
    const expectedHash = createHash("sha256").update(content).digest("hex").slice(0, 32);

    // Aggiorniamo lo store con l'hash corretto calcolato dal contenuto mock.
    setupStore({
      [SCREEN_FILE]: { hash: expectedHash, note: "nota funzionale", at: "2025-01-01T00:00:00Z" },
    });

    const result = await computePending("manual");

    expect(result.pending).toContain(SCREEN_FILE);
    expect(result.unchanged).toBe(0); // non va in unchanged: ha bisogno del backfill
  });

  it("NON inserisce in pending un .tsx in app/ il cui hash non è cambiato e lexiconNote è già presente", async () => {
    setupFs("app", "SomeScreen.tsx", "// contenuto schermata");

    const { createHash } = await import("node:crypto");
    const content = "// contenuto schermata";
    const expectedHash = createHash("sha256").update(content).digest("hex").slice(0, 32);

    // Store: hash coincide E lexiconNote già presente → file deve essere saltato.
    setupStore({
      [SCREEN_FILE]: {
        hash: expectedHash,
        note: "nota funzionale",
        lexiconNote: "Titolo: SomeScreen\nBottoni: Salva",
        at: "2025-01-01T00:00:00Z",
      },
    });

    const result = await computePending("manual");

    expect(result.pending).not.toContain(SCREEN_FILE);
    expect(result.unchanged).toBe(1);
  });

  it("NON inserisce in pending un .ts (non .tsx) anche se hash invariato e lexiconNote assente", async () => {
    // File su disco: server/routes/some-route.ts (ineleggibile per la nota lessicale)
    setupFs("server", "routes/some-route.ts", "// backend route");

    const { createHash } = await import("node:crypto");
    const content = "// backend route";
    const expectedHash = createHash("sha256").update(content).digest("hex").slice(0, 32);

    // Store: hash coincide, nessuna lexiconNote — ma il file non è .tsx in app/components/
    setupStore({
      [BACKEND_FILE]: { hash: expectedHash, note: "nota analisi", at: "2025-01-01T00:00:00Z" },
    });

    const result = await computePending("manual");

    expect(result.pending).not.toContain(BACKEND_FILE);
    expect(result.unchanged).toBeGreaterThanOrEqual(1);
  });
});

describe("computePending — backfill NON si attiva in modalità analysis", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("in modalità analysis un .tsx in app/ con hash invariato e lexiconNote assente va in unchanged, non in pending", async () => {
    setupFs("app", "SomeScreen.tsx", "// contenuto schermata");

    const { createHash } = await import("node:crypto");
    const content = "// contenuto schermata";
    const expectedHash = createHash("sha256").update(content).digest("hex").slice(0, 32);

    setupStore({
      [SCREEN_FILE]: { hash: expectedHash, note: "analisi", at: "2025-01-01T00:00:00Z" },
    });

    // In modalità ANALYSIS il backfill lexiconNote NON si applica.
    const result = await computePending("analysis");

    expect(result.pending).not.toContain(SCREEN_FILE);
    expect(result.unchanged).toBe(1);
  });
});
