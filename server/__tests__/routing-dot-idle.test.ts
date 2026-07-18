/**
 * Task #571 — routingDot resta verde (ok) quando il routing è abilitato ma idle
 * (zero richieste nella finestra di 5 minuti).
 *
 * Testa `computeRoutingDot` (helper puro esportato da server/routes/admin/routing/index.ts)
 * in isolamento, senza dipendenze di rete o DB.
 *
 * Casi coperti:
 *   1. zero richieste + kill-switch abilitato   → "ok"    (idle ma attivo)
 *   2. zero richieste + kill-switch disabilitato → "offline" (esplicitamente spento)
 *   3. solo successi                             → "ok"    (traffico regolare)
 */
import { describe, it, expect } from "vitest";
import { computeRoutingDot } from "../routes/admin/routing";

describe("computeRoutingDot", () => {
  it("zero richieste + kill-switch abilitato → ok (routing idle ma attivo)", () => {
    const result = computeRoutingDot(true, { successes: 0, fallbacks: 0, failures: 0 });
    expect(result).toBe("ok");
  });

  it("zero richieste + kill-switch disabilitato → offline (esplicitamente spento)", () => {
    const result = computeRoutingDot(false, { successes: 0, fallbacks: 0, failures: 0 });
    expect(result).toBe("offline");
  });

  it("solo successi → ok (traffico regolare senza fallback né errori)", () => {
    const result = computeRoutingDot(true, { successes: 12, fallbacks: 0, failures: 0 });
    expect(result).toBe("ok");
  });

  it("fallback presenti ma zero failure → degraded", () => {
    const result = computeRoutingDot(true, { successes: 5, fallbacks: 3, failures: 0 });
    expect(result).toBe("degraded");
  });

  it("failure presenti → offline (indipendentemente dai successi)", () => {
    const result = computeRoutingDot(true, { successes: 10, fallbacks: 2, failures: 1 });
    expect(result).toBe("offline");
  });
});
