// Surfaces recent unexpected_restart signals to the watchdog aggregator.
// Queries system_signals for restarts written in the last RESTART_VISIBLE_WINDOW_MIN
// minutes so the problem stays visible in the admin panel for several ticks.
import { getRecentUnexpectedRestarts, getRecentCrashReasons, RESTART_VISIBLE_WINDOW_MIN } from "../restart-monitor";
import type { Signal } from "../types";

export async function collectRestarts(): Promise<Signal[]> {
  try {
    const [restarts, crashReasons] = await Promise.all([
      getRecentUnexpectedRestarts(),
      getRecentCrashReasons(),
    ]);

    const signals: Signal[] = [];

    if (restarts.length > 0) {
      const latest = restarts[0];
      const count = restarts.length;
      const minutesSinceLast = latest.minutesSinceLast ?? 0;

      // NOTE: metric name intentionally differs from the raw boot-event metric
      // ("server.unexpected_restart") so that recordSignals() persisting this
      // collector output does NOT create rows that getRecentUnexpectedRestarts()
      // would pick up on the next tick — which would fabricate a feedback loop.
      signals.push({
        source: "app",
        metric: "server.restart_alert",
        severity: count >= 3 ? "critical" : "high",
        value: count,
        unit: "restarts",
        details: {
          count,
          latestAt: latest.createdAt.toISOString(),
          minutesSinceLast,
          visibleWindowMin: RESTART_VISIBLE_WINDOW_MIN,
        },
      });
    }

    if (crashReasons.length > 0) {
      const latest = crashReasons[0];
      signals.push({
        source: "app",
        metric: "server.crash_reason_alert",
        severity: "critical",
        value: crashReasons.length,
        unit: "crashes",
        details: {
          count: crashReasons.length,
          latestCrashedAt: latest.crashedAt,
          type: latest.type,
          message: latest.message,
          visibleWindowMin: RESTART_VISIBLE_WINDOW_MIN,
        },
      });
    }

    return signals;
  } catch (err) {
    return [
      {
        source: "app",
        metric: "collector.error",
        severity: "warn",
        details: { collector: "restart", error: (err as Error).message?.slice(0, 200) },
      },
    ];
  }
}
