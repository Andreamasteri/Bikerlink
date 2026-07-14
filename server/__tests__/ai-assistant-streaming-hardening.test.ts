import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Task #11 — Hardening backend AI Assistant (b) streaming.
//
// Copre le tre parti del task:
//   1. Reply cache (retry idempotente dopo un drop di rete post-generazione).
//   2. Heartbeat SSE (non deve mai lanciare su una connessione già chiusa).
//   3. Timeout + cap dimensione per singola esecuzione di tool.

// ---------------------------------------------------------------------------
// #1 — Reply cache
// ---------------------------------------------------------------------------

describe("Task #11 (#1) — reply-cache", () => {
  beforeEach(async () => {
    const mod = await import("../ai/assistant/reply-cache");
    mod.__clearReplyCacheForTests();
  });

  it("stessa chiave per input identici, chiave diversa se cambia il messaggio", async () => {
    const { computeReplyCacheKey } = await import("../ai/assistant/reply-cache");
    const base = { userId: "u1", mode: "android:bowie", message: "ciao", history: [] };
    expect(computeReplyCacheKey(base)).toBe(computeReplyCacheKey({ ...base }));
    expect(computeReplyCacheKey(base)).not.toBe(
      computeReplyCacheKey({ ...base, message: "ciao!" }),
    );
    expect(computeReplyCacheKey(base)).not.toBe(
      computeReplyCacheKey({ ...base, userId: "u2" }),
    );
  });

  it("un turno salvato viene ritrovato identico da un retry", async () => {
    const { computeReplyCacheKey, getCachedReply, setCachedReply } = await import(
      "../ai/assistant/reply-cache"
    );
    const key = computeReplyCacheKey({ userId: "u1", mode: "android:bowie", message: "ciao", history: [] });
    expect(getCachedReply(key)).toBeNull();

    const events = [
      { event: "persona", data: "bowie" },
      { event: "done", data: { text: "Ciao!" } },
    ];
    setCachedReply(key, events);
    expect(getCachedReply(key)).toEqual(events);
  });

  it("una entry vuota non viene mai salvata (nulla da rispedire)", async () => {
    const { computeReplyCacheKey, getCachedReply, setCachedReply } = await import(
      "../ai/assistant/reply-cache"
    );
    const key = computeReplyCacheKey({ userId: "u1", mode: "android:bowie", message: "x", history: [] });
    setCachedReply(key, []);
    expect(getCachedReply(key)).toBeNull();
  });

  it("scade dopo il TTL", async () => {
    vi.useFakeTimers();
    try {
      const { computeReplyCacheKey, getCachedReply, setCachedReply, REPLY_CACHE_TTL_MS } = await import(
        "../ai/assistant/reply-cache"
      );
      const key = computeReplyCacheKey({ userId: "u1", mode: "android:bowie", message: "x", history: [] });
      setCachedReply(key, [{ event: "done", data: {} }]);
      expect(getCachedReply(key)).not.toBeNull();
      vi.advanceTimersByTime(REPLY_CACHE_TTL_MS + 1);
      expect(getCachedReply(key)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

// ---------------------------------------------------------------------------
// #2 — Heartbeat SSE
// ---------------------------------------------------------------------------

describe("Task #11 (#2) — sse-heartbeat", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("scrive un ping quando la connessione è scrivibile", async () => {
    const { writeSseHeartbeat } = await import("../ai/assistant/sse-heartbeat");
    const write = vi.fn();
    const res = { writableEnded: false, destroyed: false, write } as unknown as import("express").Response;
    writeSseHeartbeat(res);
    expect(write).toHaveBeenCalledWith(": ping\n\n");
  });

  it("NON scrive (e non lancia) su una connessione già chiusa", async () => {
    const { writeSseHeartbeat } = await import("../ai/assistant/sse-heartbeat");
    const write = vi.fn();
    const res = { writableEnded: true, destroyed: false, write } as unknown as import("express").Response;
    expect(() => writeSseHeartbeat(res)).not.toThrow();
    expect(write).not.toHaveBeenCalled();
  });

  it("un write che lancia non si propaga (niente uncaughtException dal timer)", async () => {
    const { writeSseHeartbeat } = await import("../ai/assistant/sse-heartbeat");
    const write = vi.fn(() => {
      throw new Error("socket hang up");
    });
    const res = { writableEnded: false, destroyed: false, write } as unknown as import("express").Response;
    expect(() => writeSseHeartbeat(res)).not.toThrow();
  });

  it("startSseHeartbeat schedula ping periodici e stop() li ferma", async () => {
    vi.useFakeTimers();
    const { startSseHeartbeat } = await import("../ai/assistant/sse-heartbeat");
    const write = vi.fn();
    const res = { writableEnded: false, destroyed: false, write } as unknown as import("express").Response;
    const stop = startSseHeartbeat(res, 1000);
    vi.advanceTimersByTime(3500);
    expect(write).toHaveBeenCalledTimes(3);
    stop();
    vi.advanceTimersByTime(5000);
    expect(write).toHaveBeenCalledTimes(3);
  });
});

// ---------------------------------------------------------------------------
// #3 — Timeout + cap risultato per tool
// ---------------------------------------------------------------------------
//
// tools.ts importa `../../db` (pool Postgres reale a livello di modulo) e
// drizzle-orm: mockati qui secondo la stessa convenzione degli altri test che
// toccano l'agent (vedi drizzle-sql-mock-agent-import in memoria — `sql` va
// sempre ri-esportato dal mock di drizzle-orm).

// Task #41 — recordToolEvent() fa db.insert(aiToolEvents).values(...).onConflictDoUpdate(...);
// il mock deve restituire una catena chainable che risolve (fire-and-forget, best-effort).
vi.mock("../db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        onConflictDoUpdate: vi.fn(() => Promise.resolve()),
      })),
    })),
  },
}));
vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  gte: vi.fn(),
  desc: vi.fn(),
  sql: Object.assign(vi.fn(), { raw: vi.fn() }),
}));
vi.mock("../lib/cf-access", () => ({ cfAccessHeaders: () => ({}) }));
vi.mock("@shared/db", () => ({ routes: {}, events: {}, plannedRoutes: {}, aiToolEvents: {} }));
vi.mock("./web-search", () => ({ webSearch: vi.fn() }));

