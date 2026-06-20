/**
 * Task #4597 — Regressione di withTimeout (lib/resume-utils.ts).
 *
 * I flussi di resume non-React-Query (permessi via bridge nativo, drain di
 * AsyncStorage, flush di telemetria) possono stallare all'infinito su una
 * chiamata nativa bloccata. `withTimeout` corre la promise contro un timer:
 *   • se la promise risolve prima → risolve con quel valore (timer pulito);
 *   • se la promise rifiuta prima → propaga quell'errore (timer pulito);
 *   • se scade il timer → rifiuta con TimeoutError.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { withTimeout, TimeoutError } from "@/lib/resume-utils";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("withTimeout", () => {
  it("risolve con il valore se la promise completa prima del timeout", async () => {
    const promise = withTimeout(Promise.resolve("ok"), 1000, "load");
    await expect(promise).resolves.toBe("ok");
  });

  it("propaga l'errore originale se la promise rifiuta prima del timeout", async () => {
    const original = new Error("native bridge failed");
    const promise = withTimeout(Promise.reject(original), 1000, "perms");
    await expect(promise).rejects.toBe(original);
  });

  it("rifiuta con TimeoutError quando scade il timer", async () => {
    let resolveLater: (v: string) => void = () => {};
    const never = new Promise<string>((res) => {
      resolveLater = res;
    });
    const promise = withTimeout(never, 500, "flush");
    const expectation = expect(promise).rejects.toBeInstanceOf(TimeoutError);
    await vi.advanceTimersByTimeAsync(500);
    await expectation;
    // La risoluzione tardiva non causa unhandled rejection.
    resolveLater("late");
  });

  it("il messaggio di TimeoutError include label e durata", async () => {
    const promise = withTimeout(new Promise<never>(() => {}), 250, "telemetry");
    const expectation = expect(promise).rejects.toThrow("telemetry timed out after 250ms");
    await vi.advanceTimersByTimeAsync(250);
    await expectation;
  });

  it("non scatta il timeout se la promise risolve appena prima della scadenza", async () => {
    let resolveSoon: (v: number) => void = () => {};
    const p = new Promise<number>((res) => {
      resolveSoon = res;
    });
    const promise = withTimeout(p, 1000, "race");
    await vi.advanceTimersByTimeAsync(999);
    resolveSoon(42);
    await expect(promise).resolves.toBe(42);
    // Avanzare oltre la scadenza non deve produrre alcun rifiuto tardivo.
    await vi.advanceTimersByTimeAsync(2000);
  });
});
