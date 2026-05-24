import { useState, useCallback, useRef } from "react";

export type DebugLogStatus = "success" | "fallback" | "error";

export interface DebugLogEntry {
  id: string;
  timestamp: number;
  endpoint: string;
  method: string;
  statusCode: number | null;
  durationMs: number;
  preview: string;
  status: DebugLogStatus;
  isFallback: boolean;
  missingKey: boolean;
}

function detectFallback(body: unknown, endpoint: string): boolean {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  if (endpoint.includes("ai-parse")) {
    if (!b.startLocation && !b.title) return true;
    if (b.title === "Giro in moto" && !b.startLocation) return true;
  }
  if (endpoint.includes("calculate")) {
    return ((b.distanceKm as number) ?? 0) === 0;
  }
  if (endpoint.includes("geocode")) {
    return Array.isArray(body) && body.length === 0;
  }
  return false;
}

function detectMissingKey(body: unknown, statusCode: number | null, endpoint: string): boolean {
  if (!endpoint.includes("ai-parse")) return false;
  if (statusCode === 401 || statusCode === 403) return true;
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    if (!b.startLocation && !b.title && !b.waypoints) return true;
    const errMsg = (String(b.error ?? b.message ?? "")).toLowerCase();
    if (errMsg.includes("key") || errMsg.includes("api") || errMsg.includes("quota")) return true;
  }
  return false;
}

function truncate(value: unknown, maxLen = 300): string {
  try {
    const str = typeof value === "string" ? value : JSON.stringify(value);
    return str.length > maxLen ? str.slice(0, maxLen) + "…" : str;
  } catch {
    return String(value).slice(0, maxLen);
  }
}

export function useApiDebugLog() {
  const [logs, setLogs] = useState<DebugLogEntry[]>([]);
  const counter = useRef(0);

  const clearLogs = useCallback(() => setLogs([]), []);

  const addLog = useCallback((entry: DebugLogEntry) => {
    setLogs((prev) => [entry, ...prev].slice(0, 50));
  }, []);

  /**
   * Wraps a raw fetch call to capture HTTP status code, duration, and response body.
   * Returns the parsed response body (T) and throws on network errors.
   */
  const logFetch = useCallback(
    async <T>(
      endpoint: string,
      method: string,
      fetchFn: () => Promise<Response>,
      parseFn?: (resp: Response) => Promise<T>
    ): Promise<T> => {
      const id = `${Date.now()}-${++counter.current}`;
      const t0 = Date.now();
      let statusCode: number | null = null;

      try {
        const response = await fetchFn();
        statusCode = response.status;
        const durationMs = Date.now() - t0;

        let rawText = "";
        let parsed: unknown = null;
        try {
          rawText = await response.clone().text();
          parsed = JSON.parse(rawText);
        } catch {
          parsed = rawText || null;
        }

        const isFallback = detectFallback(parsed, endpoint);
        const missingKey = detectMissingKey(parsed, statusCode, endpoint);
        let logStatus: DebugLogStatus;
        if (!response.ok) {
          logStatus = "error";
        } else if (isFallback || missingKey) {
          logStatus = "fallback";
        } else {
          logStatus = "success";
        }

        addLog({
          id, timestamp: t0,
          endpoint, method, statusCode, durationMs,
          preview: truncate(rawText),
          status: logStatus,
          isFallback, missingKey,
        });

        let result: T;
        if (parseFn) {
          result = await parseFn(response);
        } else {
          result = parsed as T;
        }
        return result;
      } catch (err: unknown) {
        const durationMs = Date.now() - t0;
        const preview = (err instanceof Error ? err.message : null) ?? String(err);
        addLog({
          id, timestamp: t0,
          endpoint, method,
          statusCode,
          durationMs,
          preview: truncate(preview),
          status: "error",
          isFallback: false,
          missingKey: statusCode === 401 || statusCode === 403,
        });
        throw err;
      }
    },
    [addLog]
  );

  return { logs, clearLogs, logFetch };
}
