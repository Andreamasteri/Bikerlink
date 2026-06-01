// Task #2698 — Agente AI Assistant utente (streaming, scope ridotto).
// Ollama-primario: usa il modello self-hosted quando disponibile (costo zero),
// con fallback automatico ai provider cloud (chain "router") se Ollama è giù.
// No tool calls: l'agente può SOLO emettere testo + righe "ACTION: {...}" che
// il client estrae e propone all'utente come azione da confermare. La whitelist
// server-side resta il vero guard contro abusi (il prompt è defense-in-depth).
import { streamText } from "ai";
import { runWithFallback, estimateCostUsd, type ResolvedModel } from "../moderation/provider";
import { buildSystemPrompt, type KnowledgeEntry } from "./knowledge";
import { getOllamaModel, isOllamaConfigured } from "../../lib/ollama-client";

const OLLAMA_FALLBACK_MODEL_ID = process.env.OLLAMA_MODEL ?? "llama3.2:latest";

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
  let provider = "ollama";
  let modelId = OLLAMA_FALLBACK_MODEL_ID;
  let degraded = false;

  // Streaming helper riusabile per qualunque modello (Ollama o cloud).
  const streamWith = async (model: Parameters<typeof streamText>[0]["model"]) => {
    const result = streamText({
      model,
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
  };

  let done = false;

  // 1) Cloud primario (chain "router": Groq Llama 3.3 70B → Gemini Flash → OpenAI →
  //    Anthropic). Qualità nettamente superiore al modello locale; free tier protetto
  //    da RPM/RPD: quando i cap si esauriscono la chain prosegue e poi cade su Ollama.
  try {
    const { model } = await runWithFallback(
      { role: "router" },
      async (m: ResolvedModel) => {
        await streamWith(m.model);
      },
    );
    provider = model.providerName;
    modelId = model.modelId;
    done = true;
  } catch (cloudErr) {
    console.warn("[assistant] cloud non disponibile, fallback Ollama:", (cloudErr as Error).message);
    finalText = "";
  }

  // 2) Ollama self-hosted come rete finale illimitata (ThinkCentre acceso).
  if (!done && isOllamaConfigured) {
    try {
      await streamWith(getOllamaModel() as unknown as Parameters<typeof streamText>[0]["model"]);
      provider = "ollama";
      modelId = OLLAMA_FALLBACK_MODEL_ID;
      done = true;
    } catch (ollamaErr) {
      degraded = true;
      finalText = finalText
        || `⚠️ Assistente non disponibile al momento (${(ollamaErr as Error).message.slice(0, 100)}). Riprova tra qualche istante.`;
      opts.onTextDelta?.(finalText);
    }
  }

  // 3) Nessun provider disponibile (né cloud né Ollama).
  if (!done && !isOllamaConfigured) {
    degraded = true;
    finalText = finalText
      || "⚠️ Assistente non disponibile al momento (nessun provider AI configurato). Riprova tra qualche istante.";
    opts.onTextDelta?.(finalText);
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
