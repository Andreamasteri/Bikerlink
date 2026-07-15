/**
 * Task #107 — Verifica dei DUE bug di correttezza segnalati in code review sulla
 * reindicizzazione multilingua del manuale:
 *
 *   1. Fallimento PARZIALE (una lingua/chunk su N fallisce l'embedding): il
 *      manifest pubblicato deve riflettere ESATTAMENTE ciò che è realmente nel
 *      DB (le lingue riuscite), non essere scartato in blocco solo perché
 *      `ok=false` — altrimenti manifest e tabella `embeddings` vanno alla deriva.
 *   2. Fallimento TOTALE (nessun chunk indicizzato): niente deve essere scritto
 *      né prunato — l'indice vecchio resta intatto e servito, esattamente come
 *      il comportamento pre-Task#107 quando l'unica scrittura Ollama falliva.
 *   3. Traduzione stantia: una traduzione il cui sourceHash non combacia più con
 *      l'italiano ATTUALE non va mai servita/indicizzata — si ricade sempre
 *      sull'italiano (gestisce sia "tutte le traduzioni sono fallite in questa
 *      corsa" sia "un admin ha modificato a mano il manuale italiano").
 */
import { vi, describe, it, expect, beforeEach } from "vitest";

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgres://test:test@localhost:5432/test";
}

const {
  appSettingStore,
  mockUpsertEmbedding,
  mockDbDelete,
  mockDbSelectRows,
} = vi.hoisted(() => ({
  appSettingStore: new Map<string, unknown>(),
  mockUpsertEmbedding: vi.fn(async () => ({ ok: true })),
  mockDbDelete: vi.fn(),
  mockDbSelectRows: [] as unknown[],
}));

vi.mock("../storage", () => ({
  storage: {
    getAppSetting: vi.fn(async (key: string) =>
      appSettingStore.has(key) ? { valueJson: appSettingStore.get(key), value: appSettingStore.get(key) } : undefined,
    ),
    upsertAppSetting: vi.fn(async (key: string, value: unknown, valueJson: unknown) => {
      appSettingStore.set(key, valueJson !== undefined ? valueJson : value);
    }),
  },
}));

vi.mock("../db", () => {
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.from = () => chain;
  chain.orderBy = () => chain;
  chain.limit = async () => mockDbSelectRows;
  chain.delete = () => chain;
  chain.where = async (...args: unknown[]) => mockDbDelete(...args);
  return {
    db: chain,
    withDbRetry: <T,>(fn: () => Promise<T> | T) => Promise.resolve(fn()),
  };
});

