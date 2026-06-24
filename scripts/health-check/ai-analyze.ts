// Task #4825 — Analisi AI del report Health Check. Usa la cascade provider esistente
// (costo zero: Ollama/Groq/Gemini gratis) con override del provider scelto dall'admin.
import { runWithFallback, type ResolveOpts } from "../../server/ai/moderation/provider";
import { generateText } from "ai";
import type { AiProviderChoice, CheckResult, HealthCheckReport } from "./types";

function mapProvider(choice: AiProviderChoice | null): ResolveOpts {
  switch (choice) {
    case "ollama":
      // Ollama-first, niente skip: resta self-hosted con fallback cloud se offline.
      return { role: "brain", skipOllama: false };
    case "gemini":
      return { role: "brain", preferredProvider: "google", skipOllama: true };
    case "groq":
      return { role: "brain", preferredProvider: "groq", skipOllama: true };
    case "openai":
      return { role: "brain", preferredProvider: "openai", skipOllama: true };
    default:
      return { role: "brain", skipOllama: false };
  }
}

function allFindings(report: HealthCheckReport): CheckResult[] {
  const all: CheckResult[] = [];
  for (const c of report.checkers) all.push(...c.results);
  return all;
}

function topFindings(report: HealthCheckReport, limit: number): CheckResult[] {
  const all = allFindings(report);
  const order: Record<string, number> = { critical: 0, warning: 1, info: 2 };
  all.sort((a, b) => order[a.severity] - order[b.severity]);
  return all.slice(0, limit);
}

function buildAnalysisPrompt(report: HealthCheckReport): string {
  const findings = topFindings(report, 40);
  const lines = findings.map((f, i) => {
    const loc = f.file ? `${f.file}${f.line ? `:${f.line}` : ""}` : "(globale)";
    return `${i + 1}. [${f.severity}] ${f.checkId} @ ${loc} — ${f.description}${f.evidence ? `\n   evidenza: ${f.evidence}` : ""}`;
  });
  return [
    `Sei un revisore di codice senior per BikerLink (Expo + Express + Drizzle/Postgres).`,
    `È stato eseguito un Health Check automatico. Riepilogo: ${report.summary.critical} critici, ${report.summary.warning} warning, ${report.summary.info} info.`,
    ``,
    `Problemi rilevati (deterministici, NON inventarne altri):`,
    lines.join("\n"),
    ``,
    `Fornisci un'analisi sintetica in italiano: priorità, cause probabili e passi consigliati. NON scrivere diff completi, solo indicazioni.`,
    `Rispondi in italiano, in Markdown, conciso e azionabile.`,
  ].join("\n");
}

export async function analyzeReport(
  report: HealthCheckReport,
): Promise<{ markdown: string; provider: string }> {
  const opts = mapProvider(report.aiProvider);
  const prompt = buildAnalysisPrompt(report);
  const { value, model } = await runWithFallback(opts, (m) =>
    generateText({ model: m.model, prompt, temperature: 0.2 }),
  );
  return { markdown: value.text, provider: `${model.providerName}/${model.modelId}` };
}

// ─── Fix mode: diff per-anomalia (una proposta per OGNI problema) ───────────────

function buildFixPrompt(items: CheckResult[]): string {
  const lines = items.map((f, i) => {
    const loc = f.file ? `${f.file}${f.line ? `:${f.line}` : ""}` : "(globale)";
    const tag = f.safeFix ? "sicuro/meccanico" : "richiede revisione";
    return `#${i} [${tag}]: [${f.checkId}] @ ${loc} — ${f.description}${f.evidence ? `\n   evidenza:\n   ${f.evidence}` : ""}`;
  });
  return [
    `Sei un revisore di codice senior per BikerLink (Expo + Express + Drizzle/Postgres).`,
    `Per OGNI problema qui sotto proponi una correzione concreta come diff unificato (old→new).`,
    `La gravità e la classificazione sicuro/revisione sono GIÀ decise in modo deterministico: NON rivalutarle e NON aggiungere problemi nuovi.`,
    `Il tag [richiede revisione] indica solo che la patch va validata da un umano: proponi comunque il diff come suggerimento di partenza.`,
    ``,
    `Problemi:`,
    lines.join("\n"),
    ``,
    `Rispondi SOLO con un array JSON valido, senza testo extra, nella forma:`,
    `[{"index": <numero #>, "diff": "<diff unificato o frammento old→new>"}]`,
    `Includi solo gli index per cui hai una correzione concreta. Niente Markdown attorno al JSON.`,
  ].join("\n");
}

function parseFixJson(text: string): Array<{ index: number; diff: string }> {
  let t = text.trim();
  // Rimuovi eventuali fence ```json ... ```
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const start = t.indexOf("[");
  const end = t.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return [];
  try {
    const parsed = JSON.parse(t.slice(start, end + 1)) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: Array<{ index: number; diff: string }> = [];
    for (const r of parsed) {
      const o = r as { index?: unknown; diff?: unknown };
      if (typeof o.index === "number" && typeof o.diff === "string" && o.diff.trim()) {
        out.push({ index: o.index, diff: o.diff });
      }
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Genera un diff AI per OGNI problema trovato (prioritizzato per gravità, con un
 * cap per contenere il costo) e lo attacca (aiDiff) ai CheckResult del report.
 * La classificazione sicuro/revisione resta deterministica: l'AI propone solo la
 * patch, non rivaluta la sicurezza. Una sola chiamata AI (batch). Ritorna
 * provider+conteggio dei diff applicati.
 */
export async function proposeFixes(
  report: HealthCheckReport,
): Promise<{ provider: string; applied: number }> {
  const findings = topFindings(report, 40);
  if (findings.length === 0) return { provider: "n/d", applied: 0 };
  const opts = mapProvider(report.aiProvider);
  const prompt = buildFixPrompt(findings);
  const { value, model } = await runWithFallback(opts, (m) =>
    generateText({ model: m.model, prompt, temperature: 0.1 }),
  );
  const fixes = parseFixJson(value.text);
  let applied = 0;
  for (const fx of fixes) {
    const target = findings[fx.index];
    if (target) {
      target.aiDiff = fx.diff;
      applied++;
    }
  }
  return { provider: `${model.providerName}/${model.modelId}`, applied };
}
