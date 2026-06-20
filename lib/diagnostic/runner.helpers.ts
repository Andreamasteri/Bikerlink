import { getApiUrl, authFetchHeaders } from "@/lib/query-client";
import type { DiagnosticStatus, DiagnosticTestResult } from "./runner";

export async function runWithTimeout<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs);
    fn().then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });
}

export async function runTest(
  section: string,
  name: string,
  fn: () => Promise<{ status: DiagnosticStatus; message?: string }>,
  timeoutMs = 8000
): Promise<DiagnosticTestResult> {
  const start = Date.now();
  try {
    const result = await runWithTimeout(fn, timeoutMs);
    return { section, name, status: result.status, message: result.message, durationMs: Date.now() - start };
  } catch (err) {
    return { section, name, status: "FAIL", message: err instanceof Error ? err.message : String(err), durationMs: Date.now() - start };
  }
}

export async function pingApi(path: string, expectArrayOrObject = false): Promise<{ status: DiagnosticStatus; message?: string }> {
  const url = new URL(path, getApiUrl()).toString();
  const res = await fetch(url, { headers: authFetchHeaders(), credentials: "include" });
  if (!res.ok) return { status: "FAIL", message: `HTTP ${res.status}` };
  if (expectArrayOrObject) {
    const data = await res.json();
    if (typeof data !== "object" || data === null) return { status: "WARN", message: "Risposta inattesa" };
  }
  return { status: "PASS" };
}
