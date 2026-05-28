// Task #2649 — Audit log unificato (eventi + decisioni) + export CSV/NDJSON.
import { and, desc, eq, gte, lte, sql, type SQL } from "drizzle-orm";
import type { Response } from "express";
import { db } from "../../db";
import { aiDecisions, aiEvents } from "@shared/db";
import { SEVERITIES, type Severity } from "./types";

// Per kind="all" usiamo una UNION ALL a livello DB con ORDER BY/LIMIT/OFFSET
// globali, così la paginazione è corretta (non per-tabella).
interface UnionRow {
  id: string;
  kind: "event" | "decision";
  ai_name: string;
  type: string;
  severity: string | null;
  payload: unknown;
  decision_input: unknown;
  decision_output: unknown;
  rationale: string | null;
  confidence: string | null;
  took_ms: number | null;
  correlation_id: string | null;
  created_at: Date | string;
}

export interface AuditFilters {
  aiName?: string;
  type?: string;       // matcha eventType OR decisionType
  severity?: Severity; // applicato solo agli eventi
  from?: Date;
  to?: Date;
  kind?: "event" | "decision" | "all";
  limit?: number;
  offset?: number;
  correlationId?: string;
}

export interface AuditRow {
  id: string;
  kind: "event" | "decision";
  aiName: string;
  type: string;
  severity: Severity | null;
  payload: Record<string, unknown> | null;
  decisionInput: Record<string, unknown> | null;
  decisionOutput: Record<string, unknown> | null;
  rationale: string | null;
  confidence: number | null;
  tookMs: number | null;
  correlationId: string | null;
  createdAt: string;
}

export async function queryAudit(f: AuditFilters): Promise<{ rows: AuditRow[]; limit: number; offset: number }> {
  const limit = Math.min(1000, Math.max(1, f.limit ?? 100));
  const offset = Math.max(0, f.offset ?? 0);
  const kind = f.kind ?? "all";

  if (kind === "event") {
    const conds: SQL[] = [];
    if (f.aiName) conds.push(eq(aiEvents.aiName, f.aiName));
    if (f.type) conds.push(eq(aiEvents.eventType, f.type));
    if (f.severity && SEVERITIES.includes(f.severity)) conds.push(eq(aiEvents.severity, f.severity));
    if (f.correlationId) conds.push(eq(aiEvents.correlationId, f.correlationId));
    if (f.from) conds.push(gte(aiEvents.createdAt, f.from));
    if (f.to) conds.push(lte(aiEvents.createdAt, f.to));
    const where = conds.length ? and(...conds) : undefined;
    const r = await db.select().from(aiEvents).where(where)
      .orderBy(desc(aiEvents.createdAt)).limit(limit).offset(offset);
    return { rows: r.map(mapEvent), limit, offset };
  }

  if (kind === "decision") {
    const conds: SQL[] = [];
    if (f.aiName) conds.push(eq(aiDecisions.aiName, f.aiName));
    if (f.type) conds.push(eq(aiDecisions.decisionType, f.type));
    if (f.correlationId) conds.push(eq(aiDecisions.correlationId, f.correlationId));
    if (f.from) conds.push(gte(aiDecisions.createdAt, f.from));
    if (f.to) conds.push(lte(aiDecisions.createdAt, f.to));
    const where = conds.length ? and(...conds) : undefined;
    const r = await db.select().from(aiDecisions).where(where)
      .orderBy(desc(aiDecisions.createdAt)).limit(limit).offset(offset);
    return { rows: r.map(mapDecision), limit, offset };
  }

  // kind === "all" → UNION ALL a livello DB con ORDER BY/LIMIT/OFFSET globali.
  // Severity filter, se valido, esclude tutta la branch "decision" (le
  // decisioni non hanno severity); applichiamo la stessa condizione su entrambi
  // i lati per coerenza dei filtri condivisi.
  const aiNameFilter = f.aiName ?? null;
  const typeFilter = f.type ?? null;
  const corrFilter = f.correlationId ?? null;
  const sevValid = f.severity && SEVERITIES.includes(f.severity) ? f.severity : null;
  const from = f.from ?? null;
  const to = f.to ?? null;

  const result = await db.execute(sql`
    SELECT * FROM (
      SELECT
        id,
        'event'::text AS kind,
        ai_name,
        event_type AS type,
        severity,
        payload,
        NULL::jsonb AS decision_input,
        NULL::jsonb AS decision_output,
        NULL::text AS rationale,
        NULL::numeric AS confidence,
        NULL::int AS took_ms,
        correlation_id,
        created_at
      FROM ai_events
      WHERE (${aiNameFilter}::text IS NULL OR ai_name = ${aiNameFilter})
        AND (${typeFilter}::text IS NULL OR event_type = ${typeFilter})
        AND (${sevValid}::text IS NULL OR severity = ${sevValid})
        AND (${corrFilter}::text IS NULL OR correlation_id = ${corrFilter})
        AND (${from}::timestamp IS NULL OR created_at >= ${from})
        AND (${to}::timestamp IS NULL OR created_at <= ${to})
      UNION ALL
      SELECT
        id,
        'decision'::text AS kind,
        ai_name,
        decision_type AS type,
        NULL::varchar AS severity,
        NULL::jsonb AS payload,
        input AS decision_input,
        output AS decision_output,
        rationale,
        confidence,
        took_ms,
        correlation_id,
        created_at
      FROM ai_decisions
      WHERE ${sevValid}::text IS NULL
        AND (${aiNameFilter}::text IS NULL OR ai_name = ${aiNameFilter})
        AND (${typeFilter}::text IS NULL OR decision_type = ${typeFilter})
        AND (${corrFilter}::text IS NULL OR correlation_id = ${corrFilter})
        AND (${from}::timestamp IS NULL OR created_at >= ${from})
        AND (${to}::timestamp IS NULL OR created_at <= ${to})
    ) u
    ORDER BY created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `);
  const raw = (result as unknown as { rows?: UnionRow[] }).rows ?? (result as unknown as UnionRow[]);
  const rows: AuditRow[] = (raw as UnionRow[]).map((r) => ({
    id: r.id,
    kind: r.kind,
    aiName: r.ai_name,
    type: r.type,
    severity: (r.severity as Severity | null) ?? null,
    payload: (r.payload ?? null) as Record<string, unknown> | null,
    decisionInput: (r.decision_input ?? null) as Record<string, unknown> | null,
    decisionOutput: (r.decision_output ?? null) as Record<string, unknown> | null,
    rationale: r.rationale ?? null,
    confidence: r.confidence !== null && r.confidence !== undefined ? Number(r.confidence) : null,
    tookMs: r.took_ms ?? null,
    correlationId: r.correlation_id ?? null,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  }));
  return { rows, limit, offset };
}

