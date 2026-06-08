export interface TelemetryErrorEntry {
  ts: string;
  type: "ERROR" | "WARN" | "INFO";
  context: string;
  message: string;
  userId?: string | number;
  sessionId?: string;
  detail?: string;
}

const MAX_ENTRIES = 200;
const _log: TelemetryErrorEntry[] = [];

export function logTelemetryEvent(entry: TelemetryErrorEntry): void {
  _log.push(entry);
  if (_log.length > MAX_ENTRIES) {
    _log.shift();
  }
  const label = entry.type === "ERROR" ? "ERR" : entry.type === "WARN" ? "WRN" : "INF";
  const who = entry.userId != null ? ` uid=${entry.userId}` : "";
  const sid = entry.sessionId ? ` sid=${entry.sessionId}` : "";
  const detail = entry.detail ? ` | ${entry.detail.slice(0, 200)}` : "";
  console.log(`[TELEMETRY-DIAG][${label}][${entry.context}]${who}${sid} ${entry.message}${detail}`);
}

export function getTelemetryErrorLog(): TelemetryErrorEntry[] {
  return [..._log].reverse();
}
