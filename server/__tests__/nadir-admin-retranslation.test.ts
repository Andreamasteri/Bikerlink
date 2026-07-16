/**
 * Task #125 — Verifica che un hand-edit admin del manuale non lasci le lingue
 * non-italiane bloccate sull'italiano per sempre.
 *
 * Esercita tre scenari distinti:
 *
 *   1. STALE FALLBACK: dopo che un admin salva un nuovo manuale, le traduzioni
 *      esistenti (legate al vecchio sourceHash) vengono immediatamente considerate
 *      stantie da getNadirManualForLanguage → fallback all'italiano, MAI testo
 *      disallineato dalla sorgente.
 *
 *   2. HAPPY PATH: retranslateManualNow("admin-edit") gira con Ollama disponibile
 *      → le traduzioni vengono salvate con il sourceHash CORRENTE dell'italiano
 *      appena salvato, e getNadirManualForLanguage restituisce il testo tradotto.
 *
 *   3. IN-FLIGHT GUARD: una seconda chiamata a retranslateManualNow mentre una
 *      prima è ancora in corso restituisce { skipped: true } senza avviare una
 *      nuova corsa (retranslationInFlight rimane true durante la prima).
 */
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgres://test:test@localhost:5432/test"; // pragma: allowlist secret
}

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const {
  appSettingStore,
  mockCallOllamaChat,
  mockReindexNadir,
} = vi.hoisted(() => ({
  appSettingStore: new Map<string, unknown>(),
  mockCallOllamaChat: vi.fn<[], Promise<string | null>>(),
  mockReindexNadir: vi.fn(async () => ({ ok: true, errors: [] })),
}));

// ── Storage in-memory ─────────────────────────────────────────────────────────
// Replica fedele dell'interfaccia reale: getAppSetting ritorna { value, valueJson };
// upsertAppSetting(key, value?, valueJson?) persiste il campo corretto.

vi.mock("../storage", () => ({
  storage: {
    getAppSetting: vi.fn(async (key: string) => {
      if (!appSettingStore.has(key)) return undefined;
      const stored = appSettingStore.get(key);
      return { value: stored, valueJson: stored };
    }),
    upsertAppSetting: vi.fn(
      async (key: string, value: unknown, valueJson?: unknown) => {
        appSettingStore.set(key, valueJson !== undefined ? valueJson : value);
      },
    ),
  },
}));

// ── DB stub (richiesto da importazioni indirette) ─────────────────────────────

vi.mock("../db", () => {
  const chain: Record<string, unknown> = {};
  const noop = () => chain;
  chain.select = noop;
  chain.from = noop;
  chain.where = noop;
  chain.orderBy = noop;
  chain.limit = async () => [];
  chain.delete = noop;
  return {
    db: chain,
    withDbRetry: <T,>(fn: () => Promise<T> | T) => Promise.resolve(fn()),
  };
});

// ── Ollama client ─────────────────────────────────────────────────────────────

vi.mock("../lib/ollama-client", () => ({
  callOllamaChat: mockCallOllamaChat,
}));

// ── Reindex (best-effort, non oggetto del test) ───────────────────────────────

vi.mock("../ai/nadir/reindex", () => ({
  reindexNadir: mockReindexNadir,
}));

// ── Dipendenze secondarie ─────────────────────────────────────────────────────

vi.mock("../ai/assistant/codebase-inventory", () => ({
  HORUS_THINK_TAG_CONTRACT: "You are a translator.",
}));

vi.mock("../embeddings", () => ({
  upsertEmbedding: vi.fn(async () => ({ ok: true })),
  getOpenAiCircuitBreakerStatus: () => ({ open: false, reason: null, reopenAt: null }),
}));

vi.mock("../embeddings/client", () => ({
  getLastUsedModelTag: () => "test-model",
}));

vi.mock("../ai/moderation/redact", () => ({
  redactPII: (t: string) => t,
}));

vi.mock("../ai/watchdog/log", () => ({
  writeWatchdogLog: vi.fn(async () => {}),
}));

vi.mock("../push-notifications", () => ({
  sendSystemAlertPushToAdmins: vi.fn(async () => {}),
}));

// ── Imports (dopo tutti i mock) ───────────────────────────────────────────────

import {
  saveNadirManual,
  getNadirManualForLanguage,
  saveNadirManualTranslations,
  getNadirManualTranslations,
  hashManualText,
} from "../ai/nadir/manual";
import {
  retranslateManualNow,
  isRetranslationInFlight,
} from "../ai/nadir/translate";

