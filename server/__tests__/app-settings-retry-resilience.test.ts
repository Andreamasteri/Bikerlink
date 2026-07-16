/**
 * Tests: SystemStorage app_settings — retry resilienza (Task #6)
 *
 * Verifica che getAppSetting / getAllAppSettings / upsertAppSetting siano
 * avvolti in `withDbRetry` (retry SOLO su blip transitorio riconosciuto) senza
 * regredire la cache in-memory (TTL 60s).
 *
 * Strategia
 * ---------
 * - `withDbRetry` e `isTransientDbError` REALI (importOriginal): si testa
 *   l'integrazione vera, non un doppione del retry.
 * - Solo l'oggetto `db` è sostituito con un mock chainable controllabile che
 *   può far fallire l'N-esimo tentativo con un errore transitorio o applicativo.
 *
 * Scenari coperti:
 *   (a) errore transitorio poi successo  → il retry assorbe il blip
 *   (b) guasto transitorio persistente   → l'errore viene propagato (no finta di successo)
 *   (b') errore applicativo (constraint)  → propagato SUBITO, nessun retry
 *   (c) cache in-memory                   → hit entro TTL, un fallimento NON viene cachato,
 *                                           upsert invalida la cache
 */

import { vi, describe, it, expect, beforeEach } from "vitest";

// ── Hoisted setup ─────────────────────────────────────────────────────────────

vi.hoisted(() => {
  process.env.DATABASE_URL =
    process.env.DATABASE_URL || "postgres://test:test@localhost:5432/test"; // pragma: allowlist secret
});

const { mockDbSelect, mockDbInsert } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockDbInsert: vi.fn(),
}));

// ── Mock: database — mantiene withDbRetry/isTransientDbError/DbTimeoutError REALI,
//    sostituisce solo l'oggetto `db`. ───────────────────────────────────────────

vi.mock("../db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../db")>();
  return {
    ...actual,
    db: {
      select: mockDbSelect,
      insert: mockDbInsert,
      update: vi.fn(),
      delete: vi.fn(),
      transaction: vi.fn(),
    },
  };
});

// ── Mock: classe base dello storage (evita catena di import non necessari) ────

vi.mock("../storage/ads", () => ({
  AdsStorage: class {},
}));

// ── Imports (dopo i mock) ─────────────────────────────────────────────────────

import { SystemStorage } from "../storage/system";
import { DbTimeoutError } from "../db";

// ── Helper: builder chainable per db.select().from().where().limit() ──────────
//   Il valore terminale è prodotto da `terminal()` ad ogni tentativo, così si
//   può far fallire il primo tentativo e riuscire il secondo.

function makeSelectChain(terminal: () => Promise<unknown[]>) {
  // getAppSetting: .from().where().limit(1)
  // getAllAppSettings: .from()  → deve essere direttamente awaitable
  const fromResult = {
    where: () => ({ limit: () => terminal() }),
    then: (onF: (v: unknown[]) => unknown, onR?: (e: unknown) => unknown) =>
      terminal().then(onF, onR),
  };
  return { from: () => fromResult };
}

function makeInsertChain(terminal: () => Promise<unknown[]>) {
  // upsertAppSetting: .values().onConflictDoUpdate().returning()
  return {
    values: () => ({
      onConflictDoUpdate: () => ({ returning: () => terminal() }),
    }),
  };
}

const transientErr = () => new DbTimeoutError(5000);
const constraintErr = () => Object.assign(new Error("duplicate key"), { code: "23505" });

let storage: SystemStorage;

beforeEach(() => {
  vi.clearAllMocks();
  storage = new SystemStorage();
  storage.invalidateAppSettingCache(); // parte da cache pulita
});

