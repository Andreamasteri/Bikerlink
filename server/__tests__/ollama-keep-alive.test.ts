import { describe, it, expect } from "vitest";
import { normalizeKeepAlive } from "../lib/ollama-client";

// Task #7 (#9) — Formato keep_alive per Ollama.
//
// Ollama accetta keep_alive sia come durata stringa ("30m", "1h") sia come
// numero di secondi. Il valore speciale "non scaricare mai" DEVE essere il
// NUMERO -1: la STRINGA "-1" viene interpretata come 0 secondi (scarica subito),
// l'opposto di ciò che si vuole. Regressione: un intero puro → number, una
// durata → stringa.

describe("Task #7 (#9) — normalizeKeepAlive", () => {
  it('"-1" (non scaricare mai) → numero -1, non stringa', () => {
    const v = normalizeKeepAlive("-1");
    expect(v).toBe(-1);
    expect(typeof v).toBe("number");
  });

  it("intero puro di secondi → number", () => {
    expect(normalizeKeepAlive("300")).toBe(300);
    expect(typeof normalizeKeepAlive("300")).toBe("number");
  });

  it("0 → numero 0 (scarica subito)", () => {
    expect(normalizeKeepAlive("0")).toBe(0);
  });

  it('durata con suffisso ("30m", "1h") → stringa invariata', () => {
    expect(normalizeKeepAlive("30m")).toBe("30m");
    expect(normalizeKeepAlive("1h")).toBe("1h");
    expect(typeof normalizeKeepAlive("30m")).toBe("string");
  });

  it("valore non numerico → stringa invariata", () => {
    expect(normalizeKeepAlive("forever")).toBe("forever");
  });

  it("stringa vuota → stringa vuota (mai number 0 accidentale)", () => {
    expect(normalizeKeepAlive("")).toBe("");
  });

  it('valore decimale ("1.5") → stringa (non intero → durata)', () => {
    // Number("1.5") non è intero → resta stringa (formato durata non valido ma
    // non lo convertiamo in un number frazionario di secondi ambiguo).
    expect(normalizeKeepAlive("1.5")).toBe("1.5");
  });
});
