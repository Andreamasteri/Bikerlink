/**
 * Test di regressione — Resilienza del seed tag al boot (server/seed-tags-runtime.ts).
 *
 * In produzione un blip del DB managed durante il boot generava una rejection
 * asincrona che sfuggiva al try/catch del chiamante → process.exit(1) →
 * crash-loop. `seedTagsAtStartup()` è stato reso NON-FATALE: cattura tutto,
 * degrada, e su errore transitorio pianifica UN retry differito.
 *
 * Questo file blinda quel comportamento:
 *  - un DB che lancia un errore TRANSITORIO non propaga (degrada) e pianifica il
 *    retry differito (setTimeout col delay atteso);
 *  - un errore NON transitorio non propaga e NON pianifica retry;
 *  - una passata andata a buon fine non pianifica alcun retry.
 *
 * Note di robustezza:
 *  - `./db` è mockato con un query-builder thenable controllabile → nessun DB reale.
 *  - niente fake timers: spiamo `setTimeout` (mock no-op) per verificare la
 *    pianificazione del retry senza eseguirlo. Evita flakiness/timeout.
 *  - `vi.resetModules()` + import dinamico isolano lo stato di modulo
 *    `deferredRetryScheduled` tra un test e l'altro.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Esito corrente di OGNI query DB: una funzione che ritorna una Promise.
// Mutabile per-test così simuliamo blip transitori, errori applicativi o successo.
let queryBehavior: () => Promise<unknown> = () => Promise.resolve([]);
// Conta ogni query DB eseguita (ogni `await` sul builder). Resettato per-test.
let queryCalls = 0;

vi.mock("../shared/db/tags", () => ({
  TAG_CATEGORY_SLUGS: { MUSICA: "musica", STILE_GUIDA: "stile-guida", TIPO_MOTO: "tipo-moto" },
  tagCategories: { slug: "slug", id: "id" },
  tags: { categoryId: "categoryId", slug: "slug", id: "id" },
}));

vi.mock("../db", () => {
  // Query-builder finto: thenable + chainable. Ogni metodo torna `q`, e `then`
  // delega al queryBehavior corrente, così select/insert/where/returning ecc.
  // condividono lo stesso esito controllabile dal test.
  function makeQuery() {
    const q: Record<string, unknown> = {};
    for (const m of ["from", "where", "values", "onConflictDoNothing", "returning"]) {
      q[m] = () => q;
    }
    (q as { then: unknown }).then = (
      resolve: (v: unknown) => unknown,
      reject: (e: unknown) => unknown
    ) => {
      queryCalls++;
      return queryBehavior().then(resolve, reject);
    };
    return q;
  }
  return {
    db: { select: () => makeQuery(), insert: () => makeQuery() },
    withDbRetry: (fn: () => Promise<unknown>) => fn(),
    isTransientDbError: (e: unknown) => !!(e as { __transient?: boolean })?.__transient,
  };
});

const DEFERRED_RETRY_DELAY_MS = 60_000;

// Import fresco per ogni test: `seed-tags-runtime` ha stato di modulo
// (`deferredRetryScheduled`) che altrimenti perderebbe tra un test e l'altro.
// L'import avviene PRIMA di spiare setTimeout così il caricamento del modulo
// usa i timer reali (nessun rischio di hang/timeout).
async function loadSeed(): Promise<() => Promise<void>> {
  const mod = await import("../seed-tags-runtime");
  return mod.seedTagsAtStartup;
}

function transientError(): Error {
  return Object.assign(new Error("connection terminated unexpectedly"), { __transient: true });
}
function appError(): Error {
  return Object.assign(new Error("duplicate key value violates unique constraint"), {
    __transient: false,
  });
}

let setTimeoutSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.resetModules();
  // silenzia il log rumoroso del seed nei test
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  queryBehavior = () => Promise.resolve([]);
  queryCalls = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * Spia `setTimeout` con una mock no-op: il callback del retry NON viene mai
 * eseguito (così non tocca il DB), ma possiamo verificare se/con-quale-delay è
 * stato pianificato. Ritorna un finto handle con `.unref()` perché
 * scheduleDeferredSeedRetry chiama `.unref?.()`.
 */
function spyOnSetTimeout(): void {
  setTimeoutSpy = vi
    .spyOn(globalThis, "setTimeout")
    .mockImplementation((() => ({ unref() {} })) as unknown as typeof setTimeout);
}

function deferredRetryDelays(): number[] {
  return setTimeoutSpy.mock.calls
    .map((c) => Number(c[1]))
    .filter((d) => d === DEFERRED_RETRY_DELAY_MS);
}

describe("seedTagsAtStartup — errore transitorio", () => {
  it("NON propaga (degrada) quando il DB lancia un errore transitorio", async () => {
    const seedTagsAtStartup = await loadSeed();
    spyOnSetTimeout();
    queryBehavior = () => Promise.reject(transientError());
    // Non deve rigettare: il boot prosegue.
    await expect(seedTagsAtStartup()).resolves.toBeUndefined();
    expect(queryCalls).toBeGreaterThanOrEqual(1); // la passata ha toccato il DB
  });

  it("pianifica UN retry differito col delay atteso (60s)", async () => {
    const seedTagsAtStartup = await loadSeed();
    spyOnSetTimeout();
    queryBehavior = () => Promise.reject(transientError());
    await seedTagsAtStartup();
    // Esattamente un retry differito pianificato col delay corretto.
    expect(deferredRetryDelays()).toEqual([DEFERRED_RETRY_DELAY_MS]);
  });
});

describe("seedTagsAtStartup — errore applicativo (non transitorio)", () => {
  it("NON propaga e NON pianifica alcun retry differito", async () => {
    const seedTagsAtStartup = await loadSeed();
    spyOnSetTimeout();
    queryBehavior = () => Promise.reject(appError());
    await expect(seedTagsAtStartup()).resolves.toBeUndefined();
    // Nessun retry differito pianificato.
    expect(deferredRetryDelays()).toEqual([]);
  });
});

describe("seedTagsAtStartup — passata a buon fine", () => {
  it("non pianifica retry quando la passata completa senza errori", async () => {
    const seedTagsAtStartup = await loadSeed();
    spyOnSetTimeout();
    // Le categorie canoniche sono presenti → la passata gira senza throw.
    const cats = [
      { slug: "musica", id: 1 },
      { slug: "stile-guida", id: 2 },
      { slug: "tipo-moto", id: 3 },
    ];
    queryBehavior = () => Promise.resolve(cats);

    await expect(seedTagsAtStartup()).resolves.toBeUndefined();
    expect(queryCalls).toBeGreaterThan(0); // la passata ha eseguito query
    expect(deferredRetryDelays()).toEqual([]); // nessun retry differito
  });
});
