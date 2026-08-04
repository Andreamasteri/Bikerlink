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
  return value.slice(0, 180);
}
