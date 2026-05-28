// Task #2657 — Audit query + export URL builder.
import { useQuery } from "@tanstack/react-query";
import { apiRequest, getApiUrl } from "@/lib/query-client";

export interface AuditFilters {
  ai?: string;
  type?: string;
  severity?: "debug" | "info" | "warn" | "critical";
  kind?: "event" | "decision" | "all";
  correlationId?: string;
  from?: string;
  to?: string;
  limit?: number;
}

export interface AuditRow {
  kind: "event" | "decision";
  id: string;
  aiName: string;
  type: string;
  severity?: string;
  payload?: unknown;
  createdAt: string;
  correlationId?: string | null;
}

function qs(f: AuditFilters): string {
  const p = new URLSearchParams();
  if (f.ai) p.set("ai", f.ai);
  if (f.type) p.set("type", f.type);
  if (f.severity) p.set("severity", f.severity);
  if (f.kind) p.set("kind", f.kind);
  if (f.correlationId) p.set("correlationId", f.correlationId);
  if (f.from) p.set("from", f.from);
  if (f.to) p.set("to", f.to);
  if (f.limit) p.set("limit", String(f.limit));
  return p.toString();
}

export function useAiAudit(f: AuditFilters) {
  return useQuery<{ rows: AuditRow[]; count: number }>({
    queryKey: ["/api/admin/ai/audit", f],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/admin/ai/audit?${qs(f)}`);
      return res.json();
    },
    refetchInterval: 15_000,
  });
}

export function auditExportUrl(f: AuditFilters, format: "csv" | "ndjson" | "json"): string {
  const p = qs(f);
  return `${getApiUrl().replace(/\/+$/, "")}/api/admin/ai/audit?${p}${p ? "&" : ""}format=${format}`;
}
