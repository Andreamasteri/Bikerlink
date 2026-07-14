// Task #2537 — AI explain: chiede a LLM una root-cause + proposta di fix.
// Task #2966 — Migrato alla cascade condivisa (Groq→Gemini→OpenAI→Anthropic) con
// Ollama self-hosted come rete finale. Degrada in modo sicuro se nessun provider
// è disponibile.
import { generateText } from "ai";
import { runWithFallback, hasAnyAiProvider, estimateCostUsd } from "../moderation/provider";
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
  if (!hasAnyAiProvider()) {
    return { ok: false, reason: "Nessun provider AI configurato" };
  }

  const prompt = buildPrompt(input);
  try {
    const { value: r, model: usedModel } = await runWithFallback(
      { role: "brain", ollamaBackstop: true },
      (m) => m.scheduler(() => generateText({
        model: m.model,
        instructions: "Sei un Senior Software Engineer. Rispondi SOLO con JSON valido conforme allo schema richiesto. Nessun testo extra. Tutto in italiano.",
        prompt,
        maxRetries: 1,
      })),
    );
    const text: string = r.text ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { ok: false, reason: "Risposta AI senza JSON" };
    const parsed = aiExplainSchema.safeParse(JSON.parse(jsonMatch[0]));
    if (!parsed.success) return { ok: false, reason: `JSON non conforme: ${parsed.error.issues[0].message}` };
    const costUsd = estimateCostUsd(usedModel.modelId, r.usage?.inputTokens ?? 0, r.usage?.outputTokens ?? 0);
    const modelUsed = `${usedModel.providerName}/${usedModel.modelId}`;
    console.log(`[integrity-explain] risposta da ${modelUsed}`);
    return { ok: true, value: parsed.data, costUsd, cached: false, modelUsed };
  } catch (err) {
    return { ok: false, reason: (err as Error).message?.slice(0, 200) ?? "errore sconosciuto" };
  }
}

function buildPrompt(input: ExplainInput): string {
  const { check, count, sample, details } = input;

  // For duplication violations, collect suggested_extract paths from the sample
  // so the AI can propose a concrete function/hook name alongside the file path.
  const extractLines: string[] = [];
  if (check.id === "code/duplication") {
    const extracts = sample
      .slice(0, 5)
      .map((s) => (s.data as Record<string, unknown>).suggested_extract)
      .filter((v): v is string => typeof v === "string" && v.length > 0);
    const unique = [...new Set(extracts)];
    if (unique.length > 0) {
      extractLines.push(
        `File di estrazione suggeriti (da sample): ${unique.join(", ")}`,
        "Proponi un nome di funzione/hook concreto (es. `formatDateRange`, `useMatchFilters`) da estrarre verso quei file. Inserisci il nome più rappresentativo in `extractedFunctionName`.",
      );
    }
  }

  return [
    `Famiglia: ${check.family}`,
    `Check: ${check.id} — ${check.name}`,
    `Severity: ${check.severity}`,
    `Descrizione: ${check.description}`,
    check.explainHint ? `Hint: ${check.explainHint}` : "",
    ...extractLines,
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
      extractedFunctionName: "string (opzionale) — nome funzione/hook da estrarre, es. formatDateRange",
    }, null, 2),
  ].filter(Boolean).join("\n");
}
