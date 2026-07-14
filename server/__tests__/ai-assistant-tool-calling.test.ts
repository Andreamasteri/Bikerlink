import { describe, it, expect } from "vitest";
import {
  tryParseTextualToolCall,
  detectMissingToolSentinel,
  buildMissingToolInstruction,
  selectToolNamesForMessage,
  createOllamaOutputGate,
  MISSING_TOOL_SENTINEL_PREFIX,
} from "../ai/assistant/tool-calling";

// Set completo dei tool Bowie (fonte di verità per gli helper puri).
const BOWIE_TOOLS = [
  "getWeather",
  "getBikerStats",
  "getThinkCentreStatus",
  "getNearbyEvents",
  "getUserPlannedRoutes",
  "webSearch",
];

// ---------------------------------------------------------------------------
// #1 — Fallback tool-call testuale
// ---------------------------------------------------------------------------

describe("Task #7 (#1) — tryParseTextualToolCall", () => {
  it("prosa normale → null", () => {
    expect(tryParseTextualToolCall("Ciao! Come posso aiutarti oggi?", BOWIE_TOOLS)).toBeNull();
  });

  it("blob JSON con chiave 'parameters' per un tool disponibile → tool call", () => {
    const raw = '{"name": "getWeather", "parameters": {"lat": 45.4, "lon": 9.2}}';
    expect(tryParseTextualToolCall(raw, BOWIE_TOOLS)).toEqual({
      name: "getWeather",
      arguments: { lat: 45.4, lon: 9.2 },
    });
  });

  it("blob JSON con chiave 'arguments' → tool call", () => {
    const raw = '{"name": "getBikerStats", "arguments": {"userId": "u1"}}';
    expect(tryParseTextualToolCall(raw, BOWIE_TOOLS)).toEqual({
      name: "getBikerStats",
      arguments: { userId: "u1" },
    });
  });

  it("estrae il blob anche se circondato da testo", () => {
    const raw = 'Certo, chiamo lo strumento: {"name": "getWeather", "arguments": {}} ecco fatto.';
    expect(tryParseTextualToolCall(raw, BOWIE_TOOLS)).toEqual({ name: "getWeather", arguments: {} });
  });

  it("tool NON disponibile in questo turno → null (mai eseguire ciò che non è allegato)", () => {
    const raw = '{"name": "deleteEverything", "parameters": {}}';
    expect(tryParseTextualToolCall(raw, BOWIE_TOOLS)).toBeNull();
  });

  it("JSON malformato → null", () => {
    expect(tryParseTextualToolCall('{"name": "getWeather", ', BOWIE_TOOLS)).toBeNull();
  });

  it("argomenti non-oggetto → null", () => {
    expect(tryParseTextualToolCall('{"name": "getWeather", "arguments": "nope"}', BOWIE_TOOLS)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// #2 — Sentinel "tool mancante"
// ---------------------------------------------------------------------------

describe("Task #7 (#2) — detectMissingToolSentinel", () => {
  it("riconosce il sentinel e restituisce il nome del tool", () => {
    expect(detectMissingToolSentinel("[TOOL_MANCANTE: getBikerStats]")).toBe("getBikerStats");
  });

  it("tollera spazi e whitespace iniziale", () => {
    expect(detectMissingToolSentinel("  [TOOL_MANCANTE:getWeather ]")).toBe("getWeather");
  });

  it("testo che inizia con '[' ma non è il sentinel → null", () => {
    expect(detectMissingToolSentinel("[nota] questo è solo un promemoria")).toBeNull();
  });

  it("prosa normale → null", () => {
    expect(detectMissingToolSentinel("Ecco le tue statistiche di guida.")).toBeNull();
  });

  it("buildMissingToolInstruction elenca il prefisso e i tool disponibili", () => {
    const instr = buildMissingToolInstruction(BOWIE_TOOLS);
    expect(instr).toContain(MISSING_TOOL_SENTINEL_PREFIX);
    expect(instr).toContain("getBikerStats");
    expect(instr).toContain("webSearch");
  });
});

// ---------------------------------------------------------------------------
// #3 — Selezione contestuale + gating per capacità
// ---------------------------------------------------------------------------

describe("Task #7 (#3) — selectToolNamesForMessage", () => {
  const caps = { webSearchAvailable: true, hasUserId: true };

  it("messaggio conversazionale → nessun tool", () => {
    expect(selectToolNamesForMessage(BOWIE_TOOLS, "Ciao, come stai oggi?", caps)).toEqual([]);
  });

  it("domanda meteo → solo getWeather", () => {
    expect(selectToolNamesForMessage(BOWIE_TOOLS, "Che tempo fa a Milano domani?", caps)).toEqual([
      "getWeather",
    ]);
  });

  it("storia di guida → getBikerStats + getUserPlannedRoutes", () => {
    const sel = selectToolNamesForMessage(BOWIE_TOOLS, "Quante strade ho percorso quest'anno?", caps);
    expect(sel).toContain("getBikerStats");
    expect(sel).toContain("getUserPlannedRoutes");
  });

  it("percorsi salvati → include getUserPlannedRoutes", () => {
    const sel = selectToolNamesForMessage(BOWIE_TOOLS, "Mostrami i miei percorsi salvati", caps);
    expect(sel).toContain("getUserPlannedRoutes");
  });

  it("tool user-scoped saltati senza userId", () => {
    const sel = selectToolNamesForMessage(BOWIE_TOOLS, "Quante strade ho percorso?", {
      webSearchAvailable: true,
      hasUserId: false,
    });
    expect(sel).not.toContain("getBikerStats");
    expect(sel).not.toContain("getUserPlannedRoutes");
  });

  it("ricerca web → webSearch solo se il servizio è configurato", () => {
    const msg = "Cerca online le ultime novità sulle nuove moto 2026";
    expect(selectToolNamesForMessage(BOWIE_TOOLS, msg, caps)).toContain("webSearch");
    expect(
      selectToolNamesForMessage(BOWIE_TOOLS, msg, { webSearchAvailable: false, hasUserId: true }),
    ).not.toContain("webSearch");
  });

  it("stato servizi → getThinkCentreStatus", () => {
    expect(
      selectToolNamesForMessage(BOWIE_TOOLS, "Com'è lo stato del server di casa?", caps),
    ).toEqual(["getThinkCentreStatus"]);
  });

  it("raduni vicini → getNearbyEvents", () => {
    expect(selectToolNamesForMessage(BOWIE_TOOLS, "Ci sono raduni vicino a me?", caps)).toEqual([
      "getNearbyEvents",
    ]);
  });

  it("gating per disponibilità: un tool non nel set della persona non viene selezionato", () => {
    // Set ridotto (es. Horus) senza getBikerStats.
    const HORUS_TOOLS = ["getWeather", "getThinkCentreStatus", "getNearbyEvents", "webSearch"];
    const sel = selectToolNamesForMessage(HORUS_TOOLS, "Quante strade ho percorso?", caps);
    expect(sel).not.toContain("getBikerStats");
    expect(sel).not.toContain("getUserPlannedRoutes");
  });
});

// ---------------------------------------------------------------------------
// #1 / #2 — Gate di streaming dell'output Ollama
// ---------------------------------------------------------------------------

describe("Task #7 (#1/#2) — createOllamaOutputGate", () => {
  function drain(chunks: string[]) {
    const gate = createOllamaOutputGate(BOWIE_TOOLS);
    let emitted = "";
    const emit = (s: string) => {
      emitted += s;
    };
    for (const c of chunks) gate.push(c, emit);
    const result = gate.flush(emit);
    return { emitted, result };
  }

  it("prosa normale (in chunk) → tutto emesso, mode normal", () => {
    const { emitted, result } = drain(["Hai ", "percorso ", "5 strade oggi."]);
    expect(result.mode).toBe("normal");
    expect(emitted).toBe("Hai percorso 5 strade oggi.");
  });

  it("solo sentinel → nulla emesso, mode sentinel", () => {
    const { emitted, result } = drain(["[TOOL_MANCANTE: getBikerStats]"]);
    expect(result.mode).toBe("sentinel");
    expect(result.sentinelTool).toBe("getBikerStats");
    expect(emitted).toBe("");
  });

  it("sentinel spezzato su più chunk → riconosciuto, nulla emesso", () => {
    const { emitted, result } = drain(["[TOOL_MAN", "CANTE: getWeather]"]);
    expect(result.mode).toBe("sentinel");
    expect(result.sentinelTool).toBe("getWeather");
    expect(emitted).toBe("");
  });

  it("tool call testuale → nulla emesso, mode toolcall con args", () => {
    const { emitted, result } = drain(['{"name":"getWeather","arguments":{"lat":45,"lon":9}}']);
    expect(result.mode).toBe("toolcall");
    expect(result.toolCall).toEqual({ name: "getWeather", arguments: { lat: 45, lon: 9 } });
    expect(emitted).toBe("");
  });

  it("tool call testuale spezzata su più chunk → riconosciuta", () => {
    const { emitted, result } = drain(['{"name":"getWea', 'ther","arguments":{}}']);
    expect(result.mode).toBe("toolcall");
    expect(result.toolCall?.name).toBe("getWeather");
    expect(emitted).toBe("");
  });

  it("testo che inizia con '[' ma non è sentinel → emesso normalmente", () => {
    const { emitted, result } = drain(["[nota] promemoria: controlla la pressione gomme."]);
    expect(result.mode).toBe("normal");
    expect(emitted).toBe("[nota] promemoria: controlla la pressione gomme.");
  });
});
