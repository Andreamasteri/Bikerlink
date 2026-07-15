// Task #130 — I turni AI VISIBILI (chat 1:1 + tavola rotonda di gruppo) devono
// rispondere nella lingua dell'utente. Questi test verificano che i builder di
// system prompt producano l'istruzione di risposta nella lingua richiesta e che
// ricadano sull'italiano (comportamento storico) quando la lingua è assente.
import { describe, it, expect, vi } from "vitest";

// group-conversation importa l'SDK "ai" e i client Ollama/Quebracho a livello di
// modulo: mockarli così l'import (per la funzione PURA buildGroupSystemPrompt)
// non tira su SDK o rete. buildGroupSystemPrompt non li usa.
vi.mock("ai", () => ({ streamText: vi.fn() }));
vi.mock("../lib/ollama-client", () => ({ getOllamaModel: vi.fn() }));
vi.mock("../lib/quebracho-client", () => ({
  streamQuebrachoChat: vi.fn(),
  getQuebrachoModelId: vi.fn(),
}));

import {
  buildSystemPrompt,
  buildAdminSystemPrompt,
  buildHorusSystemPrompt,
  buildAresSystemPrompt,
  buildQuebrachoSystemPrompt,
} from "../ai/assistant/knowledge";
import { buildGroupSystemPrompt } from "../ai/assistant/group-conversation";

describe("Task #130 — chat 1:1: la lingua dell'utente raggiunge il system prompt", () => {
  it("Bowie: language='en' → istruzione di risposta in English", () => {
    const p = buildSystemPrompt({ platform: "android", allowedActions: [], language: "en" });
    expect(p).toContain("English");
    expect(p).not.toContain("SEMPRE in Italiano");
  });

  it("Bowie: senza language → default italiano (nessuna regressione)", () => {
    const p = buildSystemPrompt({ platform: "android", allowedActions: [] });
    expect(p).toContain("Italiano");
  });

  it("Horus: language='de' → istruzione di risposta in Deutsch", () => {
    const p = buildHorusSystemPrompt({ platform: "android", language: "de" });
    expect(p).toContain("Deutsch");
  });

  it("Admin (Bowie): language='fr' → istruzione di risposta in Français", () => {
    expect(buildAdminSystemPrompt("ctx", undefined, "fr")).toContain("Français");
  });

  it("Ares: language='es' → istruzione di risposta in Español", () => {
    expect(buildAresSystemPrompt("ctx", undefined, "es")).toContain("Español");
  });

  it("Quebracho: language='en' → istruzione di risposta in English", () => {
    expect(buildQuebrachoSystemPrompt("ctx", "en")).toContain("English");
  });
});

describe("Task #130 — chat di gruppo: tutti i turni visibili nella lingua dell'utente", () => {
  const participants = ["bowie", "horus", "quebracho"] as const;

  it("Bowie in gruppo: language='en' → risposta ESCLUSIVAMENTE in English (anche tra agenti)", () => {
    const p = buildGroupSystemPrompt("bowie", participants, "en");
    expect(p).toContain("English");
    expect(p).toContain("agli altri agenti");
    expect(p).not.toContain("in italiano");
  });

  it("Horus in gruppo: language='tr' → risposta in Türkçe", () => {
    expect(buildGroupSystemPrompt("horus", participants, "tr")).toContain("Türkçe");
  });

  it("Gruppo: language='it' → resta italiano (nessuna regressione)", () => {
    expect(buildGroupSystemPrompt("bowie", participants, "it")).toContain("Italiano");
  });
});
