/**
 * Task #445 — collectErrors() byPlatform edge case: una sola piattaforma con
 * sessioni (l'altra a zero) deve produrre un byPlatform con UN SOLO entry.
 *
 * Copre:
 *   - android-only: byPlatform = { android: <rate> }, nessuna chiave ios
 *   - ios-only:     byPlatform = { ios: <rate> }, nessuna chiave android
 *   - entrambe:     byPlatform ha entrambe le chiavi
 *   - piattaforma con total_sessions=0: esclusa dal byPlatform (non emette NaN)
 *
 * La query byPlatform filtra già `platform IN ('android', 'ios') … GROUP BY platform`
 * e include solo righe con total_sessions > 0 (guard nell'assembler TS).
 * Queste verifiche coprono che la LOGICA TS rispetti correttamente il risultato
 * restituito dal DB (zero sessioni → nessuna riga → key assente in byPlatform).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── DB mock ─────────────────────────────────────────────────────────────────
// withDbRetry chiama direttamente la funzione passata; db.select ritorna una
// chain chainable; db.execute ritorna sequenzialmente i valori configurati
// per le 3 query: (1) crash_free_rate, (2) byPlatform, (3) version_delta.

const dbExecuteMock = vi.hoisted(() => vi.fn());
const dbSelectMock = vi.hoisted(() =>
  vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([{ c: 0 }]),
    }),
  }),
);

vi.mock("../db", () => ({
  db: {
    select: dbSelectMock,
    execute: dbExecuteMock,
  },
  withDbRetry: vi.fn(async (fn: () => unknown) => fn()),
}));

vi.mock("drizzle-orm", () => ({
  count: vi.fn(() => ({})),
  sql: new Proxy(
    (strings: TemplateStringsArray, ..._values: unknown[]) => strings.join("?"),
    { get: (target, prop) => (prop === Symbol.toPrimitive ? target : target) },
  ),
}));

vi.mock("@shared/db", () => ({ appCrashLogs: {} }));

vi.mock("../storage", () => ({
  storage: {
    // resolveMinCrashSessions → soglia 20; i test usano totalSessions ≥20
    getAppSetting: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock("../lib/dedup-logger", () => ({
  dedupWarn: vi.fn(),
}));

// Importa DOPO i mock (Vitest hoist garantisce l'ordine)
import { collectErrors, resetState } from "../ai/watchdog/collectors/error-collector";
import type { Signal } from "../ai/watchdog/types";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Valore restituito dalla prima db.execute() → query crash_count/total_sessions */
function rateRow(crashCount: number, totalSessions: number) {
  return { rows: [{ crash_count: String(crashCount), total_sessions: String(totalSessions) }] };
}

/** Riga piattaforma per la seconda db.execute() → query byPlatform */
function platformRow(platform: string, crashes: number, sessions: number) {
  return { platform, crash_count: String(crashes), total_sessions: String(sessions) };
}

/** Valore restituito dalla terza db.execute() → query version_delta (irrilevante) */
const emptyVersionDelta = { rows: [{}] };

/** Estrae il segnale client.crash_free_rate_24h dai segnali emessi */
function crashRateSignal(signals: Signal[]): Signal | undefined {
  return signals.find((s) => s.metric === "client.crash_free_rate_24h");
}

// ── Test ──────────────────────────────────────────────────────────────────────

