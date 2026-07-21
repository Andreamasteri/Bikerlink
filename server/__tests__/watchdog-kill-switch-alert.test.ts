import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Task #973 — Kill-switch adattivo bg-db-limiter: dispatchAlerts() emette una
// push admin al primo scatto (transizione attivo) e una push di rientro quando
// il kill-switch si disattiva, rispettando throttle (15 min) e latch.
// ---------------------------------------------------------------------------

const sendPushMock = vi.hoisted(() => vi.fn().mockResolvedValue(2));
const getAdminPushTokenCountMock = vi.hoisted(() => vi.fn().mockResolvedValue(-1));

vi.mock("../push-notifications", () => ({
  sendSystemAlertPushToAdmins: sendPushMock,
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

vi.mock("../push-notifications-internal", () => ({
  getAdminPushTokenCount: getAdminPushTokenCountMock,
}));

import { dispatchAlerts, _resetThrottleForTests } from "../ai/watchdog/alerts";
import type { HealthSnapshot } from "../ai/watchdog/types";

const KILL_SWITCH_ALERT_TTL_MS = 15 * 60 * 1000; // stesso valore di alerts.ts

function makeSnap(metrics: Record<string, number> = {}, problems: HealthSnapshot["problems"] = []): HealthSnapshot {
  return {
    status: "yellow",
    score: 78,
    problems,
    metrics,
    generatedAt: new Date().toISOString(),
  };
}

/** Snapshot con kill-switch ON (N ping lenti consecutivi). */
function killSwitchOnSnap(pings = 5, droppedTotal = 12): HealthSnapshot {
  return makeSnap({
    "db.bg_limiter.kill_switch_active": pings,
    "db.bg_limiter.dropped_kill_switch": droppedTotal,
  });
}

/** Snapshot con kill-switch OFF (nessun metric kill_switch_active). */
function killSwitchOffSnap(droppedTotal = 12): HealthSnapshot {
  return makeSnap({ "db.bg_limiter.dropped_kill_switch": droppedTotal });
}

/** Snapshot con segnale di recovery (transizione active→inactive). */
function killSwitchRecoveredSnap(droppedTotal = 12): HealthSnapshot {
  return makeSnap({
    "db.bg_limiter.kill_switch_recovered": 0,
    "db.bg_limiter.dropped_kill_switch": droppedTotal,
  });
}

describe("watchdog kill-switch alert (Task #973)", () => {
  beforeEach(() => {
    sendPushMock.mockClear();
    _resetThrottleForTests();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── Start alert ───────────────────────────────────────────────────────────

  it("invia una push quando il kill-switch è attivo", async () => {
    await dispatchAlerts(killSwitchOnSnap(5, 12));

    const calls = sendPushMock.mock.calls.filter(
      ([, , p]) => (p as { type?: string })?.type === "watchdog_db_killswitch_active",
    );
    expect(calls).toHaveLength(1);
    const [title, body, payload] = calls[0];
    expect(title).toContain("Kill-switch DB attivo");
    expect(title).toContain("5");
    expect(body).toContain("5");
    expect(body).toContain("12");
    expect(payload).toMatchObject({ type: "watchdog_db_killswitch_active", pings: 5, droppedSlowKillSwitchTotal: 12 });
  });

  it("throttle: non reinvia la start push entro 15 minuti", async () => {
    await dispatchAlerts(killSwitchOnSnap(5, 12));
    sendPushMock.mockClear();

    // Tick successivo dentro la finestra (14 min)
    vi.advanceTimersByTime(14 * 60 * 1000);
    await dispatchAlerts(killSwitchOnSnap(29, 50));

    const calls = sendPushMock.mock.calls.filter(
      ([, , p]) => (p as { type?: string })?.type === "watchdog_db_killswitch_active",
    );
    expect(calls).toHaveLength(0);
  });

  it("reinvia la start push dopo 15 minuti se il kill-switch è ancora attivo", async () => {
    await dispatchAlerts(killSwitchOnSnap(5, 12));
    sendPushMock.mockClear();

    vi.advanceTimersByTime(KILL_SWITCH_ALERT_TTL_MS + 1000);
    await dispatchAlerts(killSwitchOnSnap(29, 50));

    const calls = sendPushMock.mock.calls.filter(
      ([, , p]) => (p as { type?: string })?.type === "watchdog_db_killswitch_active",
    );
    expect(calls).toHaveLength(1);
  });

  it("NON invia start push quando il metric kill_switch_active è assente", async () => {
    await dispatchAlerts(killSwitchOffSnap());

    const calls = sendPushMock.mock.calls.filter(
      ([, , p]) => (p as { type?: string })?.type === "watchdog_db_killswitch_active",
    );
    expect(calls).toHaveLength(0);
  });

  // ── Recovery alert ────────────────────────────────────────────────────────

  it("invia una push di rientro quando il kill-switch si disattiva (dopo uno start reale)", async () => {
    // Arma il latch con una start alert reale
    await dispatchAlerts(killSwitchOnSnap(5, 12));
    sendPushMock.mockClear();

    // Recovery: kill-switch OFF + segnale recovered
    await dispatchAlerts(killSwitchRecoveredSnap(15));

    const calls = sendPushMock.mock.calls.filter(
      ([, , p]) => (p as { type?: string })?.type === "watchdog_db_killswitch_recovered",
    );
    expect(calls).toHaveLength(1);
    const [title, body] = calls[0];
    expect(title).toContain("Kill-switch DB disattivato");
    expect(body).toContain("15");
  });

  it("NON invia push di rientro se il latch non è armato (nessuna start alert precedente)", async () => {
    // Recovery senza start alert
    await dispatchAlerts(killSwitchRecoveredSnap(15));

    const calls = sendPushMock.mock.calls.filter(
      ([, , p]) => (p as { type?: string })?.type === "watchdog_db_killswitch_recovered",
    );
    expect(calls).toHaveLength(0);
  });

  it("throttle: non reinvia la push di rientro entro 15 minuti (secondo incidente)", async () => {
    // Primo incidente completo: start → recovery (latch consumato)
    await dispatchAlerts(killSwitchOnSnap(5, 10));
    await dispatchAlerts(killSwitchRecoveredSnap(10));
    sendPushMock.mockClear();

    // Secondo incidente entro TTL: start ri-arma il latch, ma il throttle blocca recovery
    await dispatchAlerts(killSwitchOnSnap(3, 20));
    await dispatchAlerts(killSwitchRecoveredSnap(20));

    const calls = sendPushMock.mock.calls.filter(
      ([, , p]) => (p as { type?: string })?.type === "watchdog_db_killswitch_recovered",
    );
    expect(calls).toHaveLength(0);
  });

  it("il latch viene consumato dopo il rientro — un secondo rientro senza start non invia push", async () => {
    // Primo ciclo completo
    await dispatchAlerts(killSwitchOnSnap(5, 10));
    vi.advanceTimersByTime(KILL_SWITCH_ALERT_TTL_MS + 1000); // scade il throttle recovery
    await dispatchAlerts(killSwitchRecoveredSnap(10));
    sendPushMock.mockClear();

    // Secondo recovery senza un nuovo start: latch consumato → nessuna push
    vi.advanceTimersByTime(KILL_SWITCH_ALERT_TTL_MS + 1000);
    await dispatchAlerts(killSwitchRecoveredSnap(10));

    const calls = sendPushMock.mock.calls.filter(
      ([, , p]) => (p as { type?: string })?.type === "watchdog_db_killswitch_recovered",
    );
    expect(calls).toHaveLength(0);
  });

  it("invia anche la start push quando il throttle è stato armato via snapshot ON (dentro throttle)", async () => {
    // Snapshot ON senza il metric kill_switch_active (es. appena sotto soglia): nessuna start
    // poi snapshot ON con kill_switch_active: start inviata
    await dispatchAlerts(killSwitchOffSnap(0)); // latch NON armato
    await dispatchAlerts(killSwitchOnSnap(2, 5)); // start inviata, latch armato

    const calls = sendPushMock.mock.calls.filter(
      ([, , p]) => (p as { type?: string })?.type === "watchdog_db_killswitch_active",
    );
    expect(calls).toHaveLength(1);
  });
});
