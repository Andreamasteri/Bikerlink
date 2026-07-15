import { describe, it, expect, vi } from "vitest";

// db.ts richiede DATABASE_URL al momento dell'import (throw altrimenti) e crea un
// pg.Pool. Per testare le funzioni pure (isTransientDbError / withDbRetry) senza
// toccare un DB reale: settiamo DATABASE_URL e mockiamo `pg` con un Pool no-op.
vi.hoisted(() => {
  process.env.DATABASE_URL =
    process.env.DATABASE_URL || "postgres://test:test@localhost:5432/test"; // pragma: allowlist secret
});

vi.mock("pg", () => ({
  default: {
    Pool: class {
      on(): void {}
      // db.ts avvolge pool.connect (tracer dei checkout, Task #5229): il mock
      // deve esporre connect o `pool.connect.bind(pool)` fallisce all'import.
      connect(): void {}
    },
  },
}));

vi.mock("@shared/db", () => ({}));

import {
  isTransientDbError,
  withDbRetry,
  DbTimeoutError,
} from "../db";

describe("isTransientDbError", () => {
  it("classifica i codici di connessione/socket come transitori", () => {
    for (const code of [
      "57P01",
      "57P02",
      "57P03",
      "08000",
      "08001",
      "08003",
      "08004",
      "08006",
      "ECONNRESET",
      "ECONNREFUSED",
      "ETIMEDOUT",
      "EPIPE",
      "ENOTFOUND",
    ]) {
      expect(isTransientDbError({ code })).toBe(true);
    }
  });

  it("riconosce i messaggi di disconnessione/timeout come transitori", () => {
    expect(isTransientDbError(new Error("Connection terminated unexpectedly"))).toBe(true);
    expect(isTransientDbError(new Error("timeout expired"))).toBe(true);
    expect(isTransientDbError(new Error("server closed the connection"))).toBe(true);
    expect(isTransientDbError(new Error("read ECONNRESET"))).toBe(true);
    expect(isTransientDbError(new Error("socket hang up"))).toBe(true);
  });

  it("tratta DbTimeoutError e isDbTimeout come transitori", () => {
    expect(isTransientDbError(new DbTimeoutError(4500))).toBe(true);
    expect(isTransientDbError({ isDbTimeout: true })).toBe(true);
  });

  it("NON tratta gli errori applicativi (constraint/syntax) come transitori", () => {
    expect(isTransientDbError({ code: "23505" })).toBe(false); // unique_violation
    expect(isTransientDbError({ code: "23503" })).toBe(false); // foreign_key_violation
    expect(isTransientDbError({ code: "42601" })).toBe(false); // syntax_error
    expect(isTransientDbError({ code: "42P01" })).toBe(false); // undefined_table
    expect(isTransientDbError(new Error("duplicate key value violates unique constraint"))).toBe(false);
  });

  it("gestisce null/undefined/valori vuoti senza crashare", () => {
    expect(isTransientDbError(null)).toBe(false);
    expect(isTransientDbError(undefined)).toBe(false);
    expect(isTransientDbError("")).toBe(false);
    expect(isTransientDbError({})).toBe(false);
  });
});

describe("withDbRetry", () => {
  it("ritenta SOLO gli errori transitori e poi ritorna il risultato", async () => {
    const fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(Object.assign(new Error("blip"), { code: "08006" }))
      .mockRejectedValueOnce(new Error("connection terminated unexpectedly"))
      .mockResolvedValueOnce("ok");

    const result = await withDbRetry(fn, { baseDelayMs: 0 });

    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("propaga immediatamente un errore NON transitorio senza ritentare", async () => {
    const appErr = Object.assign(new Error("unique violation"), { code: "23505" });
    const fn = vi.fn<() => Promise<never>>().mockRejectedValue(appErr);

    await expect(withDbRetry(fn, { baseDelayMs: 0 })).rejects.toBe(appErr);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("dopo aver esaurito i retry propaga l'ultimo errore transitorio", async () => {
    const last = Object.assign(new Error("still down"), { code: "ECONNREFUSED" });
    const fn = vi
      .fn<() => Promise<never>>()
      .mockRejectedValueOnce(Object.assign(new Error("blip 1"), { code: "08006" }))
      .mockRejectedValueOnce(Object.assign(new Error("blip 2"), { code: "08006" }))
      .mockRejectedValue(last);

    // retries: 2 → max 3 tentativi totali
    await expect(withDbRetry(fn, { retries: 2, baseDelayMs: 0 })).rejects.toBe(last);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("rispetta un numero di retry personalizzato", async () => {
    const fn = vi
      .fn<() => Promise<never>>()
      .mockRejectedValue(Object.assign(new Error("blip"), { code: "ETIMEDOUT" }));

    await expect(withDbRetry(fn, { retries: 4, baseDelayMs: 0 })).rejects.toThrow("blip");
    expect(fn).toHaveBeenCalledTimes(5); // 1 + 4 retry
  });

  it("non ritenta affatto se il primo tentativo ha successo", async () => {
    const fn = vi.fn<() => Promise<number>>().mockResolvedValue(42);
    await expect(withDbRetry(fn)).resolves.toBe(42);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
