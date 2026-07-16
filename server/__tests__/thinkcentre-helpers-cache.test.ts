/**
 * Tests: cache TTL + stale-while-revalidate per i tre helper ThinkCentre
 *
 * Verifica che isThinkCentreInMaintenance / isThinkCentrePoweredOff /
 * isThinkCentreIgnoredForTests:
 *  (a) servano dalla cache entro il TTL senza colpire il DB
 *  (b) su errore DB restituiscano l'ultimo valore noto (stale fallback)
 *  (c) su errore DB senza cache precedente restituiscano false (default sicuro)
 *  (d) reset della cache forzi la rilettura dal DB al prossimo accesso
 *
 * Strategia: mock di `../db` per intercettare le query senza toccare il DB
 * reale; withDbRetry REALE per verificare l'integrazione autentica.
 */

import { vi, describe, it, expect, beforeEach } from "vitest";

// ── Hoisted setup ──────────────────────────────────────────────────────────────

vi.hoisted(() => {
  process.env.DATABASE_URL =
    process.env.DATABASE_URL || "postgres://test:test@localhost:5432/test"; // pragma: allowlist secret
});

const { mockDbSelect } = vi.hoisted(() => ({ mockDbSelect: vi.fn() }));

vi.mock("../db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../db")>();
  return {
    ...actual,
    db: {
      select: mockDbSelect,
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      transaction: vi.fn(),
    },
  };
});

// ── Helper: builder chainable per .from().where().limit() ──────────────────────

function makeSelectChain(terminal: () => Promise<unknown[]>) {
  return {
    from: () => ({
      where: () => ({ limit: () => terminal() }),
    }),
  };
}

// ── Imports (dopo i mock) ──────────────────────────────────────────────────────

import {
  isThinkCentreInMaintenance,
  resetThinkCentreMaintenanceCache,
} from "../lib/thinkcentre-maintenance";
import {
  isThinkCentrePoweredOff,
  resetThinkCentrePoweredOffCache,
} from "../lib/thinkcentre-powered-off";
import {
  isThinkCentreIgnoredForTests,
  resetThinkCentreIgnoreForTestsCache,
} from "../lib/thinkcentre-ignore-tests";

// ── Parametric test suite ──────────────────────────────────────────────────────

type HelperFn = () => Promise<boolean>;
type ResetFn = () => void;

function suiteFor(name: string, fn: HelperFn, reset: ResetFn) {
  describe(name, () => {
    beforeEach(() => {
      vi.clearAllMocks();
      reset();
    });

    it("(a) cache hit — nessuna query DB entro il TTL", async () => {
      mockDbSelect.mockImplementation(() =>
        makeSelectChain(() => Promise.resolve([{ value: "true" }])),
      );

      const first = await fn();
      const second = await fn();

      expect(first).toBe(true);
      expect(second).toBe(true);
      expect(mockDbSelect).toHaveBeenCalledTimes(1); // secondo read dalla cache
    });

    it("(a) cache rispetta il valore false (non solo true)", async () => {
      mockDbSelect.mockImplementation(() =>
        makeSelectChain(() => Promise.resolve([{ value: "false" }])),
      );

      const first = await fn();
      const second = await fn();

      expect(first).toBe(false);
      expect(second).toBe(false);
      expect(mockDbSelect).toHaveBeenCalledTimes(1);
    });

    it("(b) errore DB con cache inizializzata — restituisce valore stale", async () => {
      vi.useFakeTimers();
      try {
        // Prima chiamata: popola la cache con true
        mockDbSelect.mockImplementationOnce(() =>
          makeSelectChain(() => Promise.resolve([{ value: "true" }])),
        );
        const initial = await fn();
        expect(initial).toBe(true);

        // Avanza il clock oltre il TTL (60s) → la prossima chiamata tenta il DB
        vi.advanceTimersByTime(61_000);

        // DB fallisce — deve restituire il valore stale (true), non lanciare
        mockDbSelect.mockImplementation(() =>
          makeSelectChain(() => Promise.reject(new Error("DB overload"))),
        );

        const stale = await fn();
        expect(stale).toBe(true); // stale fallback, non throw
      } finally {
        vi.useRealTimers();
      }
    });

    it("(c) errore DB senza cache inizializzata — restituisce false (default sicuro)", async () => {
      mockDbSelect.mockImplementation(() =>
        makeSelectChain(() => Promise.reject(new Error("DB overload"))),
      );

      const result = await fn();
      expect(result).toBe(false); // default sicuro: non presuppone flag attivo
    });

    it("(d) reset — forza rilettura DB al prossimo accesso", async () => {
      // Popola la cache
      mockDbSelect.mockImplementationOnce(() =>
        makeSelectChain(() => Promise.resolve([{ value: "false" }])),
      );
      await fn();
      expect(mockDbSelect).toHaveBeenCalledTimes(1);

      // Reset → il prossimo accesso colpisce il DB
      reset();
      mockDbSelect.mockImplementationOnce(() =>
        makeSelectChain(() => Promise.resolve([{ value: "true" }])),
      );

      const after = await fn();
      expect(after).toBe(true);
      expect(mockDbSelect).toHaveBeenCalledTimes(2);
    });
  });
}

suiteFor(
  "isThinkCentreInMaintenance",
  isThinkCentreInMaintenance,
  resetThinkCentreMaintenanceCache,
);

suiteFor(
  "isThinkCentrePoweredOff",
  isThinkCentrePoweredOff,
  resetThinkCentrePoweredOffCache,
);

suiteFor(
  "isThinkCentreIgnoredForTests",
  isThinkCentreIgnoredForTests,
  resetThinkCentreIgnoreForTestsCache,
);
