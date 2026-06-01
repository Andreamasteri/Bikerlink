// Task #2698 — Agente AI Assistant utente (streaming, scope ridotto).
// Riusa runWithFallback con gpt-4o-mini forzato. No tool calls: l'agente può
// SOLO emettere testo + righe "ACTION: {...}" che il client estrae e propone
// all'utente come azione da confermare. La whitelist server-side resta il
// vero guard contro abusi (il prompt è defense-in-depth).
import { streamText } from "ai";
import { runWithFallback, estimateCostUsd, type ResolvedModel } from "../moderation/provider";
import { buildSystemPrompt, type KnowledgeEntry } from "./knowledge";
import { getOllamaModel, isOllamaConfigured } from "../../lib/ollama-client";

const DEFAULT_MODEL_ID = "gpt-4o-mini";

export interface AssistantAgentOpts {
  message: string;
  platform: "android" | "ios" | "web";
  allowedActions: string[];
  customFaqs?: KnowledgeEntry[];
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  signal?: AbortSignal;
  onTextDelta?: (delta: string) => void;
}

export interface AssistantAgentResult {
  text: string;
  provider: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  degraded: boolean;
}

export async function runAssistantAgent(opts: AssistantAgentOpts): Promise<AssistantAgentResult> {
  const system = buildSystemPrompt({
    platform: opts.platform,
    customFaqs: opts.customFaqs,
    allowedActions: opts.allowedActions,
  });
  const messages = [
    ...(opts.history ?? []).map((m) => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: opts.message },
  ];

  let finalText = "";
  let tokensIn = 0;
  let tokensOut = 0;
  let provider = "openai";
  let modelId = DEFAULT_MODEL_ID;
  let degraded = false;

  try {
    const { model } = await runWithFallback(
      { role: "brain", forcedModelId: DEFAULT_MODEL_ID },
      async (m: ResolvedModel) => {
        const result = streamText({
          model: m.model,
          system,
          messages,
          abortSignal: opts.signal,
          temperature: 0.3,
        });
        for await (const delta of result.textStream) {
          finalText += delta;
          opts.onTextDelta?.(delta);
        }
        const usage = await result.usage;
        tokensIn = usage?.inputTokens ?? 0;
        tokensOut = usage?.outputTokens ?? 0;
        return result;
      },
    );
    provider = model.providerName;
    modelId = model.modelId;
  } catch (cloudErr) {
    // Fallback Ollama self-hosted se tutti i provider cloud mancano/falliscono.
    if (isOllamaConfigured) {
      try {
        const ollamaModel = getOllamaModel();
        const result = streamText({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          model: ollamaModel as any,
          system,
          messages,
          abortSignal: opts.signal,
          temperature: 0.3,
        });
        for await (const delta of result.textStream) {
          finalText += delta;
          opts.onTextDelta?.(delta);
        }
        provider = "ollama";
        modelId = process.env.OLLAMA_MODEL ?? "llama3.2:latest";
      } catch (ollamaErr) {
        degraded = true;
        finalText = finalText
          || `⚠️ Assistente non disponibile al momento (${(ollamaErr as Error).message.slice(0, 100)}). Riprova tra qualche istante.`;
        opts.onTextDelta?.(finalText);
      }
    } else {
      degraded = true;
      finalText = finalText
        || `⚠️ Assistente non disponibile al momento (${(cloudErr as Error).message.slice(0, 100)}). Riprova tra qualche istante.`;
      opts.onTextDelta?.(finalText);
    }
  }

  return {
    text: finalText,
    provider,
    model: modelId,
    tokensIn,
    tokensOut,
    costUsd: estimateCostUsd(modelId, tokensIn, tokensOut),
    degraded,
  };
}

/**
 * Estrae righe ACTION: {...} dal testo dell'agente. Le rimuove dal testo
 * principale e ritorna actions strutturate per il client.
 */
export function extractActions(text: string): { cleanText: string; actions: Array<{ actionId: string; params: unknown }> } {
  const actions: Array<{ actionId: string; params: unknown }> = [];
  const lines = text.split(/\r?\n/);
  const kept: string[] = [];
  for (const line of lines) {
    const m = line.match(/^\s*ACTION\s*:\s*(\{[\s\S]*\})\s*$/);
    if (m) {
      try {
        const parsed = JSON.parse(m[1]);
        if (parsed && typeof parsed.actionId === "string") {
          actions.push({ actionId: parsed.actionId, params: parsed.params ?? {} });
          continue;
        }
      } catch { /* ignora JSON malformato — non emettere azione */ }
    }
    kept.push(line);
  }
  return { cleanText: kept.join("\n").trim(), actions };
}