describe("getAppSetting — retry resilienza", () => {
  it("(a) assorbe un blip transitorio e va a buon fine al retry", async () => {
    let attempt = 0;
    const row = { key: "auto_matching_enabled", value: "true" };
    mockDbSelect.mockImplementation(() =>
      makeSelectChain(() => {
        attempt++;
        if (attempt === 1) return Promise.reject(transientErr());
        return Promise.resolve([row]);
      }),
    );

    const result = await storage.getAppSetting("auto_matching_enabled");
    expect(result).toEqual(row);
    expect(attempt).toBe(2); // un fallimento + un successo
  });

  it("(b) propaga l'errore su guasto transitorio persistente (no finta di successo)", async () => {
    let attempt = 0;
    mockDbSelect.mockImplementation(() =>
      makeSelectChain(() => {
        attempt++;
        return Promise.reject(transientErr());
      }),
    );

    await expect(storage.getAppSetting("auto_matching_enabled")).rejects.toBeInstanceOf(
      DbTimeoutError,
    );
    expect(attempt).toBe(3); // 1 tentativo + 2 retry (default)
  });

  it("(b') propaga SUBITO un errore applicativo (constraint) senza ritentare", async () => {
    let attempt = 0;
    mockDbSelect.mockImplementation(() =>
      makeSelectChain(() => {
        attempt++;
        return Promise.reject(constraintErr());
      }),
    );

    await expect(storage.getAppSetting("auto_matching_enabled")).rejects.toMatchObject({
      code: "23505",
    });
    expect(attempt).toBe(1); // nessun retry su errore non transitorio
  });
});

describe("getAppSetting — cache in-memory", () => {
  it("(c) serve dalla cache entro il TTL senza ricolpire il DB", async () => {
    const row = { key: "auto_matching_enabled", value: "true" };
    mockDbSelect.mockImplementation(() => makeSelectChain(() => Promise.resolve([row])));

    const first = await storage.getAppSetting("auto_matching_enabled");
    const second = await storage.getAppSetting("auto_matching_enabled");

    expect(first).toEqual(row);
    expect(second).toEqual(row);
    expect(mockDbSelect).toHaveBeenCalledTimes(1); // secondo read servito dalla cache
  });

  it("(c) un fallimento persistente NON viene cachato come valore valido", async () => {
    // 1° chiamata: guasto persistente → deve throw e NON scrivere in cache.
    mockDbSelect.mockImplementationOnce(() =>
      makeSelectChain(() => Promise.reject(transientErr())),
    );
    mockDbSelect.mockImplementationOnce(() =>
      makeSelectChain(() => Promise.reject(transientErr())),
    );
    mockDbSelect.mockImplementationOnce(() =>
      makeSelectChain(() => Promise.reject(transientErr())),
    );
    await expect(storage.getAppSetting("k")).rejects.toBeInstanceOf(DbTimeoutError);

    // 2° chiamata: il DB si riprende → deve RICOLPIRE il DB (niente valore fittizio in cache).
    const row = { key: "k", value: "v" };
    mockDbSelect.mockImplementation(() => makeSelectChain(() => Promise.resolve([row])));
    const result = await storage.getAppSetting("k");
    expect(result).toEqual(row);
  });

  it("(c) upsertAppSetting invalida la cache per la chiave", async () => {
    const rowA = { key: "k", value: "a" };
    mockDbSelect.mockImplementation(() => makeSelectChain(() => Promise.resolve([rowA])));
    await storage.getAppSetting("k"); // popola la cache
    expect(mockDbSelect).toHaveBeenCalledTimes(1);

    const rowB = { key: "k", value: "b" };
    mockDbInsert.mockImplementation(() => makeInsertChain(() => Promise.resolve([rowB])));
    await storage.upsertAppSetting("k", "b"); // deve invalidare la cache

    // Il read successivo deve ricolpire il DB e vedere il nuovo valore.
    mockDbSelect.mockImplementation(() => makeSelectChain(() => Promise.resolve([rowB])));
    const after = await storage.getAppSetting("k");
    expect(after).toEqual(rowB);
    expect(mockDbSelect).toHaveBeenCalledTimes(2);
  });
});

