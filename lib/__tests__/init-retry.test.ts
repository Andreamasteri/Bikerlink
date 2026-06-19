/**
 * Task #4458 — Regressione di apiRequestWithInitRetry (lib/query-client.ts).
 *
 * Durante la finestra di init di una nuova istanza autoscale il gate /api/*
 * risponde 503 con Retry-After. Il login (auth-context) usa
 * apiRequestWithInitRetry, che deve:
 *   • ritentare in modo trasparente sui ServerBusyError (503 transitorio),
 *     rispettando il Retry-After, finché l'handler risponde 200;
 *   • propagare immediatamente gli altri errori SENZA ritentare — in
 *     particolare AiKeyMissingError (un 503 "chiave AI mancante" non è
 *     transitorio) e un 503 oltre il limite di tentativi.
 *
 * Senza questo retry l'utente vedrebbe "Server occupato" al primo 503; senza
 * la distinzione degli errori, un AiKeyMissingError verrebbe ritentato a vuoto.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn().mockResolvedValue(null),
    setItem: vi.fn().mockResolvedValue(undefined),
    removeItem: vi.fn().mockResolvedValue(undefined),
  },
}));

import { apiRequestWithInitRetry, ServerBusyError } from "@/lib/query-client";
import { AiKeyMissingError } from "@/lib/ai-errors";

type FakeResInit = {
  status: number;
  body?: unknown;
  contentType?: string;
  retryAfter?: string;
};

function fakeResponse({ status, body, contentType = "application/json", retryAfter }: FakeResInit): Response {
  const headers = new Map<string, string>();
  headers.set("content-type", contentType);
  if (retryAfter !== undefined) headers.set("retry-after", retryAfter);
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k: string) => headers.get(k.toLowerCase()) ?? null },
    text: () => Promise.resolve(text),
    json: () => Promise.resolve(typeof body === "string" ? JSON.parse(body) : body),
  } as unknown as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("apiRequestWithInitRetry", () => {
  it("ritenta sui ServerBusyError (503) rispettando il Retry-After e poi risolve sul 200", async () => {
    fetchMock
      .mockResolvedValueOnce(fakeResponse({ status: 503, retryAfter: "1", body: { status: "initializing" } }))
      .mockResolvedValueOnce(fakeResponse({ status: 503, retryAfter: "1", body: { status: "initializing" } }))
      .mockResolvedValueOnce(fakeResponse({ status: 200, body: { ok: true } }));

    const promise = apiRequestWithInitRetry("POST", "/api/auth/login", { email: "a@b.it" });
    // Esegue i due wait (Retry-After=1s ciascuno) + i microtask dei retry.
    await vi.advanceTimersByTimeAsync(3000);

    const res = await promise;
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("propaga AiKeyMissingError SENZA ritentare (503 chiave AI mancante non è transitorio)", async () => {
    fetchMock.mockResolvedValue(
      fakeResponse({ status: 503, body: { message: "AI_PROVIDER_UNAVAILABLE: nessun provider AI" } }),
    );

    const promise = apiRequestWithInitRetry("POST", "/api/ai/chat", { q: "ciao" });
    await expect(promise).rejects.toBeInstanceOf(AiKeyMissingError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("dopo aver esaurito i tentativi propaga il ServerBusyError", async () => {
    fetchMock.mockResolvedValue(fakeResponse({ status: 503, retryAfter: "1", body: { status: "initializing" } }));

    const promise = apiRequestWithInitRetry("GET", "/api/auth/me", undefined, { maxRetries: 2 });
    const expectation = expect(promise).rejects.toBeInstanceOf(ServerBusyError);
    // 2 retry da 1s + i microtask intermedi.
    await vi.advanceTimersByTimeAsync(5000);
    await expectation;
    // 1 tentativo iniziale + 2 retry = 3 fetch.
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("non ritenta su errori non-503 (es. 400) e propaga subito", async () => {
    fetchMock.mockResolvedValue(fakeResponse({ status: 400, body: { message: "Credenziali errate" } }));

    const promise = apiRequestWithInitRetry("POST", "/api/auth/login", { email: "x" });
    await expect(promise).rejects.toThrow("Credenziali errate");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
