// Task #2536 — AI explainer per violazioni DB integrity.
// Riusa runWithFallback (#2532) + budget shared. Output Zod-validato.
// Cache in-memory per (checkId, violationHash) per non ripagare per la stessa cosa.
import { runWithFallback, estimateCostUsd, generateStructured } from "../moderation/provider";
import { withBudget, addCost } from "../moderation/budget";
import { aiExplainSchema, type AiExplain, type IntegrityCheck, type ViolationSampleRow } from "./types";

const cache = new Map<string, { value: AiExplain & { modelUsed: string }; costUsd: number; at: number }>();
const CACHE_TTL_MS = 24 * 60 * 60_000;

function cacheKey(checkId: string, hash: string): string {
  return `${checkId}::${hash}`;
}

export async function explainViolation(params: {
  check: IntegrityCheck;
  hash: string;
  count: number;
  sample: ViolationSampleRow[];
  details?: Record<string, unknown> | null;
}): Promise<{ ok: true; value: AiExplain & { modelUsed: string }; costUsd: number; cached: boolean } | { ok: false; reason: string }> {
  const key = cacheKey(params.check.id, params.hash);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return { ok: true, value: cached.value, costUsd: cached.costUsd, cached: true };
  }

  const prompt = buildPrompt(params);
  try {
    const out = await withBudget("triage", async () => {
      const { value, model } = await runWithFallback({ role: "brain" }, async (m) => {
        const result = await generateStructured(m, {
          schema: aiExplainSchema,
          prompt,
          temperature: 0.2,
        });
        // Cost tracking.
        const tokensIn = result.usage?.inputTokens ?? Math.ceil(prompt.length / 4);
        const tokensOut = result.usage?.outputTokens ?? 400;
        const cost = estimateCostUsd(m.modelId, tokensIn, tokensOut);
        await addCost(cost);
        return { object: result.object as AiExplain, modelId: m.modelId, cost };
      });
      return { ...value, providerName: model.providerName };
    });
    const valueOut = { ...out.object, modelUsed: out.modelId } as AiExplain & { modelUsed: string };
    cache.set(key, { value: valueOut, costUsd: out.cost, at: Date.now() });
    return { ok: true, value: valueOut, costUsd: out.cost, cached: false };
  } catch (err) {
    return { ok: false, reason: (err as Error).message?.slice(0, 300) ?? "ai-error" };
  }
}

function buildPrompt(p: {
  check: IntegrityCheck;
  count: number;
  sample: ViolationSampleRow[];
  details?: Record<string, unknown> | null;
}): string {
  const sampleStr = JSON.stringify(p.sample.slice(0, 5), null, 2).slice(0, 4000);
  const detailsStr = p.details ? JSON.stringify(p.details).slice(0, 1500) : "(nessun dettaglio)";
  return [
    "Sei un esperto di integrità database PostgreSQL per l'app BikerLink.",
    "Analizza la violazione qui sotto e produci una diagnosi strutturata in italiano.",
    "",
    `## Check`,
    `id: ${p.check.id}`,
    `nome: ${p.check.name}`,
    `categoria: ${p.check.category}`,
    `severity: ${p.check.severity}`,
    `descrizione: ${p.check.description}`,
    p.check.explainHint ? `hint: ${p.check.explainHint}` : "",
    "",
    `## Statistiche`,
    `righe in violazione: ${p.count}`,
    `dettagli: ${detailsStr}`,
    "",
    `## Sample (max 5 righe)`,
    "```json",
    sampleStr,
    "```",
    "",
    "## Output richiesto",
    "Compila i campi dello schema. Il campo `sql` deve contenere un singolo statement UPDATE/DELETE con WHERE esplicito",
    "quando proposedFix è 'sql'. Imposta sql: null (non omettere il campo) se la riparazione richiede uno script di codice o intervento manuale.",
    "MAI usare DROP, TRUNCATE, ALTER, CREATE, GRANT, REVOKE — verranno rifiutati dalla safety guard.",
    "MAI eseguire UPDATE/DELETE senza WHERE.",
  ].filter(Boolean).join("\n");
}

export function clearExplainCache(): void { cache.clear(); }
