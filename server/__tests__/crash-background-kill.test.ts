/**
 * Task #578 — background_kill classification
 *
 * Covers:
 *   a) deriveCrashType: crash_system + no error + session ≥ 30min → background_kill
 *   b) deriveCrashType: crash_system + short session → crash_system (not background_kill)
 *   c) deriveCrashType: crash_system + error_message → crash_system (has error, not bg kill)
 *   d) deriveCrashType: [resume:X] prefix → correct signal type regardless of session length
 *   e) crash_js with no session data → crash_js (only crash_system is reclassified)
 *   f) background_kill is listed in SIGNAL_TYPES_DIAGNOSTIC (treated as informational)
 */
import { describe, it, expect } from "vitest";
import { deriveCrashType, SIGNAL_TYPES_DIAGNOSTIC } from "../routes/crash-logs";

const THIRTY_MIN_MS = 30 * 60 * 1000;

describe("deriveCrashType — background_kill heuristic", () => {
  it("classifies crash_system + no error + session ≥ 30min as background_kill", () => {
    const now = new Date();
    const start = new Date(now.getTime() - THIRTY_MIN_MS - 1000);
    expect(
      deriveCrashType({ crashType: "crash_system", errorMessage: null, sessionStartedAt: start, reportedAt: now })
    ).toBe("background_kill");
  });

  it("classifies crash_system + empty string error + session ≥ 30min as background_kill", () => {
    const now = new Date();
    const start = new Date(now.getTime() - 60 * 60 * 1000);
    expect(
      deriveCrashType({ crashType: "crash_system", errorMessage: "", sessionStartedAt: start, reportedAt: now })
    ).toBe("background_kill");
  });

  it("does NOT classify crash_system + short session (< 30min) as background_kill", () => {
    const now = new Date();
    const start = new Date(now.getTime() - 10 * 60 * 1000);
    expect(
      deriveCrashType({ crashType: "crash_system", errorMessage: null, sessionStartedAt: start, reportedAt: now })
    ).toBe("crash_system");
  });

  it("does NOT classify crash_system with an error_message as background_kill", () => {
    const now = new Date();
    const start = new Date(now.getTime() - 60 * 60 * 1000);
    expect(
      deriveCrashType({ crashType: "crash_system", errorMessage: "NullPointerException", sessionStartedAt: start, reportedAt: now })
    ).toBe("crash_system");
  });

  it("does NOT classify crash_system with null sessionStartedAt as background_kill", () => {
    const now = new Date();
    expect(
      deriveCrashType({ crashType: "crash_system", errorMessage: null, sessionStartedAt: null, reportedAt: now })
    ).toBe("crash_system");
  });

  it("does NOT classify crash_js as background_kill even with long session and no error", () => {
    const now = new Date();
    const start = new Date(now.getTime() - 60 * 60 * 1000);
    expect(
      deriveCrashType({ crashType: "crash_js", errorMessage: null, sessionStartedAt: start, reportedAt: now })
    ).toBe("crash_js");
  });
});

describe("deriveCrashType — [resume:X] prefix takes priority", () => {
  it("extracts js_thread_freeze from [resume:] prefix (overrides bg_kill heuristic)", () => {
    const now = new Date();
    const start = new Date(now.getTime() - 60 * 60 * 1000);
    expect(
      deriveCrashType({
        crashType: "crash_js",
        errorMessage: "[resume:js_thread_freeze] JS thread bloccato ~842s",
        sessionStartedAt: start,
        reportedAt: now,
      })
    ).toBe("js_thread_freeze");
  });

  it("extracts gps_flood from [resume:] prefix", () => {
    expect(
      deriveCrashType({
        crashType: "crash_js",
        errorMessage: "[resume:gps_flood] too many GPS events",
        sessionStartedAt: null,
        reportedAt: new Date(),
      })
    ).toBe("gps_flood");
  });

  it("extracts memory_pressure from [resume:] prefix", () => {
    expect(
      deriveCrashType({
        crashType: "crash_js",
        errorMessage: "[resume:memory_pressure] low RAM warning",
        sessionStartedAt: null,
        reportedAt: new Date(),
      })
    ).toBe("memory_pressure");
  });
});

describe("SIGNAL_TYPES_DIAGNOSTIC includes background_kill", () => {
  it("background_kill is in SIGNAL_TYPES_DIAGNOSTIC so it is treated as informational, not a crash", () => {
    expect(SIGNAL_TYPES_DIAGNOSTIC).toContain("background_kill");
  });
});

/**
 * Ingestion dedup regression (Task #578):
 * The UNIQUE index is (user_id, session_id, crash_type). This means:
 *   - Two different users with session_id="unknown" do NOT suppress each other.
 *   - Same user + same session_id + same crash_type IS a duplicate and is dropped.
 *
 * We model this with a pure JS Map keyed on the same 3-column tuple the DB uses,
 * so this test remains fast and deterministic without a real DB connection.
 */
describe("Crash ingestion dedup key — cross-user collision regression", () => {
  /** Simulates the DB uniqueness constraint on (user_id, session_id, crash_type). */
  function simulateInserts(
    rows: Array<{ userId: string; sessionId: string; crashType: string }>
  ): Array<{ userId: string; sessionId: string; crashType: string }> {
    const seen = new Set<string>();
    const accepted: typeof rows = [];
    for (const row of rows) {
      const key = `${row.userId}|${row.sessionId}|${row.crashType}`;
      if (!seen.has(key)) {
        seen.add(key);
        accepted.push(row);
      }
      // onConflictDoNothing — duplicate silently dropped
    }
    return accepted;
  }

  it("two different users with session_id=unknown both get accepted (no cross-user suppression)", () => {
    const rows = [
      { userId: "user-1", sessionId: "unknown", crashType: "crash_system" },
      { userId: "user-2", sessionId: "unknown", crashType: "crash_system" },
    ];
    const accepted = simulateInserts(rows);
    expect(accepted).toHaveLength(2);
    expect(accepted.map((r) => r.userId)).toEqual(["user-1", "user-2"]);
  });

  it("same user inserting same (session_id, crash_type) twice — second row is dropped", () => {
    const rows = [
      { userId: "user-1", sessionId: "abc123", crashType: "crash_system" },
      { userId: "user-1", sessionId: "abc123", crashType: "crash_system" },
    ];
    const accepted = simulateInserts(rows);
    expect(accepted).toHaveLength(1);
  });

  it("same user, same session_id, different crash_type — both accepted", () => {
    const rows = [
      { userId: "user-1", sessionId: "abc123", crashType: "crash_system" },
      { userId: "user-1", sessionId: "abc123", crashType: "crash_js" },
    ];
    const accepted = simulateInserts(rows);
    expect(accepted).toHaveLength(2);
  });

  it("same user with session_id=unknown, crash_system twice — second row dropped, third user unaffected", () => {
    const rows = [
      { userId: "user-1", sessionId: "unknown", crashType: "crash_system" },
      { userId: "user-1", sessionId: "unknown", crashType: "crash_system" }, // duplicate → dropped
      { userId: "user-3", sessionId: "unknown", crashType: "crash_system" }, // different user → accepted
    ];
    const accepted = simulateInserts(rows);
    expect(accepted).toHaveLength(2);
    expect(accepted.map((r) => r.userId)).toEqual(["user-1", "user-3"]);
  });
});
