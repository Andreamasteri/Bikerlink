/**
 * Unit tests for the Horus triage bundle trim logic.
 *
 * Covers estimateTokens(), TRIM_SECTIONS regex matching, and trimBundleToFit()
 * so that a header-format change in fmtSection is caught immediately instead
 * of silently leaving the bundle over budget.
 */

import { describe, it, expect } from "vitest";
import { estimateTokens, TRIM_SECTIONS, trimBundleToFit } from "../lib/horus-trim";

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Builds a synthetic bundle string that matches the real fmtSection() format. */
function fmtSection(title: string, body: string): string {
  return `\n===== ${title} =====\n${body}\n`;
}

/**
 * Returns a bundle string that contains all three trimmable sections plus
 * a leading header block and a trailing ## RICHIESTA block (so the regexes
 * have realistic surrounding context to anchor against).
 */
function buildSyntheticBundle(opts: {
  triagePrecedente?: string;
  weeklySystemReports?: string;
  pgStatActivity?: string;
} = {}): string {
  const parts: string[] = [];

  parts.push("# TRIAGE BIKERLINK — CONTESTO AGGREGATO\n");
  parts.push("\n## DATI DB\n");
  parts.push(fmtSection("DB: app_crash_logs (ultimi 60 crash)", "nessuna riga"));
  parts.push(fmtSection("DB: ai_watchdog_log (ultimi 80)", "nessuna riga"));

  if (opts.weeklySystemReports !== undefined) {
    parts.push(fmtSection("DB: weekly_system_reports (ultimo 1)", opts.weeklySystemReports));
  }

  parts.push(fmtSection("DB: pg_stat_user_tables — bloat e seq scan (top 20)", "nessuna riga"));

  if (opts.pgStatActivity !== undefined) {
    parts.push(fmtSection("DB: pg_stat_activity — connessioni attive/idle in transaction", opts.pgStatActivity));
  }

  parts.push("\n## LOG FILESYSTEM\n");
  parts.push(fmtSection("LOG: /tmp/backend.log (ultime 500 righe)", "log content here"));

  if (opts.triagePrecedente !== undefined) {
    parts.push("\n## TRIAGE PRECEDENTE\n");
    parts.push(opts.triagePrecedente + "\n");
  }

  parts.push(
    "\n## RICHIESTA A HORUS\n" +
      "Analizza tutti i dati qui sopra.\n",
  );

  return parts.join("\n");
}

// ─── estimateTokens ───────────────────────────────────────────────────────────

