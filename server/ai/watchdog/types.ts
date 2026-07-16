// Task #2533 — Tipi condivisi per AI System Watchdog.
import { z } from "zod";

export type HealthStatus = "green" | "yellow" | "orange" | "red";
export type Severity = "info" | "warn" | "high" | "critical";
export type SignalSource = "bullmq" | "scheduler" | "db" | "dragonfly" | "latency" | "error" | "app" | "maps" | "embedding" | "horus" | "ai_hub" | "tc";

export interface Signal {
  source: SignalSource;
  metric: string;
  value?: number | null;
  unit?: string | null;
  severity: Severity;
  details?: Record<string, unknown> | null;
}

export interface Problem {
  id: string;          // stable id per dedupe (es. "queue.matching.waiting_high")
  severity: Severity;
  source: SignalSource;
  title: string;
  detail?: string;
  suggestion?: string;
}

export interface HealthSnapshot {
  status: HealthStatus;
  score: number; // 0..100
  problems: Problem[];
  metrics: Record<string, number>;
  generatedAt: string;
}

export type AutoFixResult =
  | { applied: true; summary: string; details?: Record<string, unknown> }
  | { applied: false; reason: string };

export interface AutoFixRule {
  id: string;
  description: string;
  // Esegue se applicabile; idempotente. Ritorna sempre, mai throw.
  run(snapshot: HealthSnapshot): Promise<AutoFixResult>;
}

export const proposalSchema = z.object({
  title: z.string().max(120),
  reasoning: z.string().max(800),
  riskLevel: z.enum(["low", "medium", "high"]),
  action: z.object({
    kind: z.enum([
      "restart_worker", "clear_cache", "scale_concurrency",
      "rerun_job", "rebuild_index", "rotate_secret", "manual_only",
    ]),
    target: z.string().max(120).nullable(),
    // JSON string (es. '{"timeoutMs":5000}'); object aperto/catchall non è
    // compatibile con lo strict mode OpenAI/Groq (richiede additionalProperties:false).
    params: z.string().max(2000).nullable(),
  }),
  affectedComponents: z.array(z.string().max(80)).max(10),
  rollbackHint: z.string().max(300).nullable(),
});
export type Proposal = z.infer<typeof proposalSchema>;

export const weeklyReportSchema = z.object({
  period: z.object({ from: z.string(), to: z.string() }),
  overallStatus: z.enum(["green", "yellow", "orange", "red"]),
  highlights: z.array(z.string().max(280)).max(8),
  incidents: z.array(z.object({
    when: z.string(),
    title: z.string().max(160),
    severity: z.enum(["warn", "high", "critical"]),
    resolved: z.boolean(),
  })).max(20),
  metricsSummary: z.object({
    avgLatencyMs: z.number().nullable(),
    errorsCount: z.number(),
    autoFixApplied: z.number(),
    proposalsAccepted: z.number(),
    proposalsRejected: z.number(),
  }),
  recommendations: z.array(z.string().max(240)).max(6),
  conclusion: z.string().max(500),
});
export type WeeklyReport = z.infer<typeof weeklyReportSchema>;
