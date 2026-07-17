import { describe, it, expect } from "vitest";
import { deriveProblems, buildDerivedProblems } from "../ai/watchdog/aggregator";
import type { Signal } from "../ai/watchdog/types";

// ── Helpers ────────────────────────────────────────────────────────────────

function makeSignal(overrides: Partial<Signal>): Signal {
  return {
    source: "db",
    metric: "db.ping_ms",
    severity: "warn",
    ...overrides,
  };
}

// ── deriveProblems — filtra i segnali derived ──────────────────────────────

describe("deriveProblems", () => {
  it("processa segnali primary normalmente", () => {
    const signals: Signal[] = [
      makeSignal({ source: "db", metric: "db.ping_ms", severity: "warn", value: 600 }),
    ];
    const problems = deriveProblems(signals);
    expect(problems).toHaveLength(1);
    expect(problems[0].id).toBe("db.db.ping_ms");
  });

  it("salta i segnali con origin=derived", () => {
    const signals: Signal[] = [
      makeSignal({
        source: "db",
        metric: "db.overload_sustained",
        severity: "high",
        origin: "derived",
      }),
    ];
    const problems = deriveProblems(signals);
    expect(problems).toHaveLength(0);
  });

  it("salta i segnali severity=info indipendentemente da origin", () => {
    const signals: Signal[] = [
      makeSignal({ source: "db", metric: "db.pool.total", severity: "info" }),
    ];
    expect(deriveProblems(signals)).toHaveLength(0);
  });

  it("processa segnali senza origin (backward-compat = primary)", () => {
    const signals: Signal[] = [
      makeSignal({ source: "app", metric: "collector.error", severity: "warn" }),
    ];
    const problems = deriveProblems(signals);
    expect(problems).toHaveLength(1);
    expect(problems[0].source).toBe("app");
  });

  it("mix: primary OK, derived skipped, info skipped", () => {
    const signals: Signal[] = [
      makeSignal({ metric: "db.ping_ms", severity: "warn", value: 600 }),
      makeSignal({ metric: "db.overload_sustained", severity: "high", origin: "derived" }),
      makeSignal({ metric: "db.pool.total", severity: "info" }),
    ];
    const problems = deriveProblems(signals);
    expect(problems).toHaveLength(1);
    expect(problems[0].id).toBe("db.db.ping_ms");
  });
});

// ── buildDerivedProblems — costruisce Problems dai segnali derived ──────────

describe("buildDerivedProblems", () => {
  it("ignora segnali primary", () => {
    const signals: Signal[] = [
      makeSignal({ metric: "db.ping_ms", severity: "warn" }),
    ];
    expect(buildDerivedProblems(signals)).toHaveLength(0);
  });

  it("costruisce Problem per db.overload_sustained", () => {
    const signals: Signal[] = [
      makeSignal({
        source: "db",
        metric: "db.overload_sustained",
        severity: "high",
        value: 5,
        origin: "derived",
        details: { reasons: ["pool al 95%", "ping 600ms"] },
      }),
    ];
    const problems = buildDerivedProblems(signals);
    expect(problems).toHaveLength(1);
    expect(problems[0].id).toBe("db.db.overload_sustained");
    expect(problems[0].severity).toBe("high");
    expect(problems[0].title).toContain("Database sovraccarico da 5 cicli");
    expect(problems[0].title).toContain("pool al 95%");
    expect(problems[0].suggestion).toBeTruthy();
  });

  it("costruisce Problem per backend.overload_sustained", () => {
    const signals: Signal[] = [
      makeSignal({
        source: "app",
        metric: "backend.overload_sustained",
        severity: "high",
        value: 4,
        origin: "derived",
        details: { reasons: ["event-loop lag 300ms"] },
      }),
    ];
    const problems = buildDerivedProblems(signals);
    expect(problems).toHaveLength(1);
    expect(problems[0].id).toBe("app.backend.overload_sustained");
    expect(problems[0].title).toContain("Backend Node sovraccarico da 4 cicli");
    expect(problems[0].title).toContain("event-loop lag 300ms");
  });

  it("salta derived severity=info (recovery signals)", () => {
    const signals: Signal[] = [
      makeSignal({ metric: "db.overload_recovered", severity: "info", origin: "derived" }),
    ];
    expect(buildDerivedProblems(signals)).toHaveLength(0);
  });

  it("deriveProblems + buildDerivedProblems non si sovrappongono", () => {
    const signals: Signal[] = [
      // primary
      makeSignal({ metric: "db.ping_ms", severity: "warn", value: 600 }),
      // derived
      makeSignal({ metric: "db.overload_sustained", severity: "high", value: 3, origin: "derived" }),
    ];
    const primary = deriveProblems(signals);
    const derived = buildDerivedProblems(signals);
    const allIds = [...primary, ...derived].map((p) => p.id);
    // Nessun duplicato
    expect(new Set(allIds).size).toBe(allIds.length);
    // Il primary non contiene overload_sustained
    expect(primary.some((p) => p.id === "db.db.overload_sustained")).toBe(false);
    // Il derived lo contiene
    expect(derived.some((p) => p.id === "db.db.overload_sustained")).toBe(true);
  });
});
