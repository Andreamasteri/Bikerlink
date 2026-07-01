import { describe, it, expect } from "vitest";
import { createWatchState, evaluateSignal, type WatchState } from "../main-app-watch";

// Applica una sequenza di letture allo stato, restituendo la lista dei tick in
// cui shouldTrigger è risultato true e lo stato finale.
function run(values: (string | null)[]): { triggers: boolean[]; state: WatchState } {
  let state = createWatchState();
  const triggers: boolean[] = [];
  for (const v of values) {
    const r = evaluateSignal(state, v);
    state = r.state;
    triggers.push(r.shouldTrigger);
  }
  return { triggers, state };
}

describe("main-app-watch (baseline/ack)", () => {
  it("la prima lettura registra la baseline e non scatta mai (anche non-null)", () => {
    const { triggers, state } = run(["2026-07-01T10:00:00.000Z"]);
    expect(triggers).toEqual([false]);
    expect(state.initialized).toBe(true);
    expect(state.triggered).toBe(false);
    expect(state.baseline).toBe("2026-07-01T10:00:00.000Z");
  });

  it("nessun falso positivo: baseline non-null seguita dallo stesso valore", () => {
    const v = "2026-07-01T10:00:00.000Z";
    const { triggers } = run([v, v, v]);
    expect(triggers).toEqual([false, false, false]);
  });

  it("scatta quando il valore cambia rispetto alla baseline", () => {
    const { triggers, state } = run([
      "2026-07-01T10:00:00.000Z",
      "2026-07-01T10:05:00.000Z",
    ]);
    expect(triggers).toEqual([false, true]);
    expect(state.triggered).toBe(true);
  });

  it("baseline null → primo timestamp reale scatta (app principale aperta dopo il boot)", () => {
    const { triggers } = run([null, "2026-07-01T10:05:00.000Z"]);
    expect(triggers).toEqual([false, true]);
  });

  it("baseline null che resta null non scatta", () => {
    const { triggers } = run([null, null, null]);
    expect(triggers).toEqual([false, false, false]);
  });

  it("è idempotente: scatta una sola volta anche se il valore cambia ancora", () => {
    const { triggers } = run([
      "2026-07-01T10:00:00.000Z",
      "2026-07-01T10:05:00.000Z",
      "2026-07-01T10:10:00.000Z",
    ]);
    expect(triggers).toEqual([false, true, false]);
  });

  it("un valore che torna null dopo la baseline non scatta", () => {
    const { triggers } = run(["2026-07-01T10:00:00.000Z", null]);
    expect(triggers).toEqual([false, false]);
  });
});