describe("upsertAppSetting / getAllAppSettings — retry resilienza", () => {
  it("upsertAppSetting assorbe un blip transitorio", async () => {
    let attempt = 0;
    const row = { key: "k", value: "v" };
    mockDbInsert.mockImplementation(() =>
      makeInsertChain(() => {
        attempt++;
        if (attempt === 1) return Promise.reject(transientErr());
        return Promise.resolve([row]);
      }),
    );

    const result = await storage.upsertAppSetting("k", "v");
    expect(result).toEqual(row);
    expect(attempt).toBe(2);
  });

  it("getAllAppSettings assorbe un blip transitorio", async () => {
    let attempt = 0;
    const rows = [{ key: "a", value: "1" }];
    mockDbSelect.mockImplementation(() =>
      makeSelectChain(() => {
        attempt++;
        if (attempt === 1) return Promise.reject(transientErr());
        return Promise.resolve(rows);
      }),
    );

    const result = await storage.getAllAppSettings();
    expect(result).toEqual(rows);
    expect(attempt).toBe(2);
  });
});

// ── Scenari: validazione del parametro key ────────────────────────────────────
//
// getAppSetting con chiave null/undefined/vuota deve restituire undefined senza
// mai toccare il DB (nessun mockDbSelect chiamato).
// upsertAppSetting con chiave invalida deve lanciare subito un errore strutturato
// senza mai toccare il DB (nessun mockDbInsert chiamato).

describe("getAppSetting — validazione chiave", () => {
  it("restituisce undefined per chiave stringa vuota senza colpire il DB", async () => {
    const result = await storage.getAppSetting("");
    expect(result).toBeUndefined();
    expect(mockDbSelect).not.toHaveBeenCalled();
  });

  it("restituisce undefined per chiave null (cast a string) senza colpire il DB", async () => {
    // In JavaScript i tipi runtime possono arrivare come null/undefined anche se
    // la firma TypeScript dice string. Il guard difende da questi casi reali.
    const result = await storage.getAppSetting(null as unknown as string);
    expect(result).toBeUndefined();
    expect(mockDbSelect).not.toHaveBeenCalled();
  });

  it("restituisce undefined per chiave undefined senza colpire il DB", async () => {
    const result = await storage.getAppSetting(undefined as unknown as string);
    expect(result).toBeUndefined();
    expect(mockDbSelect).not.toHaveBeenCalled();
  });

  it("colpisce il DB normalmente per una chiave inesistente ma valida", async () => {
    // La chiave è sintatticamente valida ma non esiste nella tabella → undefined.
    mockDbSelect.mockImplementation(() => makeSelectChain(() => Promise.resolve([])));
    const result = await storage.getAppSetting("key_che_non_esiste");
    expect(result).toBeUndefined();
    expect(mockDbSelect).toHaveBeenCalledTimes(1);
  });
});

describe("upsertAppSetting — validazione chiave", () => {
  it("lancia errore strutturato per chiave stringa vuota senza colpire il DB", async () => {
    await expect(storage.upsertAppSetting("", "v")).rejects.toMatchObject({
      code: "APP_SETTING_INVALID_KEY",
    });
    expect(mockDbInsert).not.toHaveBeenCalled();
  });

  it("lancia errore strutturato per chiave null senza colpire il DB", async () => {
    await expect(
      storage.upsertAppSetting(null as unknown as string, "v"),
    ).rejects.toMatchObject({ code: "APP_SETTING_INVALID_KEY" });
    expect(mockDbInsert).not.toHaveBeenCalled();
  });

  it("lancia errore strutturato per chiave undefined senza colpire il DB", async () => {
    await expect(
      storage.upsertAppSetting(undefined as unknown as string, "v"),
    ).rejects.toMatchObject({ code: "APP_SETTING_INVALID_KEY" });
    expect(mockDbInsert).not.toHaveBeenCalled();
  });
});
