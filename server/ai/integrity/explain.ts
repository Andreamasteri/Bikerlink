// Task #2537 — AI explain: chiede a LLM una root-cause + proposta di fix.
// Riusa il pattern di server/ai/db-integrity/explain.ts. Degrada in modo
// sicuro se la AI non è disponibile.
import { aiExplainSchema, type AppIntegrityCheck, type AiExplain, type ViolationSampleRow } from "./types";

export interface ExplainInput {
  check: AppIntegrityCheck;
  hash: string;
  count: number;
  sample: ViolationSampleRow[];
  details?: Record<string, unknown>;
}
export type ExplainOk = { ok: true; value: AiExplain; costUsd: number; cached: boolean; modelUsed: string };
export type ExplainErr = { ok: false; reason: string };

export async function explainViolation(input: ExplainInput): Promise<ExplainOk | ExplainErr> {
  if (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
    return { ok: false, reason: "Nessun API key AI configurato (OPENAI_API_KEY o ANTHROPIC_API_KEY)" };
  }
  type AiModule = {
    generateText?: (opts: unknown) => Promise<{ text?: string; usage?: { promptTokens?: number; completionTokens?: number } }>;
  };
  type ProviderFactory = (name: string) => unknown;
  const ai = (await import("ai").catch(() => null)) as AiModule | null;
  if (!ai?.generateText) return { ok: false, reason: "Pacchetto 'ai' non installato" };

  let model: unknown = null; let modelName = "";
  if (process.env.ANTHROPIC_API_KEY) {
    // @ts-expect-error optional dependency, may not be installed
    const anth = (await import("@ai-sdk/anthropic").catch(() => null)) as { anthropic?: ProviderFactory } | null;
    if (anth?.anthropic) { model = anth.anthropic("claude-sonnet-4-20250514"); modelName = "claude-sonnet-4"; }
  }
  if (!model && process.env.OPENAI_API_KEY) {
    const oai = (await import("@ai-sdk/openai").catch(() => null)) as { openai?: ProviderFactory } | null;
    if (oai?.openai) { model = oai.openai("gpt-4o-mini"); modelName = "gpt-4o-mini"; }
  }
  if (!model) return { ok: false, reason: "Nessun provider AI installato" };

  const prompt = buildPrompt(input);
  try {
    const r = await ai.generateText({
      model,
      system: "Sei un Senior Software Engineer. Rispondi SOLO con JSON valido conforme allo schema richiesto. Nessun testo extra. Tutto in italiano.",
      prompt,
      maxRetries: 1,
    });
    const text: string = r.text ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { ok: false, reason: "Risposta AI senza JSON" };
    const parsed = aiExplainSchema.safeParse(JSON.parse(jsonMatch[0]));
    if (!parsed.success) return { ok: false, reason: `JSON non conforme: ${parsed.error.issues[0].message}` };
    const costUsd = estimateCost(r.usage?.promptTokens ?? 0, r.usage?.completionTokens ?? 0, modelName);
    return { ok: true, value: parsed.data, costUsd, cached: false, modelUsed: modelName };
  } catch (err) {
    return { ok: false, reason: (err as Error).message?.slice(0, 200) ?? "errore sconosciuto" };
  }
}

function buildPrompt(input: ExplainInput): string {
  const { check, count, sample, details } = input;
  return [
    `Famiglia: ${check.family}`,
    `Check: ${check.id} — ${check.name}`,
    `Severity: ${check.severity}`,
    `Descrizione: ${check.description}`,
    check.explainHint ? `Hint: ${check.explainHint}` : "",
    `Conteggio violazioni: ${count}`,
    `Sample (max 5):`,
    JSON.stringify(sample.slice(0, 5), null, 2),
    details ? `Dettagli: ${JSON.stringify(details).slice(0, 600)}` : "",
    "",
    "Rispondi SOLO con JSON conforme a:",
    JSON.stringify({
      rootCause: "string",
      blastRadius: "string",
      proposedFix: "code-edit|config-edit|manual|delete-file",
      diff: "string (opzionale, max 6000 chars)",
      reasoning: "string",
      risk: "low|medium|high",
    }, null, 2),
  ].filter(Boolean).join("\n");
}

function estimateCost(promptTok: number, completionTok: number, model: string): number {
  if (model === "claude-sonnet-4") return promptTok * 3e-6 + completionTok * 15e-6;
  return promptTok * 1.5e-7 + completionTok * 6e-7;
}