vi.mock("../embeddings", () => ({
  upsertEmbedding: mockUpsertEmbedding,
  // reindexNadir legge lo stato del circuit breaker OpenAI a fine run per
  // riportarlo nello status; in test è sempre chiuso (nessuna quota esaurita).
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

import { reindexNadir } from "../ai/nadir/reindex";
import {
  getNadirManual,
  saveNadirManual,
  saveNadirManualTranslations,
  getNadirManualForLanguage,
  getAllNadirManualVersions,
  hashManualText,
} from "../ai/nadir/manual";
import { NADIR_MANUAL_ENTITY_TYPE, NADIR_FRAGMENTS_KEY } from "../ai/nadir/constants";

describe("Task #107 — reindicizzazione manuale multilingua: correttezza manifest↔DB", () => {
  beforeEach(() => {
    appSettingStore.clear();
    mockUpsertEmbedding.mockReset().mockImplementation(async () => ({ ok: true }));
    mockDbDelete.mockReset();
    mockDbSelectRows.length = 0;
  });

  it("fallimento PARZIALE: pubblica il manifest per le lingue riuscite (mai manifest↔DB disallineati)", async () => {
    await saveNadirManual("# Manuale\n\nTesto italiano di prova sufficientemente lungo.");
    await saveNadirManualTranslations({
      en: {
        text: "# Manual\n\nEnglish test text long enough.",
        translatedAt: new Date().toISOString(),
        sourceHash: hashManualText(await getNadirManual()),
      },
    });

    // La lingua "en" fallisce SEMPRE l'embedding, "it" riesce sempre.
    mockUpsertEmbedding.mockImplementation(async (_type: string, id: string) => {
      if (id.startsWith("en-")) throw new Error("embedding provider down for en");
      return { ok: true };
    });

    const status = await reindexNadir("manual");

    // La corsa segnala l'errore parziale...
    expect(status.ok).toBe(false);
    expect(status.errors.some((e) => e.includes("manual"))).toBe(true);

    // ...ma il manifest pubblicato riflette ESATTAMENTE lo stato reale del DB:
    // l'italiano (riuscito) è presente, l'inglese (fallito) NON lo è — MAI un
    // manifest che punta a embedding italiani con testo/id disallineati, e MAI
    // un manifest completamente vuoto solo perché una lingua su due è fallita.
    const manifest = appSettingStore.get(NADIR_FRAGMENTS_KEY) as Record<string, unknown>;
    const manualKeys = Object.keys(manifest).filter((k) => k.startsWith(`${NADIR_MANUAL_ENTITY_TYPE}:`));
    expect(manualKeys.some((k) => k.startsWith(`${NADIR_MANUAL_ENTITY_TYPE}:it-`))).toBe(true);
    expect(manualKeys.some((k) => k.startsWith(`${NADIR_MANUAL_ENTITY_TYPE}:en-`))).toBe(false);
  });

  it("fallimento TOTALE: non scrive né pruna nulla, l'indice vecchio resta intatto", async () => {
    await saveNadirManual("# Manuale\n\nTesto italiano di prova sufficientemente lungo per un chunk.");

    // Manifest preesistente da una corsa precedente riuscita (mai deve sparire).
    const oldManifest = {
      [`${NADIR_MANUAL_ENTITY_TYPE}:it-chunk-0`]: { origin: "manual", text: "vecchio testo indicizzato", lang: "it" },
    };
    appSettingStore.set(NADIR_FRAGMENTS_KEY, oldManifest);

    // OGNI scrittura fallisce in questa corsa (es. provider embedding giù).
    mockUpsertEmbedding.mockImplementation(async () => {
      throw new Error("embedding provider completamente giù");
    });

    const status = await reindexNadir("manual");

    expect(status.ok).toBe(false);

    // Il manifest MANUALE preesistente non deve MAI sparire/essere svuotato per
    // via di un fallimento totale (pruneStale coi keepIds vuoti cancellerebbe
    // l'intero indice, comprese lingue indicizzate con successo in corse
    // precedenti, se venisse invocato senza aver scritto nulla di nuovo).
    const manifest = appSettingStore.get(NADIR_FRAGMENTS_KEY) as Record<string, unknown>;
    const manualKeys = Object.keys(manifest).filter((k) => k.startsWith(`${NADIR_MANUAL_ENTITY_TYPE}:`));
    expect(manualKeys).toEqual(Object.keys(oldManifest));
    expect(manifest[`${NADIR_MANUAL_ENTITY_TYPE}:it-chunk-0`]).toEqual(
      oldManifest[`${NADIR_MANUAL_ENTITY_TYPE}:it-chunk-0`],
    );
  });
});

describe("Task #107 — traduzioni stantie ricadono sempre sull'italiano", () => {
  beforeEach(() => {
    appSettingStore.clear();
  });

  it("una traduzione con sourceHash non combaciante viene ignorata (fallback italiano)", async () => {
    await saveNadirManual("# Manuale\n\nVersione ATTUALE del manuale italiano.");
    // Traduzione generata per una versione PRECEDENTE dell'italiano (hash diverso):
    // simula sia "tutte le traduzioni sono fallite in questa corsa e sono rimaste
    // quelle vecchie" sia "un admin ha modificato a mano il manuale italiano".
    await saveNadirManualTranslations({
      en: { text: "Stale English translation", translatedAt: new Date().toISOString(), sourceHash: "stale-hash-000" },
    });

    const en = await getNadirManualForLanguage("en");
    expect(en).toBe(await getNadirManual());
    expect(en).not.toBe("Stale English translation");

    const versions = await getAllNadirManualVersions();
    expect(versions.en).toBeUndefined();
    expect(versions.it).toBe(await getNadirManual());
  });

  it("una traduzione con sourceHash allineato viene servita normalmente", async () => {
    await saveNadirManual("# Manuale\n\nVersione corrente.");
    const currentHash = hashManualText(await getNadirManual());
    await saveNadirManualTranslations({
      en: { text: "Current English translation", translatedAt: new Date().toISOString(), sourceHash: currentHash },
    });

    expect(await getNadirManualForLanguage("en")).toBe("Current English translation");
    const versions = await getAllNadirManualVersions();
    expect(versions.en).toBe("Current English translation");
  });
});
