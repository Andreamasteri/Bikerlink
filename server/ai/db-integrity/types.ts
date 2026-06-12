// Task #2536 — Tipi condivisi per il motore DB Integrity.
import { z } from "zod";

export type Severity = "low" | "medium" | "high" | "critical";
export type Cost = "cheap" | "medium" | "expensive";
export type Category =
  | "orphans" | "invalid-states" | "jsonb-shapes" | "counters"
  | "logical-fks" | "embeddings" | "cross-table" | "time" | "duplicates"
  | "schema-registry";

export type AutoFixKind =
  | "delete-orphan-log"     // delete da tabella log-only (whitelist)
  | "recompute-counter"     // UPDATE colonna contatore con valore ricalcolato
  | "backfill-updated-at"   // UPDATE updated_at = created_at
  | "normalize-enum"        // UPDATE colonna verso valore valido (mapping 1:1)
  | "mark-stale"            // SET flag stale=true (non distruttivo)
  | "enqueue-embedding-backfill"; // enqueue su bullmq

export interface ViolationSampleRow {
  pk?: string;
  data: Record<string, unknown>;
}

export interface CheckResult {
  ok: boolean;
  count: number;                      // numero righe in violazione
  sample: ViolationSampleRow[];       // max 10 righe campione
  details?: Record<string, unknown>;
}

export interface AutoFixResult {
  applied: boolean;
  affected: number;
  summary: string;
  details?: Record<string, unknown>;
}

export interface IntegrityCheckContext {
  dryRun: boolean;
}

export interface IntegrityCheck {
  id: string;                          // stable id, kebab-case (es. "orphans/match-feedback")
  name: string;                        // human-readable
  category: Category;
  severity: Severity;
  cost: Cost;
  description: string;
  expensive?: boolean;                 // true → solo nel run settimanale
  /** Eseguito sempre. Deve sopravvivere a tabelle mancanti (defensive). */
  query(ctx: IntegrityCheckContext): Promise<CheckResult>;
  /** Opzionale: auto-fix safe. Se assente → solo proposte AI. */
  autofix?: {
    kind: AutoFixKind;
    safe: boolean;                     // se true → eseguito in auto dal cron
    /** Operazione SQL effettuata dall'autofix — usata dal framework per
     *  enforcement allow-list (DELETE_SAFE_TABLES / UPDATE_SAFE_TABLES). */
    operation: "delete" | "update" | "enqueue" | "noop";
    /** Tabelle target dell'autofix (per validazione allow-list). Vuoto = "enqueue". */
    targetTables: string[];
    run(ctx: IntegrityCheckContext): Promise<AutoFixResult>;
  };
  /** Hint passato all'AI explainer per contestualizzare la diagnosi. */
  explainHint?: string;
}

// Schema Zod per output AI explainer (validato runtime).
// NOTA: sql usa .nullable() (non .optional()) per compatibilità con OpenAI/Gemini
// strict json_schema mode — tutti i campi devono essere in "required". Il consumer
// usa if (value.sql) che gestisce correttamente sia null che undefined.
export const aiExplainSchema = z.object({
  rootCause: z.string().min(1).max(800),
  blastRadius: z.string().min(1).max(500),
  proposedFix: z.enum(["sql", "script", "manual"]),
  sql: z.string().max(4000).nullable(),
  reasoning: z.string().min(1).max(2000),
  risk: z.enum(["low", "medium", "high"]),
});
export type AiExplain = z.infer<typeof aiExplainSchema>;

export interface ViolationRecord {
  id: string;
  runId: string;
  checkId: string;
  checkName: string;
  severity: Severity;
  category: Category;
  count: number;
  sample: ViolationSampleRow[];
  details?: Record<string, unknown> | null;
  hash: string;
  status: "open" | "auto_fixed" | "manual_pending" | "resolved" | "ignored";
  autoFixApplied: boolean;
  autoFixSummary?: string | null;
  aiExplain?: (AiExplain & { modelUsed?: string }) | null;
  aiExplainCostUsd: number;
  createdAt: string;
  resolvedAt?: string | null;
}

export interface RunSummary {
  id: string;
  runAt: string;
  durationMs: number;
  trigger: string;
  expensive: boolean;
  checksRun: number;
  violationsFound: number;
  autoFixed: number;
  manualPending: number;
  byCategory: Record<Category, number>;
  bySeverity: Record<Severity, number>;
  health: "green" | "yellow" | "orange" | "red";
}
