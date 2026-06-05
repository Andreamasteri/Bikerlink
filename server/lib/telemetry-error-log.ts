export interface TelemetryErrorEntry {
  ts: string;
  type: "ERROR" | "WARN" | "INFO";
  context: string;
  message: string;
  userId?: string | number;
  sessionId?: string;
  detail?: string;
}

const MAX_ENTRIES = 100;
const _log: TelemetryErrorEntry[] = [];

export function logTelemetryEvent(entry: TelemetryErrorEntry): void {
  _log.push(entry);
  if (_log.length > MAX_ENTRIES) {
    _log.shift();
  }
}

export function getTelemetryErrorLog(): TelemetryErrorEntry[] {
  return [..._log].reverse();
}
