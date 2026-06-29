// Task #5197 — Test del roster AI (handoff Bowie → Horus / Bowie → Ares).
import { describe, it, expect } from "vitest";
import {
  AI_ROSTER,
  renderRosterBlock,
  classifyRoutingIntent,
  parseAresInvocation,
} from "../ai/assistant/roster";

describe("AI roster", () => {
  it("contiene le tre persone con i ruoli attesi", () => {
    expect(AI_ROSTER.bowie.name).toBe("Bowie");
    expect(AI_ROSTER.horus.name).toBe("Horus");
    expect(AI_ROSTER.ares.name).toBe("Ares");
    expect(AI_ROSTER.bowie.adminOnly).toBe(false);
    expect(AI_ROSTER.horus.adminOnly).toBe(false);
    expect(AI_ROSTER.ares.adminOnly).toBe(true);
  });

  it("renderRosterBlock cita le ALTRE AI, non se stessa", () => {
    const block = renderRosterBlock("bowie");
    expect(block).toContain("Horus");
    expect(block).toContain("Ares");
    expect(block).not.toMatch(/-\s*Bowie:/); // Bowie non si elenca da solo
    expect(block).toContain("solo amministratori"); // Ares marcato admin-only
  });
});

describe("classifyRoutingIntent (Bowie → Horus)", () => {
  it("riconosce richieste di percorso/itinerario", () => {
    expect(classifyRoutingIntent("Mi pianifichi un giro panoramico in moto?")).toBe(true);
    expect(classifyRoutingIntent("Consigliami delle strade curve qui vicino")).toBe(true);
    expect(classifyRoutingIntent("Vorrei un itinerario per il weekend")).toBe(true);
    expect(classifyRoutingIntent("Come arrivo al passo dello Stelvio?")).toBe(true);
  });

  it("NON dirotta domande generiche o statistiche", () => {
    expect(classifyRoutingIntent("Ciao, come stai?")).toBe(false);
    expect(classifyRoutingIntent("Quante strade ho percorso questo mese?")).toBe(false);
    expect(classifyRoutingIntent("Quanti km ho fatto finora?")).toBe(false);
    expect(classifyRoutingIntent("Come funziona l'app?")).toBe(false);
    expect(classifyRoutingIntent("")).toBe(false);
  });
});

describe("parseAresInvocation (Bowie → Ares)", () => {
  it("riconosce l'invocazione esplicita di Ares", () => {
    expect(parseAresInvocation("Chiama Ares")).toBe(true);
    expect(parseAresInvocation("passami Ares per la diagnostica")).toBe(true);
    expect(parseAresInvocation("voglio parlare con Ares")).toBe(true);
    expect(parseAresInvocation("Ares fammi una diagnosi tecnica")).toBe(true);
  });

  it("NON scatta su menzioni casuali o testo senza Ares", () => {
    expect(parseAresInvocation("Ho fatto un giro a Marettimo")).toBe(false);
    expect(parseAresInvocation("Che tempo fa oggi?")).toBe(false);
    expect(parseAresInvocation("")).toBe(false);
  });
});
