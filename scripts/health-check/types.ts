// Task #4825 — Health Check "Scan": tipi condivisi tra runner, checker e route.

export type Severity = "critical" | "warning" | "info";

export interface CheckResult {
  checkId: string; // "TC-001", "LG-012", ...
  category: string; // "typecheck" | "logic" | ...
  severity: Severity;
  file?: string;
  line?: number;
  column?: number;
  description: string;
  evidence?: string; // snippet codice o valore trovato
  /** Deterministico — true = fix additivo/meccanico, false = revisione richiesta. */
  safeFix?: boolean;
  /** Diff old→new proposto dall'AI (solo fix mode, solo per i fix sicuri). */
  aiDiff?: string;
}

export interface CheckerResult {
  id: string;
  status: "ok" | "skipped" | "error";
  durationMs: number;
  error?: string;
  results: CheckResult[];
}

export interface Checker {
  id: string; // "01-typecheck"
  label: string;
  category: string;
  run(): Promise<CheckResult[]>;
}

export type AiProviderChoice = "ollama" | "groq" | "gemini" | "openai";

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
  /** Markdown analysis prodotta dall'AI (può arrivare in async). */
  aiAnalysis?: string | null;
  aiAnalysisStatus?: "pending" | "done" | "skipped" | "error";
  aiAnalysisProvider?: string | null;
  aiAnalysisError?: string | null;
}
