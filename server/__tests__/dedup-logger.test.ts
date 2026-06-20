import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { dedupWarn } from "../lib/dedup-logger";

describe("dedupWarn", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    warnSpy.mockRestore();
  });

  it("logga subito la prima occorrenza con chiave e dettaglio", () => {
    dedupWarn("test/first", "ping fallito", new Error("ECONNRESET"), 1000);

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const line = warnSpy.mock.calls[0][0] as string;
    expect(line).toContain("[test/first]");
    expect(line).toContain("ping fallito: ECONNRESET");
  });

  it("sopprime le occorrenze nella finestra e poi emette il riassunto", () => {
    dedupWarn("test/window", "ping fallito", "primo", 1000); // logga
    dedupWarn("test/window", "ping fallito", "secondo", 1000); // soppresso
    dedupWarn("test/window", "ping fallito", "ultimo", 1000); // soppresso

    expect(warnSpy).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1000); // flush della finestra

    expect(warnSpy).toHaveBeenCalledTimes(2);
    const summary = warnSpy.mock.calls[1][0] as string;
    expect(summary).toContain("[test/window]");
    expect(summary).toContain("+2 altri errori simili");
    expect(summary).toContain("ultimo"); // riporta l'ultimo messaggio
  });

  it("non emette alcun riassunto se non c'è stata soppressione", () => {
    dedupWarn("test/single", "evento isolato", undefined, 1000);
    expect(warnSpy).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1000);
    expect(warnSpy).toHaveBeenCalledTimes(1); // nessun riassunto
  });

  it("riapre la finestra dopo il flush (nuova prima occorrenza)", () => {
    dedupWarn("test/reopen", "evt", "a", 1000); // logga
    dedupWarn("test/reopen", "evt", "b", 1000); // soppresso
    vi.advanceTimersByTime(1000); // flush + riassunto → 2 log

    dedupWarn("test/reopen", "evt", "c", 1000); // nuova finestra → logga
    expect(warnSpy).toHaveBeenCalledTimes(3);
    expect(warnSpy.mock.calls[2][0] as string).toContain("evt: c");
  });
});
