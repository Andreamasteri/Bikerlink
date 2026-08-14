import { createHash } from "crypto";

/**
 * Stable identity for watchdog events.
 *
 * Summary/details are intentionally excluded: collectors often add timestamps,
 * counters, or diagnostic payloads to the same underlying event.
 */
export function buildWatchdogEventKey(
  kind: string,
  scope?: string | null,
  explicitKey?: string | null,
): string {
  const value = explicitKey?.trim() || `${kind}:${scope?.trim() || "global"}`;
  // Truncating would merge different long identities. Keep a readable prefix
  // and append a digest so uniqueness remains stable without storing details.
  if (value.length <= 180) return value;
  const digest = createHash("sha256").update(value).digest("hex");
  return `${value.slice(0, 115)}:${digest}`;
}
