// Task #2637 — Agente principale della AI Console (streaming).
// Wrappa streamText con fallback chain Anthropic Sonnet → OpenAI GPT-5.1 →
// Gemini Pro. Filtra i tool secondo gli scope selezionati dal router.
import { streamText, isStepCount, type ToolSet } from "ai";
import { runWithFallback, estimateCostUsd, type ResolvedModel } from "../moderation/provider";
import { buildToolsForScopes, type Scope } from "./tools";
import { correlateTool } from "./correlate";

const SYSTEM_BASE = `Sei l'AI Console di BikerLink — assistente unico per admin/moderator/superadmin.
REGOLE INDEROGABILI:
1. NON eseguire mai azioni autonome (ban, dismiss, rollback, fix). Sei in modalità READ-ONLY: i tuoi tool leggono dati, non scrivono.
2. Cita SEMPRE le fonti dei dati: tool usato, count righe, finestra temporale, scope.
3. Se servono più info, chiama tool in sequenza prima di rispondere — non inventare numeri.
4. Rispondi in italiano, conciso. Elenchi puntati per multi-step. Numeri sempre con unità (es. "12 report", "score 73/100").
5. Se rilevi un pattern cross-scope, usa il tool "correlate" per quantificarlo (confidence).
6. Quando l'admin chiede azioni concrete (ban/rollback/fix), spiega cosa farebbe il sistema e indirizza al pannello dedicato — NON proporre tu l'azione.
7. Se i dati sono insufficienti, dichiaralo esplicitamente: "non ho dati per questa finestra".`;


export interface AgentRunOpts {
  message: string;
  scopes: Scope[];
  systemContext?: string; // da memory.ts
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  signal?: AbortSignal;
  maxSteps?: number;
  onTextDelta?: (delta: string) => void;
  onToolCall?: (name: string, args: unknown) => void;
  onToolResult?: (name: string, result: unknown) => void;
}

export interface AgentRunResult {
  text: string;
  toolCalls: Array<{ name: string; args: unknown; result?: unknown }>;
  provider: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  degraded: boolean;
}

export async function runAgent(opts: AgentRunOpts): Promise<AgentRunResult> {
  const tools = {
    ...buildToolsForScopes(opts.scopes),
    correlate: correlateTool,
  } as ToolSet;
  const system = [SYSTEM_BASE, opts.systemContext ? `\nCONTESTO CONVERSAZIONE:\n${opts.systemContext}` : ""].join("");

  const messages = [
    ...(opts.history ?? []).map((m) => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: opts.message },
  ];

  const toolCalls: Array<{ name: string; args: unknown; result?: unknown }> = [];
  let degraded = false;
  let finalText = "";
  let tokensIn = 0;
  let tokensOut = 0;
  let provider = "groq";
  let modelId = "llama-3.3-70b-versatile";

  try {
    const { model } = await runWithFallback(
      { role: "brain" },
      async (m: ResolvedModel) => {
        const result = streamText({
          model: m.model,
          instructions: system,
          messages,
          tools,
          stopWhen: isStepCount(opts.maxSteps ?? 6),
          abortSignal: opts.signal,
          onStepEnd: (step) => {
            if (step.toolCalls?.length) {
              for (const tc of step.toolCalls) {
                toolCalls.push({ name: tc.toolName, args: tc.input });
                opts.onToolCall?.(tc.toolName, tc.input);
              }
            }
            if (step.toolResults?.length) {
              for (const tr of step.toolResults) {
                const last = toolCalls.find((t) => t.name === tr.toolName && t.result === undefined);
                if (last) last.result = tr.output;
                opts.onToolResult?.(tr.toolName, tr.output);
              }
            }
          },
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
  } catch (err) {
    degraded = true;
    const rawMsg = (err as Error).message ?? "";
    const isCooldown = rawMsg.includes("AI_PROVIDER_UNAVAILABLE");
    const friendlyMsg = isCooldown
      ? "⚠️ Tutti i provider AI sono momentaneamente in cooldown. Riprova tra qualche istante o consulta direttamente i pannelli admin specifici."
      : `⚠️ Errore AI: ${rawMsg.slice(0, 120)}. Riprova tra qualche istante.`;
    finalText = finalText || friendlyMsg;
    opts.onTextDelta?.(finalText);
  }

  const costUsd = estimateCostUsd(modelId, tokensIn, tokensOut);
  return { text: finalText, toolCalls, provider, model: modelId, tokensIn, tokensOut, costUsd, degraded };
}
