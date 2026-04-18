import { Platform } from "react-native";
import { CURRENT_OTA_NUMBER } from "@/lib/ota";
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
      otaNumber: CURRENT_OTA_NUMBER,
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
    }).catch(() => {});
  } catch {}
}
