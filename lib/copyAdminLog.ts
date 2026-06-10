import * as Clipboard from "expo-clipboard";

export interface CopyAdminLogPayload {
  title: string;
  overall?: string;
  durationMs?: number;
  triggeredBy?: string;
  summary?: string;
  suggestedFix?: string | null;
  aiBrief?: string | null;
  aiMeta?: { provider?: string; model?: string } | null;
  checks?: Array<{
    name: string;
    status: "ok" | "warn" | "error" | string;
    durationMs: number;
    message?: string;
  }>;
  extraLines?: string[];
}

function statusIcon(status: string): string {
  if (status === "ok" || status === "OK") return "✅";
  if (status === "warn" || status === "WARN") return "⚠️";
  return "❌";
}

export async function copyLogToClipboard(payload: CopyAdminLogPayload): Promise<boolean> {
  try {
    const lines: string[] = [];

    lines.push(`=== ${payload.title} ===`);

    if (payload.overall !== undefined) {
      const parts: string[] = [`Esito: ${payload.overall}`];
      if (payload.durationMs !== undefined) parts.push(`${payload.durationMs}ms`);
      if (payload.triggeredBy) parts.push(`trigger=${payload.triggeredBy}`);
      lines.push(parts.join(" · "));
    }

    if (payload.summary) {
      lines.push("");
      lines.push(`Summary: ${payload.summary}`);
    }

    if (payload.suggestedFix) {
      lines.push("");
      lines.push("SUGGERIMENTO:");
      lines.push(payload.suggestedFix);
    }

    if (payload.aiBrief) {
      lines.push("");
      const meta = payload.aiMeta?.provider ? ` (${payload.aiMeta.provider})` : "";
      lines.push(`REPORT AI${meta}:`);
      lines.push(payload.aiBrief);
    }

    if (payload.extraLines && payload.extraLines.length > 0) {
      lines.push("");
      for (const l of payload.extraLines) lines.push(l);
    }

    if (payload.checks && payload.checks.length > 0) {
      lines.push("");
      lines.push(`PASSI (${payload.checks.length}):`);
      for (const c of payload.checks) {
        const icon = statusIcon(c.status);
        let line = `${icon} ${c.name} (${c.durationMs}ms)`;
        if (c.message) line += ` — ${c.message}`;
        lines.push(line);
      }
    }

    await Clipboard.setStringAsync(lines.join("\n"));
    return true;
  } catch {
    return false;
  }
}