function mapEvent(e: typeof aiEvents.$inferSelect): AuditRow {
  return {
    id: e.id,
    kind: "event",
    aiName: e.aiName,
    type: e.eventType,
    severity: e.severity as Severity,
    payload: (e.payload ?? null) as Record<string, unknown> | null,
    decisionInput: null,
    decisionOutput: null,
    rationale: null,
    confidence: null,
    tookMs: null,
    correlationId: e.correlationId ?? null,
    createdAt: e.createdAt instanceof Date ? e.createdAt.toISOString() : String(e.createdAt),
  };
}

function mapDecision(d: typeof aiDecisions.$inferSelect): AuditRow {
  return {
    id: d.id,
    kind: "decision",
    aiName: d.aiName,
    type: d.decisionType,
    severity: null,
    payload: null,
    decisionInput: (d.input ?? null) as Record<string, unknown> | null,
    decisionOutput: (d.output ?? null) as Record<string, unknown> | null,
    rationale: d.rationale ?? null,
    confidence: d.confidence !== null && d.confidence !== undefined ? Number(d.confidence) : null,
    tookMs: d.tookMs ?? null,
    correlationId: d.correlationId ?? null,
    createdAt: d.createdAt instanceof Date ? d.createdAt.toISOString() : String(d.createdAt),
  };
}

export function streamAuditAsCsv(res: Response, rows: AuditRow[]): void {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="ai-audit-${Date.now()}.csv"`);
  const header = [
    "id", "kind", "aiName", "type", "severity", "confidence", "tookMs",
    "correlationId", "createdAt", "rationale", "payload", "input", "output",
  ];
  res.write(header.join(",") + "\n");
  for (const r of rows) {
    res.write([
      csvCell(r.id),
      csvCell(r.kind),
      csvCell(r.aiName),
      csvCell(r.type),
      csvCell(r.severity ?? ""),
      csvCell(r.confidence !== null ? String(r.confidence) : ""),
      csvCell(r.tookMs !== null ? String(r.tookMs) : ""),
      csvCell(r.correlationId ?? ""),
      csvCell(r.createdAt),
      csvCell(r.rationale ?? ""),
      csvCell(JSON.stringify(r.payload ?? null)),
      csvCell(JSON.stringify(r.decisionInput ?? null)),
      csvCell(JSON.stringify(r.decisionOutput ?? null)),
    ].join(",") + "\n");
  }
  res.end();
}

export function streamAuditAsNdjson(res: Response, rows: AuditRow[]): void {
  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="ai-audit-${Date.now()}.ndjson"`);
  for (const r of rows) {
    res.write(JSON.stringify(r) + "\n");
  }
  res.end();
}

function csvCell(v: string): string {
  if (v === "") return "";
  // CSV formula-injection: neutralizza celle che iniziano con =,+,-,@,TAB,CR
  // prepending un apostrofo (Excel/Sheets non eseguono la formula).
  const first = v.charAt(0);
  const dangerous = first === "=" || first === "+" || first === "-" || first === "@" || first === "\t" || first === "\r";
  const safe = dangerous ? "'" + v : v;
  const needsQuote = safe.includes(",") || safe.includes("\"") || safe.includes("\n") || safe.includes("\r");
  const escaped = safe.replace(/"/g, '""');
  return needsQuote ? `"${escaped}"` : escaped;
}

// Helper unused-import safeguard
void sql;
