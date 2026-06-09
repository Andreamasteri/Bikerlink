/**
 * In-memory ring buffer for matching/scheduler log events.
 * Captured explicitly at key cycle events AND via hookPinoLogger()
 * which taps any pino child logger to capture all log events automatically.
 * Read by /api/admin/matching/logs.
 */

export type MatchLogLevel = "INFO" | "WARN" | "ERROR";

export interface MatchLogEntry {
  id: string;
  timestamp: string;
  level: MatchLogLevel;
  phase: string;
  message: string;
  errorId?: string | null;
  extra?: Record<string, unknown>;
}

const MAX_ENTRIES = 300;
const buffer: MatchLogEntry[] = [];
let _seq = 0;

function nextId(): string {
  return `ml-${Date.now()}-${++_seq}`;
}

export function addMatchLog(
  level: MatchLogLevel,
  phase: string,
  message: string,
  extra?: Record<string, unknown>,
  errorId?: string | null,
): void {
  const entry: MatchLogEntry = {
    id: nextId(),
    timestamp: new Date().toISOString(),
    level,
    phase,
    message,
    errorId: errorId ?? null,
    extra: extra ?? undefined,
  };
  buffer.push(entry);
  if (buffer.length > MAX_ENTRIES) buffer.shift();
}

export function getMatchLogs(opts?: {
  level?: "warn" | "error" | "all";
  limit?: number;
}): MatchLogEntry[] {
  const filterLevel = opts?.level ?? "all";
  const limit = Math.min(opts?.limit ?? 100, MAX_ENTRIES);

  let result = buffer.slice();
  if (filterLevel === "warn") {
    result = result.filter((e) => e.level === "WARN" || e.level === "ERROR");
  } else if (filterLevel === "error") {
    result = result.filter((e) => e.level === "ERROR");
  }

  return result.slice(-limit).reverse();
}

export function getRecentErrorCount(windowMs = 5 * 60 * 1000): number {
  const cutoff = Date.now() - windowMs;
  return buffer.filter(
    (e) => e.level === "ERROR" && new Date(e.timestamp).getTime() > cutoff,
  ).length;
}

// ---------------------------------------------------------------------------
// Logger hook — taps a pino child logger so every log event also lands in the
// ring buffer.  This broadens log coverage beyond the explicit addMatchLog()
// calls scattered through scheduler.ts.
// ---------------------------------------------------------------------------

function _extractMsg(args: unknown[]): string | null {
  if (typeof args[0] === "string") return args[0];
  if (typeof args[1] === "string") return args[1];
  return null;
}

/** One-time call per logger. Monkey-patches info/warn/error methods. */
export function hookPinoLogger(
  pinoLogger: { info: unknown; warn: unknown; error: unknown },
  scope: string,
): void {
  // Bind originals to the logger instance so pino's internal `this[writeSym]`
  // reference is preserved when the wrapper delegates back to them.
  const origInfo = (pinoLogger.info as (...a: unknown[]) => void).bind(pinoLogger);
  const origWarn = (pinoLogger.warn as (...a: unknown[]) => void).bind(pinoLogger);
  const origError = (pinoLogger.error as (...a: unknown[]) => void).bind(pinoLogger);

  (pinoLogger as Record<string, unknown>).info = (...args: unknown[]) => {
    const msg = _extractMsg(args);
    if (msg) addMatchLog("INFO", scope, msg.slice(0, 200));
    origInfo(...args);
  };
  (pinoLogger as Record<string, unknown>).warn = (...args: unknown[]) => {
    const msg = _extractMsg(args);
    if (msg) addMatchLog("WARN", scope, msg.slice(0, 200));
    origWarn(...args);
  };
  (pinoLogger as Record<string, unknown>).error = (...args: unknown[]) => {
    const msg = _extractMsg(args);
    if (msg) addMatchLog("ERROR", scope, msg.slice(0, 200));
    origError(...args);
  };
}
