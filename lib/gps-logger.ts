import { Platform } from "react-native";
import { getApiUrl } from "@/lib/query-client";

export async function logGpsError(
  error: unknown,
  context: string,
  extras?: {
    speedKmh?: number;
    routeId?: string;
  }
): Promise<void> {
  try {
    const err = error instanceof Error ? error : new Error(String(error));
    const payload = {
      errorMessage: err.message || String(error),
      stackTrace: err.stack || null,
      timestamp: new Date().toISOString(),
      platform: Platform.OS,
      osVersion: String(Platform.Version),
      context,
      speedKmh: extras?.speedKmh ?? null,
      routeId: extras?.routeId ?? null,
    };
    fetch(new URL("/api/errors", getApiUrl()).toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => {
      // no-op: error reporting best-effort
    });
  } catch {
    // no-op: general safety for error reporting
  }
}
