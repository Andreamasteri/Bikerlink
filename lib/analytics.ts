import { apiRequest } from "@/lib/query-client";

/**
 * Fire-and-forget client analytics tracker.
 *
 * Posts an event to /api/analytics/events. Never throws upstream:
 * a failed analytics insert should never break the UX.
 */
export function trackEvent(
  name: string,
  payload?: Record<string, unknown>
): void {
  if (!name || typeof name !== "string") return;
  const body: Record<string, unknown> = { name };
  if (payload && typeof payload === "object") {
    body.payload = payload;
  }
  apiRequest("POST", "/api/analytics/events", body).catch((err) => {
    if (__DEV__) {
      console.warn("[analytics] trackEvent failed (non-blocking):", err?.message ?? err);
    }
  });
}
