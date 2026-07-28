/**
 * Backend Sentry initialization.
 *
 * Sentry is optional and must never block application boot. Configuration is
 * deliberately conservative: no default PII, bounded tracing, explicit release
 * metadata and filtering for transient errors already handled by the runtime.
 */
import type { Express } from "express";

let sentryReady = false;

function readTraceSampleRate(): number {
  const raw = Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? "0.05");
  if (!Number.isFinite(raw)) return 0.05;
  return Math.min(1, Math.max(0, raw));
}

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
      environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? "development",
      release: process.env.SENTRY_RELEASE ?? process.env.REPL_SLUG ?? undefined,
      tracesSampleRate: readTraceSampleRate(),
      sendDefaultPii: false,
      maxBreadcrumbs: 50,
      ignoreErrors: [
        "BgDbSlowKillSwitchError",
        "BgDbQueueTimeoutError",
        "BgDbQueueOverflowError",
        "DbTimeoutError",
        /DB query timeout/,
        /connection timeout/i,
        /connection terminated/i,
        /connection reset/i,
        /socket hang up/i,
      ],
      beforeSend(event) {
        if (event.request) {
          delete event.request.cookies;
          delete event.request.data;
          if (event.request.headers) {
            delete event.request.headers.authorization;
            delete event.request.headers.cookie;
          }
        }
        return event;
      },
    });

    sentryReady = true;
    console.log(`[sentry] inizializzato (traces=${readTraceSampleRate()})`);
  } catch (err) {
    sentryReady = false;
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
 * Captures an exception via Sentry and returns the event ID so it can be stored
 * alongside the local diagnostic entry. Returns null when Sentry is disabled.
 */
export async function captureMatchingError(
  err: unknown,
  context: Record<string, unknown> = {},
): Promise<string | null> {
  if (!sentryReady) return null;
  try {
    const Sentry = await import("@sentry/node");
    const eventId = Sentry.captureException(err, {
      tags: { component: "matching" },
      extra: context,
    });
    return eventId ?? null;
  } catch {
    return null;
  }
}