describe("Task #11 (#3) — guardTool: timeout uniforme + cap risultato", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("un tool che impiega più del timeout ritorna {error} invece di restare appeso", async () => {
    vi.useFakeTimers();
    try {
      const { OLLAMA_TOOLS, TOOL_EXECUTION_TIMEOUT_MS } = await import("../ai/assistant/tools");
      const originalFetch = global.fetch;
      global.fetch = vi.fn(
        () => new Promise(() => {}), // non risolve mai
      ) as unknown as typeof fetch;
      try {
        const promise = (OLLAMA_TOOLS.getWeather.execute as (i: unknown, o: unknown) => Promise<unknown>)(
          { lat: 45, lon: 9 },
          {},
        );
        vi.advanceTimersByTime(TOOL_EXECUTION_TIMEOUT_MS + 10);
        const result = await promise;
        expect(result).toHaveProperty("error");
      } finally {
        global.fetch = originalFetch;
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it("un risultato oltre MAX_TOOL_RESULT_CHARS viene troncato con nota esplicita", async () => {
    const { OLLAMA_TOOLS, MAX_TOOL_RESULT_CHARS } = await import("../ai/assistant/tools");
    const { db } = await import("../db");
    // La tool comprime i waypoint (solo conteggio + primo/ultimo): per superare
    // il cap serve gonfiare un campo che viene restituito per intero, come la
    // descrizione del percorso.
    const chain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([
        {
          id: "r1",
          title: "Giro lungo",
          description: "x".repeat(6000),
          style: "curvy",
          distanceKm: 120,
          durationMinutes: 90,
          waypoints: [{ lat: 1, lon: 1 }, { lat: 2, lon: 2 }],
          visibility: "private",
          createdAt: new Date("2026-01-01"),
        },
      ]),
    };
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue(chain);

    const result = (await (OLLAMA_TOOLS.getUserPlannedRoutes.execute as (i: unknown, o: unknown) => Promise<unknown>)(
      { userId: "u1", limit: 5 },
      {},
    )) as { truncated?: boolean; note?: string };

    expect(result.truncated).toBe(true);
    expect(typeof result.note).toBe("string");
    expect(JSON.stringify(result).length).toBeLessThan(MAX_TOOL_RESULT_CHARS + 500);
  });

  it("un risultato piccolo passa invariato (nessun truncated)", async () => {
    const { OLLAMA_TOOLS } = await import("../ai/assistant/tools");
    const { db } = await import("../db");
    const chain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([
        { totalRoutes: 3, totalKm: 42.5, avgKm: 14.1, lastRouteAt: "2026-07-01" },
      ]),
    };
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue(chain);

    const result = (await (OLLAMA_TOOLS.getBikerStats.execute as (i: unknown, o: unknown) => Promise<unknown>)(
      { userId: "u1" },
      {},
    )) as { truncated?: boolean; totalRoutes?: number };

    expect(result.truncated).toBeUndefined();
    expect(result.totalRoutes).toBe(3);
  });
});
