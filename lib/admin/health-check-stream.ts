// Task #4825 — Client SSE per POST /api/admin/health-check/run.
// Emette il progresso per-checker e il report finale dello scan.
import { fetch as expoFetch } from "expo/fetch";
import { getApiUrl, authFetchHeaders } from "@/lib/query-client";

export type Severity = "critical" | "warning" | "info";
export type AiProviderChoice = "ollama" | "groq" | "gemini" | "openai";

export interface CheckResult {
  checkId: string;
  category: string;
  severity: Severity;
  file?: string;
  line?: number;
  column?: number;
  description: string;
  evidence?: string;
  safeFix?: boolean;
  aiDiff?: string;
}

export interface CheckerResult {
  id: string;
  status: "ok" | "skipped" | "error";
  durationMs: number;
  error?: string;
  results: CheckResult[];
}

export interface HealthCheckSummary {
  critical: number;
  warning: number;
  info: number;
  skipped: number;
}

export interface HealthCheckReport {
  runId: string;
  runAt: string;
  durationMs: number;
  checkersRun: string[];
  mode: "analysis" | "fix";
  aiProvider: AiProviderChoice | null;
  summary: HealthCheckSummary;
  checkers: CheckerResult[];
  aiAnalysis?: string | null;
  aiAnalysisStatus?: "pending" | "done" | "skipped" | "error";
  aiAnalysisProvider?: string | null;
  aiAnalysisError?: string | null;
}

export interface RunHandlers {
  onStart?: (ev: { checkerIds: string[]; mode: string; aiProvider: AiProviderChoice | null }) => void;
  onProgress?: (ev: { checkerId: string; status: string; durationMs: number }) => void;
  onScanDone?: (report: HealthCheckReport) => void;
  onAiStart?: (ev: { provider: AiProviderChoice | null }) => void;
  onDone?: (report: HealthCheckReport) => void;
  onError?: (ev: { message: string }) => void;
  signal?: AbortSignal;
}

export interface RunRequest {
  checkerIds: string[];
  mode: "analysis" | "fix";
  aiProvider: AiProviderChoice | null;
}

export async function streamHealthCheck(req: RunRequest, handlers: RunHandlers): Promise<void> {
  const url = new URL("/api/admin/health-check/run", getApiUrl()).toString();
  const headers = authFetchHeaders({
    "Content-Type": "application/json",
    Accept: "text/event-stream",
  });

  const res = await expoFetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(req),
    credentials: "include",
    signal: handlers.signal,
  });

  if (!res.ok || !res.body) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = (await res.json()) as { message?: string };
      if (j?.message) msg = j.message;
    } catch { /* body non JSON */ }
    handlers.onError?.({ message: msg });
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
    let idx;
    while ((idx = buf.indexOf("\n\n")) >= 0) {
      const raw = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const lines = raw.split("\n");
      let evName = "message";
      let dataStr = "";
      for (const l of lines) {
        if (l.startsWith("event:")) evName = l.slice(6).trim();
        else if (l.startsWith("data:")) dataStr += l.slice(5).trim();
      }
      if (!dataStr) continue;
      let data: unknown;
      try {
        data = JSON.parse(dataStr);
      } catch {
        continue;
      }
      switch (evName) {
        case "start": handlers.onStart?.(data as never); break;
        case "progress": handlers.onProgress?.(data as never); break;
        case "scan-done": handlers.onScanDone?.(data as HealthCheckReport); break;
        case "ai-start": handlers.onAiStart?.(data as never); break;
        case "done": handlers.onDone?.(data as HealthCheckReport); break;
        case "error": handlers.onError?.(data as { message: string }); break;
        default: break;
      }
    }
  }
}
