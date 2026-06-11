// Task #2537 — Tipi condivisi per il motore App Integrity (generalizzazione #2536).
import { z } from "zod";

export type Family =
  | "code" | "api" | "ui" | "i18n" | "config"
  | "assets" | "deps" | "env" | "workflows";
export type Severity = "low" | "medium" | "high" | "critical";
export type Cost = "cheap" | "medium" | "expensive";

export const ALL_FAMILIES: Family[] = [
  "code", "api", "ui", "i18n", "config", "assets", "deps", "env", "workflows",
];

export interface ViolationSampleRow {
  pk?: string;
  data: Record<string, unknown>;
}
export interface CheckResult {
  ok: boolean;
  count: number;
  sample: ViolationSampleRow[];
  details?: Record<string, unknown>;
}
export interface AutoFixResult {
  applied: boolean;
  affected: number;
  summary: string;
  details?: Record<string, unknown>;
}
export interface CheckContext {
  dryRun: boolean;
  projectRoot: string;
}

export type AutofixOperation =
  | "modify-file" | "delete-file" | "create-file"
  | "rewrite-file" | "noop" | "enqueue";

export interface AppIntegrityCheck {
  id: string;
  family: Family;
  name: string;
  severity: Severity;
  cost: Cost;
  description: string;
  expensive?: boolean;
  query(ctx: CheckContext): Promise<CheckResult>;
  autofix?: {
    kind: string;
    safe: boolean;
    operation: AutofixOperation;
    /** File path target (per quarantena / diff preview). */
    targetPaths: string[];
    run(ctx: CheckContext): Promise<AutoFixResult>;
  };
  explainHint?: string;
}

export const aiExplainSchema = z.object({
  rootCause: z.string().min(1).max(800),
  blastRadius: z.string().min(1).max(500),
  proposedFix: z.enum(["code-edit", "config-edit", "manual", "delete-file"]),
  diff: z.string().max(6000).optional(),
  reasoning: z.string().min(1).max(2000),
  risk: z.enum(["low", "medium", "high"]),
  extractedFunctionName: z.string().max(120).optional(),
});
export type AiExplain = z.infer<typeof aiExplainSchema>;

export interface RunSummary {
  id: string;
  runAt: string;
  durationMs: number;
  trigger: string;
  expensive: boolean;
  family: string;
  checksRun: number;
  violationsFound: number;
  autoFixed: number;
  autoResolved: number;
  manualPending: number;
  byFamily: Record<Family, number>;
  bySeverity: Record<Severity, number>;
  health: "green" | "yellow" | "orange" | "red";
}
