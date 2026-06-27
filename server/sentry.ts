/**
 * Task #2527 — Inizializzazione Sentry per il backend.
 *
 * Attivo solo se `SENTRY_DSN` è presente nell'ambiente. Import dinamico per
 * non bloccare il boot se la dipendenza manca. `setupExpressErrorHandler`
 * va chiamato DOPO le route, prima del nostro error handler custom.
 */
import type { Express } from "express";

let sentryReady = false;

export async function initSentry(): Promise<void> {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    console.log("[sentry] SENTRY_DSN non impostato — Sentry disabilitato");
    return;
  }
  try {
    const Sentry = await import("@sentry/node");
    Sentry.init({
      dsn,
      tracesSampleRate: 0.1,
      environment: process.env.NODE_ENV ?? "development",
      ignoreErrors: [
        "BgDbSlowKillSwitchError",
        "BgDbQueueTimeoutError",
        "BgDbQueueOverflowError",
      ],
    });
    sentryReady = true;
    console.log("[sentry] inizializzato");
  } catch (err) {
    console.warn("[sentry] init fallito:", (err as Error).message);
  }
}

export async function attachSentryErrorHandler(app: Express): Promise<void> {
  if (!sentryReady) return;
  try {
    const Sentry = await import("@sentry/node");
    if (typeof Sentry.setupExpressErrorHandler === "function") {
      Sentry.setupExpressErrorHandler(app);
    }
  } catch (err) {
    console.warn("[sentry] attach handler fallito:", (err as Error).message);
  }
}

/**
 * Captures an exception via Sentry and returns the Sentry event ID so it can
 * be stored alongside the ring-buffer log entry for deep-link access.
 * Returns null if Sentry is disabled or the capture fails.
 */
export async function captureMatchingError(err: unknown, context: Record<string, unknown> = {}): Promise<string | null> {
  if (!sentryReady) return null;
  try {
    const Sentry = await import("@sentry/node");
    const eventId = Sentry.captureException(err, { extra: { component: "matching", ...context } });
    return eventId ?? null;
  } catch {
    return null;
  }
}
