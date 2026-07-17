/**
 * Task #445 — alerts.ts: platformLine nel corpo della push crash-free rate
 * si costruisce correttamente quando una sola piattaforma ha dati.
 *
 * Copre:
 *   - android-only:  body contiene "Android: 81%", NON contiene "iOS:"
 *   - ios-only:      body contiene "iOS: 95%", NON contiene "Android:"
 *   - entrambe:      body contiene "Android: 81% · iOS: 95%"
 *   - byPlatform {}  (vuoto): nessun testo "(…)" aggiunto al body
 *   - piattaforma inattesa (es. "unknown"): inclusa in coda al breakdown
 *
 * dispatchAlerts() è isolata: push-notifications, log, coordinator e
 * maps-kill-switch sono tutti mockati. push-notifications-internal
 * (getAdminPushTokenCount) restituisce -1 → guard anti-spam skip.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock delle dipendenze esterne ────────────────────────────────────────────

const sendPushMock = vi.hoisted(() => vi.fn().mockResolvedValue(2));

vi.mock("../push-notifications", () => ({
  sendSystemAlertPushToAdmins: sendPushMock,
}));

vi.mock("../push-notifications-internal", () => ({
  // -1 → getAdminPushTokenCount restituisce un errore (campione non valido),
  // il guard anti-spam salta l'intera logica senza bloccare i test.
  getAdminPushTokenCount: vi.fn().mockResolvedValue(-1),
}));

vi.mock("../ai/watchdog/log", () => ({
  writeWatchdogLog: vi.fn().mockResolvedValue("log-id"),
}));

vi.mock("../ai/coordinator/integrations/watchdog", () => ({
  emitWatchdogAlert: vi.fn().mockResolvedValue(undefined),
  emitWatchdogStatusChange: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../ai/watchdog/maps-kill-switch", () => ({
  isMapsFlagEnabled: vi.fn().mockResolvedValue(true),
}));

import { dispatchAlerts, _resetThrottleForTests } from "../ai/watchdog/alerts";
import type { HealthSnapshot, Problem } from "../ai/watchdog/types";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeCrashRateProblem(byPlatform: Record<string, number>): Problem {
  return {
    id: "error.client.crash_free_rate_24h",
    severity: "critical",
    source: "error",
    title: "Crash-free rate 24h sotto soglia",
    suggestion: "Verifica i log crash nell'admin.",
    detail: JSON.stringify({
      crashFreeRate: 81.0,
      crashCount: 19,
      totalSessions: 100,
      insufficientData: false,
      byPlatform,
    }),
  };
}

function makeSnapshot(problems: Problem[]): HealthSnapshot {
  return {
    status: "red",
    score: 40,
    problems,
    metrics: {},
    generatedAt: new Date().toISOString(),
  };
}

/** Estrae il body della push watchdog_crash_free_rate inviata. */
function crashRatePushBody(): string | undefined {
  const call = sendPushMock.mock.calls.find(
    ([, , payload]) => (payload as { type?: string })?.type === "watchdog_crash_free_rate",
  );
  return call ? (call[1] as string) : undefined;
}

// ── Test ──────────────────────────────────────────────────────────────────────

describe("alerts.ts — platformLine crash-free rate (Task #445)", () => {
  beforeEach(() => {
    sendPushMock.mockClear();
    _resetThrottleForTests();
  });

  it("android-only: body contiene 'Android: 81%', NON 'iOS:'", async () => {
    const problem = makeCrashRateProblem({ android: 81.0 });
    await dispatchAlerts(makeSnapshot([problem]));

    const body = crashRatePushBody();
    expect(body).toBeDefined();
    expect(body).toContain("Android: 81%");
    expect(body).not.toContain("iOS:");
  });

  it("ios-only: body contiene 'iOS: 95%', NON 'Android:'", async () => {
    const problem = makeCrashRateProblem({ ios: 95.0 });
    await dispatchAlerts(makeSnapshot([problem]));

    const body = crashRatePushBody();
    expect(body).toBeDefined();
    expect(body).toContain("iOS: 95%");
    expect(body).not.toContain("Android:");
  });

  it("entrambe le piattaforme: body contiene 'Android: 81% · iOS: 95%'", async () => {
    const problem = makeCrashRateProblem({ android: 81.0, ios: 95.0 });
    await dispatchAlerts(makeSnapshot([problem]));

    const body = crashRatePushBody();
    expect(body).toBeDefined();
    expect(body).toContain("Android: 81%");
    expect(body).toContain("iOS: 95%");
    // ordine canonico android · ios
    expect(body).toContain("Android: 81% · iOS: 95%");
  });

  it("byPlatform vuoto ({}): nessuna parentesi aggiunta al body", async () => {
    const problem = makeCrashRateProblem({});
    await dispatchAlerts(makeSnapshot([problem]));

    const body = crashRatePushBody();
    expect(body).toBeDefined();
    // Nessun breakdown tra parentesi: platformLine rimane stringa vuota
    expect(body).not.toContain("(");
    expect(body).not.toContain(")");
  });

  it("piattaforma 'unknown' inattesa: inclusa nel breakdown in coda ad android/ios", async () => {
    const problem = makeCrashRateProblem({ android: 81.0, unknown: 60.0 });
    await dispatchAlerts(makeSnapshot([problem]));

    const body = crashRatePushBody();
    expect(body).toBeDefined();
    expect(body).toContain("Android: 81%");
    expect(body).toContain("unknown: 60%");
    // android appare prima di unknown (ordine canonico → poi extra)
    const aIdx = body!.indexOf("Android:");
    const uIdx = body!.indexOf("unknown:");
    expect(aIdx).toBeLessThan(uIdx);
  });

  it("android-only: la push è effettivamente inviata (sent > 0)", async () => {
    const problem = makeCrashRateProblem({ android: 81.0 });
    const result = await dispatchAlerts(makeSnapshot([problem]));

    expect(result.sent).toBeGreaterThan(0);
  });

  it("throttle: una seconda chiamata ravvicinata NON duplica la push crash-rate", async () => {
    const problem = makeCrashRateProblem({ android: 81.0 });
    await dispatchAlerts(makeSnapshot([problem]));
    await dispatchAlerts(makeSnapshot([problem]));

    const crashRateCalls = sendPushMock.mock.calls.filter(
      ([, , p]) => (p as { type?: string })?.type === "watchdog_crash_free_rate",
    );
    expect(crashRateCalls).toHaveLength(1);
  });
});