describe("collectErrors() byPlatform — piattaforma singola (Task #445)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetState();
    // Ripristina il mock della chain select → [{ c: 0 }] (0 crash nell'ora)
    dbSelectMock.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ c: 0 }]),
      }),
    });
  });

  it("android-only: byPlatform contiene solo 'android', nessuna chiave 'ios'", async () => {
    // totalSessions=100 ≥ soglia default 20 → segnale con crashFreeRate reale
    dbExecuteMock
      .mockResolvedValueOnce(rateRow(5, 100))
      .mockResolvedValueOnce({ rows: [platformRow("android", 5, 100)] })
      .mockResolvedValueOnce(emptyVersionDelta);

    const signals = await collectErrors();
    const sig = crashRateSignal(signals);

    expect(sig).toBeDefined();
    const bp = (sig!.details as Record<string, unknown>)?.byPlatform as Record<string, number>;
    expect(bp).toBeDefined();
    expect(Object.keys(bp)).toEqual(["android"]);
    expect(bp["android"]).toBeCloseTo(95, 1); // (100-5)/100 * 100 = 95.0
    expect(bp["ios"]).toBeUndefined();
  });

  it("ios-only: byPlatform contiene solo 'ios', nessuna chiave 'android'", async () => {
    dbExecuteMock
      .mockResolvedValueOnce(rateRow(10, 200))
      .mockResolvedValueOnce({ rows: [platformRow("ios", 10, 200)] })
      .mockResolvedValueOnce(emptyVersionDelta);

    const signals = await collectErrors();
    const sig = crashRateSignal(signals);

    expect(sig).toBeDefined();
    const bp = (sig!.details as Record<string, unknown>)?.byPlatform as Record<string, number>;
    expect(Object.keys(bp)).toEqual(["ios"]);
    expect(bp["ios"]).toBeCloseTo(95, 1); // (200-10)/200 * 100 = 95.0
    expect(bp["android"]).toBeUndefined();
  });

  it("entrambe le piattaforme: byPlatform ha 'android' e 'ios'", async () => {
    dbExecuteMock
      .mockResolvedValueOnce(rateRow(15, 300))
      .mockResolvedValueOnce({
        rows: [
          platformRow("android", 10, 200),
          platformRow("ios", 5, 100),
        ],
      })
      .mockResolvedValueOnce(emptyVersionDelta);

    const signals = await collectErrors();
    const sig = crashRateSignal(signals);

    expect(sig).toBeDefined();
    const bp = (sig!.details as Record<string, unknown>)?.byPlatform as Record<string, number>;
    expect(bp["android"]).toBeCloseTo(95, 1); // (200-10)/200*100 = 95.0
    expect(bp["ios"]).toBeCloseTo(95, 1);     // (100-5)/100*100 = 95.0
  });

  it("piattaforma con total_sessions=0: esclusa dal byPlatform (no NaN, no chiave)", async () => {
    // Il DB restituisce iOS con 0 sessioni (es. nessun accesso iOS nella finestra)
    dbExecuteMock
      .mockResolvedValueOnce(rateRow(5, 100))
      .mockResolvedValueOnce({
        rows: [
          platformRow("android", 5, 100),
          platformRow("ios", 0, 0), // zero sessioni → guard TS deve escludere
        ],
      })
      .mockResolvedValueOnce(emptyVersionDelta);

    const signals = await collectErrors();
    const sig = crashRateSignal(signals);

    expect(sig).toBeDefined();
    const bp = (sig!.details as Record<string, unknown>)?.byPlatform as Record<string, number>;
    expect(bp["android"]).toBeDefined();
    expect(bp["ios"]).toBeUndefined(); // total_sessions=0 → esclusa
  });

  it("nessuna piattaforma: byPlatform è un oggetto vuoto ({}), non undefined", async () => {
    // DB non restituisce righe per la query platform (nessun accesso in 24h)
    dbExecuteMock
      .mockResolvedValueOnce(rateRow(0, 0))
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce(emptyVersionDelta);

    const signals = await collectErrors();
    const sig = crashRateSignal(signals);

    expect(sig).toBeDefined();
    const bp = (sig!.details as Record<string, unknown>)?.byPlatform as Record<string, number>;
    expect(bp).toBeDefined();
    expect(Object.keys(bp)).toHaveLength(0);
  });

  it("byPlatform calcola il crash-free rate con arrotondamento a 1 decimale", async () => {
    // 1 crash su 3 sessioni → crash-free = 2/3 * 100 = 66.666... → 66.7
    dbExecuteMock
      .mockResolvedValueOnce(rateRow(1, 3))
      .mockResolvedValueOnce({ rows: [platformRow("android", 1, 3)] })
      .mockResolvedValueOnce(emptyVersionDelta);

    const signals = await collectErrors();
    const sig = crashRateSignal(signals);

    const bp = (sig!.details as Record<string, unknown>)?.byPlatform as Record<string, number>;
    // Math.round((2/3)*100*10)/10 = Math.round(666.6...)/10 = 667/10 = 66.7
    expect(bp["android"]).toBe(66.7);
  });
});
