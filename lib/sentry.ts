import { Platform } from "react-native";
import Constants from "expo-constants";

let _Sentry: typeof import("@sentry/react-native") | null = null;
let _initialized = false;

async function loadSentry() {
  if (_Sentry !== null) return _Sentry;
  try {
    _Sentry = await import("@sentry/react-native");
  } catch {
    _Sentry = null;
  }
  return _Sentry;
}

export async function initSentry(): Promise<void> {
  if (_initialized) return;
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (!dsn) return;
  const S = await loadSentry();
  if (!S) return;
  try {
    const version = Constants.expoConfig?.version ?? "0.0.0";
    S.init({
      dsn,
      release: version,
      environment: __DEV__ ? "development" : "production",
      enableNativeNagger: false,
      tracesSampleRate: 0,
      enableAutoSessionTracking: true,
      sessionTrackingIntervalMillis: 30000,
      // integrations: [] — disabilita TUTTE le integrazioni aggiuntive (default).
      // @sentry/react-native 8.x include @sentry/react con SentryReact profiler
      // che chiama setState dentro commitLayoutEffects → loop "Maximum update depth
      // exceeded" su React Navigation. L'error capture base (sempre attivo nel core)
      // continua a funzionare senza le integrazioni aggiuntive.
      integrations: [],
    });
    _initialized = true;
  } catch {
    // non-fatal
  }
}

export async function setSentryUser(user: { id: string; email?: string; username?: string; role?: string } | null): Promise<void> {
  const S = await loadSentry();
  if (!S) return;
  try {
    if (user) {
      S.setUser({ id: user.id, email: user.email, username: user.username, data: { role: user.role } });
      S.setTag("app.platform", Platform.OS);
      S.setTag("app.version", Constants.expoConfig?.version ?? "?");
    } else {
      S.setUser(null);
    }
  } catch {
    // non-fatal
  }
}

export async function captureException(error: Error, context?: Record<string, unknown>): Promise<string | undefined> {
  const S = await loadSentry();
  if (!S) return undefined;
  try {
    return S.captureException(error, context ? { contexts: { extra: context } } : undefined);
  } catch {
    return undefined;
  }
}

export async function lastEventId(): Promise<string | undefined> {
  const S = await loadSentry();
  if (!S) return undefined;
  try {
    return S.lastEventId();
  } catch {
    return undefined;
  }
}

export async function addBreadcrumb(crumb: {
  message: string;
  category?: string;
  level?: "debug" | "info" | "warning" | "error" | "fatal";
  data?: Record<string, unknown>;
}): Promise<void> {
  const S = await loadSentry();
  if (!S) return;
  try {
    S.addBreadcrumb({
      message: crumb.message,
      category: crumb.category,
      level: crumb.level,
      data: crumb.data,
    });
  } catch {
    // non-fatal
  }
}
