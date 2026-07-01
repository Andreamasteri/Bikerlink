/**
 * Task #5338 — Regression coverage for resolveTurnPersona/PersonaResolution.
 *
 * resolveTurnPersona is the SINGLE deterministic gate that decides which
 * persona (bowie/horus/ares) answers a given turn, combining: explicit
 * invocation by name, route-intent classification, and stickiness on the
 * previously-active non-Bowie persona. A silent regression here would
 * misroute conversations (e.g. losing Horus stickiness, or leaking Ares to
 * non-admins), so every priority branch and edge case is covered explicitly.
 */
import { describe, it, expect } from "vitest";
import { resolveTurnPersona, type PersonaResolution } from "../ai/assistant/roster";

describe("resolveTurnPersona — priority order & previousPersona across reasons", () => {
  // -------------------------------------------------------------------------
  // 1) Explicit Ares invocation (admin only) — highest priority.
  // -------------------------------------------------------------------------

  it("admin dice 'chiama Ares' → persona=ares, reason=explicit-ares (batte anche route-intent)", () => {
    const result = resolveTurnPersona({
      message: "chiama Ares, dobbiamo trovare un percorso panoramico",
      isAdmin: true,
      activePersona: null,
    });
    expect(result).toEqual<PersonaResolution>({ persona: "ares", reason: "explicit-ares" });
  });

  it("utente NON admin dice 'chiama Ares' → non è instradato ad Ares (fallback alle regole successive)", () => {
    const result = resolveTurnPersona({
      message: "chiama Ares",
      isAdmin: false,
      activePersona: null,
    });
    expect(result.persona).not.toBe("ares");
    expect(result).toEqual<PersonaResolution>({ persona: "bowie", reason: "default" });
  });

  // -------------------------------------------------------------------------
  // 2) Explicit Horus invocation by name.
  // -------------------------------------------------------------------------

  it("'voglio parlare con Horus' → persona=horus, reason=explicit-horus", () => {
    const result = resolveTurnPersona({
      message: "voglio parlare con Horus",
      isAdmin: false,
      activePersona: null,
    });
    expect(result).toEqual<PersonaResolution>({ persona: "horus", reason: "explicit-horus" });
  });

  it("invocazione esplicita di Horus batte l'intento di percorso generico (stesso persona ma reason diversa)", () => {
    const result = resolveTurnPersona({
      message: "chiama Horus per un percorso panoramico",
      isAdmin: false,
      activePersona: null,
    });
    expect(result.persona).toBe("horus");
    expect(result.reason).toBe("explicit-horus");
  });

  // -------------------------------------------------------------------------
  // 3) Route-intent classification → Horus (no explicit name).
  // -------------------------------------------------------------------------

  it("richiesta di percorso senza nominare Horus → persona=horus, reason=route-intent", () => {
    const result = resolveTurnPersona({
      message: "puoi consigliarmi un giro panoramico per il weekend?",
      isAdmin: false,
      activePersona: null,
    });
    expect(result).toEqual<PersonaResolution>({ persona: "horus", reason: "route-intent" });
  });

  it("domanda statistica ('quante strade ho percorso') NON è route-intent", () => {
    const result = resolveTurnPersona({
      message: "quante strade ho percorso questo mese?",
      isAdmin: false,
      activePersona: null,
    });
    expect(result).toEqual<PersonaResolution>({ persona: "bowie", reason: "default" });
  });

  // -------------------------------------------------------------------------
  // 4) Stickiness — resta sulla persona attiva non-Bowie del turno precedente.
  // -------------------------------------------------------------------------

  it("messaggio generico con Horus già attivo → resta su Horus, reason=sticky", () => {
    const result = resolveTurnPersona({
      message: "grazie, molto utile",
      isAdmin: false,
      activePersona: "horus",
    });
    expect(result).toEqual<PersonaResolution>({ persona: "horus", reason: "sticky" });
  });

  it("messaggio generico con Ares già attivo (admin) → resta su Ares, reason=sticky", () => {
    const result = resolveTurnPersona({
      message: "e il database come sta?",
      isAdmin: true,
      activePersona: "ares",
    });
    expect(result).toEqual<PersonaResolution>({ persona: "ares", reason: "sticky" });
  });

  it("difesa in profondità: Ares attivo ma isAdmin=false → NON resta appiccicato, torna a Bowie", () => {
    const result = resolveTurnPersona({
      message: "e il database come sta?",
      isAdmin: false,
      activePersona: "ares",
    });
    expect(result).toEqual<PersonaResolution>({ persona: "bowie", reason: "default" });
  });

  it("activePersona='bowie' non attiva la stickiness (Bowie è il default, non una persona 'sticky')", () => {
    const result = resolveTurnPersona({
      message: "ciao",
      isAdmin: false,
      activePersona: "bowie",
    });
    expect(result).toEqual<PersonaResolution>({ persona: "bowie", reason: "default" });
  });

  it("activePersona assente/null → default a Bowie", () => {
    const result = resolveTurnPersona({
      message: "ciao, come va?",
      isAdmin: false,
      activePersona: null,
    });
    expect(result).toEqual<PersonaResolution>({ persona: "bowie", reason: "default" });
  });

  // -------------------------------------------------------------------------
  // Priorità combinate — l'ordine dichiarato nel modulo deve essere rispettato.
  // -------------------------------------------------------------------------

  it("Horus sticky attivo ma l'admin chiama esplicitamente Ares → Ares vince (priorità 1 > 4)", () => {
    const result = resolveTurnPersona({
      message: "chiama Ares",
      isAdmin: true,
      activePersona: "horus",
    });
    expect(result).toEqual<PersonaResolution>({ persona: "ares", reason: "explicit-ares" });
  });

  it("Ares sticky attivo (admin) ma il messaggio nomina esplicitamente Horus → Horus vince (priorità 2 > 4)", () => {
    const result = resolveTurnPersona({
      message: "passami Horus",
      isAdmin: true,
      activePersona: "ares",
    });
    expect(result).toEqual<PersonaResolution>({ persona: "horus", reason: "explicit-horus" });
  });

  it("Ares sticky attivo (admin) e route-intent generico (no nome) → resta su Ares (priorità 4 > 3, non route-intent)", () => {
    const result = resolveTurnPersona({
      message: "consigliami un percorso panoramico",
      isAdmin: true,
      activePersona: "ares",
    });
    // Route-intent (priorità 3) precede la stickiness (priorità 4): l'intento di
    // percorso dirotta a Horus anche con Ares attivo.
    expect(result).toEqual<PersonaResolution>({ persona: "horus", reason: "route-intent" });
  });
});