describe("estimateTokens", () => {
  it("returns Math.ceil(len/4) for empty string", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("returns Math.ceil(len/4) for a 4-char string", () => {
    expect(estimateTokens("abcd")).toBe(1);
  });

  it("returns Math.ceil(len/4) for a 5-char string (ceiling)", () => {
    expect(estimateTokens("abcde")).toBe(2);
  });

  it("returns Math.ceil(len/4) for a 400-char string", () => {
    const s = "x".repeat(400);
    expect(estimateTokens(s)).toBe(100);
  });

  it("returns Math.ceil(len/4) for a 401-char string", () => {
    const s = "x".repeat(401);
    expect(estimateTokens(s)).toBe(Math.ceil(401 / 4));
  });
});

// ─── TRIM_SECTIONS regex matching ────────────────────────────────────────────

describe("TRIM_SECTIONS regex — TRIAGE PRECEDENTE", () => {
  const section = TRIM_SECTIONS.find((s) => s.label.includes("TRIAGE PRECEDENTE"))!;

  it("finds and removes the TRIAGE PRECEDENTE block before ## RICHIESTA", () => {
    const bundle = buildSyntheticBundle({ triagePrecedente: "## PROBLEMI TROVATI\n- old bug\n" });
    expect(section.re.test(bundle)).toBe(true);
    const after = bundle.replace(section.re, "");
    expect(after).not.toContain("## TRIAGE PRECEDENTE");
    expect(after).not.toContain("old bug");
    // The ## RICHIESTA block must survive
    expect(after).toContain("## RICHIESTA A HORUS");
  });

  it("does NOT match when there is no TRIAGE PRECEDENTE block", () => {
    const bundle = buildSyntheticBundle();
    expect(section.re.test(bundle)).toBe(false);
  });
});

describe("TRIM_SECTIONS regex — weekly_system_reports", () => {
  const section = TRIM_SECTIONS.find((s) => s.label.includes("weekly_system_reports"))!;

  it("matches the fmtSection-formatted weekly_system_reports block", () => {
    const bundle = buildSyntheticBundle({ weeklySystemReports: '{"payload":"big blob"}' });
    expect(section.re.test(bundle)).toBe(true);
  });

  it("removes weekly_system_reports without touching adjacent sections", () => {
    const bundle = buildSyntheticBundle({ weeklySystemReports: '{"payload":"big blob"}' });
    const after = bundle.replace(section.re, "");
    expect(after).not.toContain("weekly_system_reports");
    // Adjacent sections must survive
    expect(after).toContain("app_crash_logs");
    expect(after).toContain("pg_stat_user_tables");
  });

  it("does NOT match when weekly_system_reports section is absent", () => {
    const bundle = buildSyntheticBundle();
    expect(section.re.test(bundle)).toBe(false);
  });
});

describe("TRIM_SECTIONS regex — pg_stat_activity", () => {
  const section = TRIM_SECTIONS.find((s) => s.label.includes("pg_stat_activity"))!;

  it("matches the fmtSection-formatted pg_stat_activity block", () => {
    const bundle = buildSyntheticBundle({ pgStatActivity: "state: active" });
    expect(section.re.test(bundle)).toBe(true);
  });

  it("removes pg_stat_activity without touching adjacent sections", () => {
    const bundle = buildSyntheticBundle({ pgStatActivity: "state: active" });
    const after = bundle.replace(section.re, "");
    expect(after).not.toContain("pg_stat_activity");
    expect(after).toContain("pg_stat_user_tables");
    expect(after).toContain("LOG FILESYSTEM");
  });

  it("does NOT match when pg_stat_activity section is absent", () => {
    const bundle = buildSyntheticBundle();
    expect(section.re.test(bundle)).toBe(false);
  });
});

// ─── trimBundleToFit ──────────────────────────────────────────────────────────

describe("trimBundleToFit", () => {
  it("returns the bundle unchanged when within budget", () => {
    const bundle = buildSyntheticBundle({
      triagePrecedente: "## PROBLEMI TROVATI\n- old bug\n",
      weeklySystemReports: '{"payload":"blob"}',
      pgStatActivity: "state: active",
    });
    // Budget larger than the whole bundle
    const { bundle: result, trimmed } = trimBundleToFit(bundle, 1_000_000);
    expect(result).toBe(bundle);
    expect(trimmed).toHaveLength(0);
  });

  it("removes only TRIAGE PRECEDENTE when that alone brings it within budget", () => {
    // Build a big TRIAGE PRECEDENTE block to push us over budget, but keep
    // everything else small so removing it suffices.
    const largePrev = "x".repeat(10_000);
    const bundle = buildSyntheticBundle({
      triagePrecedente: largePrev,
      weeklySystemReports: "small",
      pgStatActivity: "small",
    });
    // Budget is just below the full bundle but above the bundle minus triage
    const totalTokens = estimateTokens(bundle);
    const budget = totalTokens - Math.ceil(10_000 / 4) - 1; // definitely under after removing triage

    const { bundle: result, trimmed } = trimBundleToFit(bundle, budget);
    expect(trimmed).toContain("TRIAGE PRECEDENTE (report round precedente)");
    expect(result).not.toContain("## TRIAGE PRECEDENTE");
    // weekly_system_reports and pg_stat_activity should still be present
    expect(result).toContain("weekly_system_reports");
    expect(result).toContain("pg_stat_activity");
    expect(estimateTokens(result)).toBeLessThanOrEqual(budget);
  });

  it("removes sections in priority order until within budget", () => {
    const largePrev = "p".repeat(4_000);
    const largeWeekly = "w".repeat(4_000);
    const bundle = buildSyntheticBundle({
      triagePrecedente: largePrev,
      weeklySystemReports: largeWeekly,
      pgStatActivity: "small",
    });

    // Budget tight enough to need both triage and weekly removed
    const totalTokens = estimateTokens(bundle);
    // Remove both: ~4000/4 = 1000 tokens each → need budget 2000+ under total
    const budget = totalTokens - 2000;

    const { bundle: result, trimmed } = trimBundleToFit(bundle, budget);
    expect(trimmed).toContain("TRIAGE PRECEDENTE (report round precedente)");
    expect(trimmed).toContain("DB: weekly_system_reports");
    expect(result).not.toContain("## TRIAGE PRECEDENTE");
    expect(result).not.toContain("weekly_system_reports");
  });

  it("removes all three sections when budget is very tight", () => {
    const largePrev = "p".repeat(4_000);
    const largeWeekly = "w".repeat(4_000);
    const largePgStat = "q".repeat(4_000);
    const bundle = buildSyntheticBundle({
      triagePrecedente: largePrev,
      weeklySystemReports: largeWeekly,
      pgStatActivity: largePgStat,
    });

    // Budget so tight that all three must go
    const { bundle: result, trimmed } = trimBundleToFit(bundle, 1);
    expect(trimmed).toContain("TRIAGE PRECEDENTE (report round precedente)");
    expect(trimmed).toContain("DB: weekly_system_reports");
    expect(trimmed).toContain("DB: pg_stat_activity");
    expect(result).not.toContain("## TRIAGE PRECEDENTE");
    expect(result).not.toContain("weekly_system_reports");
    expect(result).not.toContain("pg_stat_activity");
  });

  it("does not report a section as trimmed when its regex does not match", () => {
    // Bundle has NO trimmable sections
    const bundle = buildSyntheticBundle();
    // Force a tight budget
    const { trimmed } = trimBundleToFit(bundle, 1);
    expect(trimmed).toHaveLength(0);
  });
});