// ── Helper ────────────────────────────────────────────────────────────────────

/** Risposta Ollama minimale (nessun tag <think>). */
const ollamaTranslated = (lang: string) => `Translated text in ${lang}.`;

// ─────────────────────────────────────────────────────────────────────────────

describe("Task #125 — stale fallback dopo hand-edit admin", () => {
  beforeEach(() => {
    appSettingStore.clear();
    mockCallOllamaChat.mockReset();
    mockReindexNadir.mockReset().mockResolvedValue({ ok: true, errors: [] });
  });

  it("traduzione con sourceHash vecchio → getNadirManualForLanguage ricade sull'italiano", async () => {
    // Setup: italiano V1 salvato, traduzione generata per V1.
    await saveNadirManual("## Manuale V1\n\nContenuto originale italiano.");
    const hashV1 = hashManualText(await (await import("../ai/nadir/manual")).getNadirManual());

    await saveNadirManualTranslations({
      en: { text: "Manual V1 in English.", translatedAt: "2025-01-01T00:00:00Z", sourceHash: hashV1 },
    });

    // Admin salva il manuale V2 → hash cambia.
    await saveNadirManual("## Manuale V2\n\nContenuto aggiornato dall'admin.");

    // La traduzione inglese esiste ma è legata al vecchio sourceHash → stale.
    const resultEn = await getNadirManualForLanguage("en");
    const italian = await (await import("../ai/nadir/manual")).getNadirManual();

    // Deve tornare l'italiano, MAI la traduzione stantia.
    expect(resultEn).toBe(italian);
    expect(resultEn).not.toBe("Manual V1 in English.");
  });

  it("la lingua sorgente (it) è sempre quella corrente, mai tradotta", async () => {
    await saveNadirManual("## Manuale\n\nTesto italiano.");
    const italian = await getNadirManualForLanguage("it");
    expect(italian).toBe("## Manuale\n\nTesto italiano.");
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("Task #125 — retranslateManualNow salva traduzioni con sourceHash corrente", () => {
  beforeEach(() => {
    appSettingStore.clear();
    mockCallOllamaChat.mockReset();
    mockReindexNadir.mockReset().mockResolvedValue({ ok: true, errors: [] });
  });

  it("happy path: Ollama disponibile → traduzioni salvate con hash allineato all'italiano", async () => {
    await saveNadirManual("## Manuale\n\nContenuto italiano per il test.");

    // Ollama restituisce traduzioni per ogni lingua.
    mockCallOllamaChat.mockImplementation(async (prompt: string) => {
      // Il prompt contiene il nome della lingua: estraiamo per risposta realistica.
      const match = prompt.match(/Traduci FEDELMENTE in (\w+)/);
      return match ? ollamaTranslated(match[1]) : "Traduzione generica.";
    });

    const result = await retranslateManualNow("admin-edit");

    expect(result.skipped).toBe(false);
    // Almeno una lingua tradotta (en/de/es/fr/el/tr).
    expect(result.translatedLangs.length).toBeGreaterThan(0);
    expect(result.translatedLangs).not.toContain("it"); // italiano = sorgente, mai tradotto

    // Le traduzioni salvate hanno il sourceHash dell'italiano CORRENTE.
    const { getNadirManual } = await import("../ai/nadir/manual");
    const currentHash = hashManualText(await getNadirManual());
    const translations = await getNadirManualTranslations();

    for (const lang of result.translatedLangs) {
      expect(translations[lang]).toBeDefined();
      expect(translations[lang]!.sourceHash).toBe(currentHash);
      expect(translations[lang]!.text.length).toBeGreaterThan(0);
    }
  });

  it("happy path: dopo la ritraduzione, getNadirManualForLanguage serve il testo tradotto", async () => {
    await saveNadirManual("## Manuale\n\nContenuto italiano.");

    mockCallOllamaChat.mockResolvedValue("Manual content in English.");

    const result = await retranslateManualNow("admin-edit");
    expect(result.translatedLangs).toContain("en");

    const en = await getNadirManualForLanguage("en");
    // Ora la traduzione è allineata all'italiano → serve la traduzione, non il fallback.
    expect(en).toBe("Manual content in English.");
  });

  it("Ollama giù per TUTTE le lingue → nessuna traduzione salvata, nessun crash", async () => {
    await saveNadirManual("## Manuale\n\nContenuto italiano.");

    // Ollama sempre lancia → translateManualToLanguage ritorna null per ogni lingua.
    mockCallOllamaChat.mockRejectedValue(new Error("Ollama irraggiungibile"));

    const result = await retranslateManualNow("admin-edit");

    expect(result.skipped).toBe(false);
    expect(result.translatedLangs.length).toBe(0);

    // Nessuna traduzione salvata → getNadirManualForLanguage ricade sull'italiano.
    const en = await getNadirManualForLanguage("en");
    const italian = await (await import("../ai/nadir/manual")).getNadirManual();
    expect(en).toBe(italian);
  });

  it("manuale vuoto → retranslateManualNow ritorna senza chiamare Ollama", async () => {
    await saveNadirManual(""); // manuale vuoto

    const result = await retranslateManualNow("admin-edit");

    expect(result.skipped).toBe(false);
    expect(result.translatedLangs.length).toBe(0);
    expect(mockCallOllamaChat).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("Task #125 — guardia in-flight evita ritraduzione concorrente", () => {
  beforeEach(() => {
    appSettingStore.clear();
    mockCallOllamaChat.mockReset();
    mockReindexNadir.mockReset().mockResolvedValue({ ok: true, errors: [] });
  });

  afterEach(async () => {
    // Se un test lasciasse il flag acceso per un errore imprevisto, aspettiamo
    // che si resetti (il finally lo resetta sempre a fine corsa).
    // In condizioni normali non è necessario, ma rende la suite isolata.
    await vi.runAllTimersAsync().catch(() => {});
  });

  it("seconda chiamata mentre la prima è in corso → skipped:true senza nuova corsa Ollama", async () => {
    await saveNadirManual("## Manuale\n\nContenuto per il test della guardia.");

    // Contatore di chiamate Ollama per verificare che la seconda corsa non le esegua.
    let ollamaCallCount = 0;

    // Latch per controllare il completamento della prima corsa.
    let releaseLatch!: () => void;
    const latch = new Promise<void>((resolve) => {
      releaseLatch = resolve;
    });

    mockCallOllamaChat.mockImplementation(async () => {
      ollamaCallCount++;
      // La prima chiamata aspetta il latch: tiene la prima corsa in sospeso.
      await latch;
      return "Translated block.";
    });

    // Avvia la prima corsa, NON await ancora (gira in background).
    const firstRun = retranslateManualNow("admin-edit");

    // Cede il tick corrente così la prima corsa entra nel suo corpo async.
    await Promise.resolve();

    // Mentre la prima è in corso, isRetranslationInFlight deve essere true.
    expect(isRetranslationInFlight()).toBe(true);

    // La seconda chiamata deve essere saltata immediatamente.
    const secondResult = await retranslateManualNow("admin-edit");
    expect(secondResult.skipped).toBe(true);
    expect(secondResult.translatedLangs).toHaveLength(0);

    // Sblocca la prima corsa e attendi il completamento.
    releaseLatch();
    const firstResult = await firstRun;

    expect(firstResult.skipped).toBe(false);
    expect(isRetranslationInFlight()).toBe(false);

    // La seconda corsa NON ha aggiunto chiamate Ollama proprie.
    // La prima corsa ha chiamato Ollama per ogni lingua (TRANSLATABLE_APP_LANGUAGES.length blocchi
    // × 1 blocco nel manuale di test = TRANSLATABLE_APP_LANGUAGES.length chiamate).
    // La seconda corsa non ne ha aggiunte.
    expect(ollamaCallCount).toBeLessThanOrEqual(
      // Al massimo lingue × 1 blocco nella prima corsa (nessuna doppia corsa).
      6, // TRANSLATABLE_APP_LANGUAGES ha 6 lingue (tutte tranne "it")
    );
  });

  it("dopo la prima corsa completata, il flag è false e una nuova corsa può partire", async () => {
    await saveNadirManual("## Manuale\n\nContenuto.");

    mockCallOllamaChat.mockResolvedValue("Translated.");

    const first = await retranslateManualNow("admin-edit");
    expect(first.skipped).toBe(false);
    expect(isRetranslationInFlight()).toBe(false);

    // Seconda corsa: deve partire normalmente, non essere saltata.
    const second = await retranslateManualNow("horus-scan");
    expect(second.skipped).toBe(false);
  });
});
