import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Verifica Task #4798: la coda di withBgDbSlot non cresce illimitata quando il
// DB è lento. Due valvole: tetto sulla coda (overflow → reject immediato) e
// timeout d'attesa in coda (job stantio scartato).

async function loadLimiter() {
  vi.resetModules();
  return import("../lib/bg-db-limiter");
}

describe("bg-db-limiter backlog containment", () => {
  beforeEach(() => {
    process.env.BG_DB_MAX_QUEUE = "5";
    process.env.BG_DB_QUEUE_TIMEOUT_MS = "1000";
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.BG_DB_MAX_QUEUE;
    delete process.env.BG_DB_QUEUE_TIMEOUT_MS;
  });

  it("rifiuta i nuovi job oltre il tetto della coda invece di accumularli", async () => {
    const { withBgDbSlot, getBgDbLimiterStats, BgDbQueueOverflowError } = await loadLimiter();

    // 3 slot attivi (max concurrency) tenuti occupati da fn che non si risolvono.
    let releaseHeld!: () => void;
    const heldGate = new Promise<void>((r) => { releaseHeld = r; });
    const held = Array.from({ length: 3 }, () => withBgDbSlot(() => heldGate));

    await Promise.resolve(); // lascia partire gli acquire sincroni

    // 5 job in coda (= tetto). Catturiamo il reject per evitare unhandled.
    const queuedResults: Promise<unknown>[] = [];
    for (let i = 0; i < 5; i++) {
      queuedResults.push(withBgDbSlot(() => Promise.resolve("ok")).catch((e) => e));
    }
    await Promise.resolve();
    expect(getBgDbLimiterStats().queued).toBe(5);

    // Il 6° supera il tetto → reject sincrono con overflow.
    const overflow = await withBgDbSlot(() => Promise.resolve("ok")).catch((e) => e);
    expect(overflow).toBeInstanceOf(BgDbQueueOverflowError);
    expect(getBgDbLimiterStats().droppedOverflowTotal).toBe(1);
    // La coda non è cresciuta oltre il tetto.
    expect(getBgDbLimiterStats().queued).toBe(5);

    // Cleanup: rilascia gli slot e droppa gli errori dei queued.
    releaseHeld();
    await Promise.allSettled(held);
    await Promise.allSettled(queuedResults);
  });

  it("scarta un job che resta in coda oltre il timeout (coalescing dei job stantii)", async () => {
    const { withBgDbSlot, getBgDbLimiterStats, BgDbQueueTimeoutError } = await loadLimiter();

    let releaseHeld!: () => void;
    const heldGate = new Promise<void>((r) => { releaseHeld = r; });
    const held = Array.from({ length: 3 }, () => withBgDbSlot(() => heldGate));
    await Promise.resolve();

    const queuedJob = withBgDbSlot(() => Promise.resolve("never")).catch((e) => e);
    await Promise.resolve();
    expect(getBgDbLimiterStats().queued).toBe(1);

    // Il DB resta lento oltre il timeout → il job in coda viene scartato.
    await vi.advanceTimersByTimeAsync(1100);
    const result = await queuedJob;
    expect(result).toBeInstanceOf(BgDbQueueTimeoutError);
    expect(getBgDbLimiterStats().queued).toBe(0);
    expect(getBgDbLimiterStats().droppedTimeoutTotal).toBe(1);

    releaseHeld();
    await Promise.allSettled(held);
  });
});
