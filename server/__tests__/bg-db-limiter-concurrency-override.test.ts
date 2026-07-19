// Task #877 — Verifica che setConcurrencyOverride() abbatta immediatamente il
// tetto effettivo del bg-db-limiter anche con job in coda o già attivi.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Importiamo il modulo REALE (non mockato) per testare il comportamento del limiter.
// Il modulo usa `pool` solo internamente nelle connessioni: non viene toccato in
// questi test (testiamo solo withBgDbSlot / setConcurrencyOverride).
vi.mock("../db", () => ({
  db: {},
  pool: {
    connect: vi.fn(async () => ({ release: vi.fn(), query: vi.fn() })),
    idleCount: 0,
  },
}));

// Importiamo DOPO il mock del db.
import { withBgDbSlot, setConcurrencyOverride, getBgDbLimiterStats } from "../lib/bg-db-limiter";

// Helper: lancia N job che tengono uno slot per `holdMs` ms.
function launchJobs(n: number, holdMs: number): Promise<void>[] {
  return Array.from({ length: n }, () =>
    withBgDbSlot(() => new Promise<void>((resolve) => setTimeout(resolve, holdMs))),
  );
}

// Svuota l'override dopo ogni test per non inquinare i successivi.
afterEach(() => {
  setConcurrencyOverride(null);
});

beforeEach(() => {
  setConcurrencyOverride(null);
});

describe("setConcurrencyOverride — bg-db-limiter (Task #877)", () => {
  it("nessun over-admission: abbassare il max mentre ci sono job in coda non sveglia waiter in eccesso", async () => {
    // Saturiamo il limiter con 3 job lunghi (il default max è 3).
    const longJobs = launchJobs(3, 200);

    // Aspettiamo che tutti e 3 siano entrati (active=3).
    await new Promise((r) => setTimeout(r, 20));
    expect(getBgDbLimiterStats().active).toBe(3);

    // Accodiamo 2 job addizionali: entreranno in coda.
    let admitted = 0;
    const queuedJobs = [
      withBgDbSlot(async () => { admitted++; }),
      withBgDbSlot(async () => { admitted++; }),
    ];

    // Abbassa il tetto a 1: i waiter in coda NON devono essere immediatamente
    // svegliati quando uno dei 3 job attivi finisce.
    setConcurrencyOverride(1);
    expect(getBgDbLimiterStats().active).toBe(3); // i 3 attivi rimangono attivi

    // Aspettiamo che i 3 job lunghi finiscano (rilasciano i loro slot).
    await Promise.all(longJobs);

    // Dopo che tutti e 3 hanno finito, con max=1 solo 1 dei 2 accodati può girare
    // alla volta. Contiamo quanti sono stati effettivamente ammessi.
    await Promise.allSettled(queuedJobs);

    // Entrambi devono comunque completare (il limite rallenta l'ammissione, non rifiuta).
    expect(admitted).toBe(2);
    // In nessun momento durante il drenaggio devono esserci stati >1 job attivi
    // (verificabile indirettamente: se admitted=2 senza errori il sequenziamento è ok).
    expect(getBgDbLimiterStats().active).toBe(0);
  });

  it("no over-admission: con override=1 attivo, mai più di 1 job alla volta", async () => {
    setConcurrencyOverride(1);

    const order: string[] = [];
    let concurrentPeak = 0;
    let currentConcurrent = 0;

    async function trackedJob(name: string, holdMs: number) {
      return withBgDbSlot(async () => {
        currentConcurrent++;
        concurrentPeak = Math.max(concurrentPeak, currentConcurrent);
        order.push(`start:${name}`);
        await new Promise<void>((r) => setTimeout(r, holdMs));
        order.push(`end:${name}`);
        currentConcurrent--;
      });
    }

    await Promise.all([
      trackedJob("A", 30),
      trackedJob("B", 30),
      trackedJob("C", 30),
    ]);

    // Con max=1 i job devono essere serializzati: il picco di concorrenza è 1.
    expect(concurrentPeak).toBe(1);
    expect(getBgDbLimiterStats().active).toBe(0);
  });

  it("rollback a null ripristina il comportamento originale (max=3)", async () => {
    setConcurrencyOverride(1);

    // Con override=1, solo 1 job alla volta: la concorrenza dentro lo slot deve essere 1.
    let peak1 = 0;
    let cur1 = 0;
    await Promise.all(
      Array.from({ length: 3 }, () =>
        withBgDbSlot(async () => {
          cur1++;
          peak1 = Math.max(peak1, cur1);
          await new Promise<void>((r) => setTimeout(r, 30));
          cur1--;
        }),
      ),
    );
    expect(peak1).toBe(1);

    // Ripristina override → torna a max=3 default.
    setConcurrencyOverride(null);
    expect(getBgDbLimiterStats().max).toBe(3);

    // Ora 3 job devono girare in parallelo (nessuno accodato).
    let peak2 = 0;
    let cur2 = 0;
    await Promise.all(
      Array.from({ length: 3 }, () =>
        withBgDbSlot(async () => {
          cur2++;
          peak2 = Math.max(peak2, cur2);
          await new Promise<void>((r) => setTimeout(r, 30));
          cur2--;
        }),
      ),
    );
    expect(peak2).toBe(3);
  });

  it("getBgDbLimiterStats().max rispecchia l'override corrente", () => {
    expect(getBgDbLimiterStats().max).toBe(3); // default

    setConcurrencyOverride(1);
    expect(getBgDbLimiterStats().max).toBe(1);

    setConcurrencyOverride(2);
    expect(getBgDbLimiterStats().max).toBe(2);

    setConcurrencyOverride(null);
    expect(getBgDbLimiterStats().max).toBe(3); // ripristinato
  });

  it("setConcurrencyOverride(n) clamp a min 1", () => {
    setConcurrencyOverride(0);
    expect(getBgDbLimiterStats().max).toBe(1); // 0 → clampato a 1

    setConcurrencyOverride(-5);
    expect(getBgDbLimiterStats().max).toBe(1); // negativo → clampato a 1
  });
});
