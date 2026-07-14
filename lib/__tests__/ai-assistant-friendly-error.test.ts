// Task #8 — Regressione mapping "errore di rete → messaggio amichevole".
import { describe, it, expect } from "vitest";
import {
  friendlyChatErrorMessage,
  friendlyChatErrorFromEvent,
  CHAT_CONNECTION_INTERRUPTED_MESSAGE,
  CHAT_TIMEOUT_MESSAGE,
  CHAT_SERVER_ERROR_MESSAGE,
  CHAT_GENERIC_ERROR_MESSAGE,
} from "@/lib/ai-assistant/friendly-error";
import { AI_KEY_MISSING_MESSAGE, AiKeyMissingError } from "@/lib/ai-errors";

describe("friendlyChatErrorMessage", () => {
  it("returns an empty string on user abort (so the UI shows nothing)", () => {
    const abort = new Error("aborted");
    (abort as Error & { name: string }).name = "AbortError";
    expect(friendlyChatErrorMessage(abort)).toBe("");
  });

  // Il bug centrale: quando lo stream SSE viene interrotto A METÀ LETTURA dal
  // tunnel, reader.read() rigetta con `TypeError: network error` (Chrome) — che
  // NON contiene "fetch", quindi prima veniva mostrato grezzo all'utente. Tutte
  // le varianti per runtime devono dare il messaggio italiano, mai la stringa
  // grezza inglese.
  it.each([
    ["Chrome mid-stream body interruption", "network error"],
    ["Chrome initial fetch failure", "Failed to fetch"],
    ["Firefox", "NetworkError when attempting to fetch resource."],
    ["Safari", "Load failed"],
    ["React Native expo/fetch", "Network request failed"],
  ])("maps the %s TypeError to the Italian connection message", (_label, message) => {
    const result = friendlyChatErrorMessage(new TypeError(message));
    expect(result).toBe(CHAT_CONNECTION_INTERRUPTED_MESSAGE);
    expect(result).not.toContain("network error");
    expect(result).not.toContain("Load failed");
    expect(result).not.toContain("fetch");
  });

  // Alcuni drop del tunnel a metà stream arrivano come Error generico (NON
  // TypeError): devono comunque essere mappati, non passati grezzi.
  it("maps a non-TypeError mid-stream network-drop Error to the Italian message", () => {
    for (const msg of ["terminated", "other side closed", "fetch failed", "The network connection was lost."]) {
      expect(friendlyChatErrorMessage(new Error(msg))).toBe(CHAT_CONNECTION_INTERRUPTED_MESSAGE);
    }
  });

  it("maps gateway-timeout HTTP statuses to the timeout message", () => {
    for (const status of [408, 504, 524]) {
      expect(friendlyChatErrorMessage(new Error(`HTTP ${status}`))).toBe(CHAT_TIMEOUT_MESSAGE);
    }
  });

  it("maps other 5xx HTTP statuses to the temporary-error message", () => {
    expect(friendlyChatErrorMessage(new Error("HTTP 500"))).toBe(CHAT_SERVER_ERROR_MESSAGE);
  });

  it("maps a missing-AI-provider error to the dedicated banner message", () => {
    expect(friendlyChatErrorMessage(new AiKeyMissingError())).toBe(AI_KEY_MISSING_MESSAGE);
  });

  it("passes through an already-friendly Italian server message unchanged", () => {
    const serverMsg = "Assistente disattivato dalle tue preferenze";
    expect(friendlyChatErrorMessage(new Error(serverMsg))).toBe(serverMsg);
  });

  it("returns a generic connection message for non-Error values", () => {
    expect(friendlyChatErrorMessage("boom")).toBe(CHAT_GENERIC_ERROR_MESSAGE);
    expect(friendlyChatErrorMessage(undefined)).toBe(CHAT_GENERIC_ERROR_MESSAGE);
  });
});

describe("friendlyChatErrorFromEvent (server SSE error event)", () => {
  it("maps a missing-provider 503 to the dedicated banner", () => {
    expect(friendlyChatErrorFromEvent(503, "nessun provider AI configurato")).toBe(AI_KEY_MISSING_MESSAGE);
  });

  it("maps gateway-timeout codes to the timeout message", () => {
    for (const code of [408, 504, 524]) {
      expect(friendlyChatErrorFromEvent(code, "gateway timeout")).toBe(CHAT_TIMEOUT_MESSAGE);
    }
  });

  it("maps generic 5xx codes to the temporary-error message", () => {
    expect(friendlyChatErrorFromEvent(500, "boom")).toBe(CHAT_SERVER_ERROR_MESSAGE);
  });

  it("maps a raw network string in the event message to the connection message", () => {
    expect(friendlyChatErrorFromEvent(0, "terminated")).toBe(CHAT_CONNECTION_INTERRUPTED_MESSAGE);
  });

  it("passes through a friendly server message and falls back when absent", () => {
    expect(friendlyChatErrorFromEvent(400, "Messaggio non valido")).toBe("Messaggio non valido");
    expect(friendlyChatErrorFromEvent(undefined, undefined)).toBe(CHAT_GENERIC_ERROR_MESSAGE);
  });
});
