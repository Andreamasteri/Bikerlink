// Task #51 — Test delle funzioni PURE del motore di turn-taking (nessuna rete/DB).
import { describe, it, expect } from "vitest";
import {
  GROUP_PARTICIPANTS,
  DEFAULT_GROUP_MAX_TURNS,
  GROUP_MAX_TURNS_CAP,
  GROUP_MIN_PARTICIPANTS,
  normalizeParticipants,
  clampMaxTurns,
  personaForTurn,
} from "../ai/assistant/group-conversation";

describe("group-conversation — normalizeParticipants", () => {
  it("accetta solo Bowie/Horus/Quebracho preservando l'ordine", () => {
    expect(normalizeParticipants(["horus", "bowie"])).toEqual(["horus", "bowie"]);
  });
  it("scarta agenti non ammessi (es. ares) e duplicati", () => {
    expect(normalizeParticipants(["bowie", "ares", "bowie", "quebracho"]))
      .toEqual(["bowie", "quebracho"]);
  });
  it("ricade sul roster completo se sotto il minimo", () => {
    expect(normalizeParticipants(["ares"])).toEqual([...GROUP_PARTICIPANTS]);
    expect(normalizeParticipants([])).toEqual([...GROUP_PARTICIPANTS]);
    expect(normalizeParticipants(null)).toEqual([...GROUP_PARTICIPANTS]);
  });
});

describe("group-conversation — clampMaxTurns", () => {
  it("usa il default per valori non validi", () => {
    expect(clampMaxTurns(undefined)).toBe(DEFAULT_GROUP_MAX_TURNS);
    expect(clampMaxTurns("abc")).toBe(DEFAULT_GROUP_MAX_TURNS);
    expect(clampMaxTurns(0)).toBe(DEFAULT_GROUP_MAX_TURNS);
  });
  it("clampa nell'intervallo [min, cap]", () => {
    expect(clampMaxTurns(1)).toBe(GROUP_MIN_PARTICIPANTS);
    expect(clampMaxTurns(999)).toBe(GROUP_MAX_TURNS_CAP);
    expect(clampMaxTurns(8)).toBe(8);
  });
});

describe("group-conversation — personaForTurn", () => {
  it("ruota sull'ordine dei partecipanti", () => {
    const p = ["bowie", "horus", "quebracho"] as const;
    expect(personaForTurn(p, 0)).toBe("bowie");
    expect(personaForTurn(p, 1)).toBe("horus");
    expect(personaForTurn(p, 2)).toBe("quebracho");
    expect(personaForTurn(p, 3)).toBe("bowie");
  });
});
