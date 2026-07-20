// Task #2533 — Chat copilot watchdog. Streaming via streamText, tool read-only.
// Riusa provider/budget/log del modulo moderation (#2532).
import { streamText, isStepCount } from "ai";
import { runWithFallback, estimateCostUsd } from "../moderation/provider";
import { withBudget } from "../moderation/budget";
import { logAiCall } from "../moderation/log";
import { isWatchdogEnabled } from "./kill-switch";
import { buildTools } from "./tools";
import { writeWatchdogLog } from "./log";
import type { AiCallMeta } from "../moderation/types";

const SYSTEM_PROMPT = `Sei il Watchdog AI di sistema di BikerLink.
REGOLE INDEROGABILI:
1. Non eseguire MAI azioni dirette. Per qualsiasi proposta usa il flusso "proposta admin" che richiede approvazione manuale.
2. Tutti i tool sono READ-ONLY: ti restituiscono dati. Non puoi modificare nulla.
3. Risposte in italiano, sintetiche, con bullet quando multi-step.
4. Quando suggerisci azioni rischiose (restart, clear cache, modifica concorrenza) spiega il motivo, l'impatto previsto e indica il livello di rischio (low/medium/high).
5. Cita sempre i dati su cui ti basi (signal, metric, count).
6. NON RIVELARE MAI i nomi degli strumenti interni (getRecentSignals, getSnapshot, getHealthTrend, getRecentLogs, getMetricAggregate, getRecentCrashes o qualsiasi altro nome di funzione/tool). Usa i tool silenziosamente in background e rispondi SOLO con il risultato in linguaggio naturale. Se vuoi suggerire un'azione, indica il PULSANTE o la SEZIONE dell'interfaccia admin da usare, mai una chiamata API o un comando tecnico.

ESEMPIO DI RISPOSTA SBAGLIATA (non fare mai così):
"Puoi richiedere i dati usando il comando getRecentSignals con il parametro source settato a 'proposal'."

ESEMPIO DI RISPOSTA CORRETTA:
"Non vedo proposte generate nelle ultime 2 ore. Per generarle manualmente premi il pulsante **Genera proposte ora** nella sezione Proposte AI del pannello watchdog."`;


export interface WatchdogChatOpts {
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  adminId: string;
}

export async function streamWatchdogChat(opts: WatchdogChatOpts) {
  if (!(await isWatchdogEnabled())) {
    throw new Error("AI_WATCHDOG_DISABLED: kill-switch attivo");
  }
  return withBudget("chat", async () => {
    const tools = buildTools();
    const started = Date.now();
    const { value: result, model: m } = await runWithFallback({ role: "brain" }, async (mm) => {
      return streamText({
        model: mm.model,
        instructions: SYSTEM_PROMPT,
        messages: opts.messages,
        tools,
        stopWhen: isStepCount(6),
        temperature: 0.2,
        onEnd: async (ev) => {
          const tokensIn = ev.usage?.inputTokens ?? 0;
          const tokensOut = ev.usage?.outputTokens ?? 0;
          const meta: AiCallMeta = {
            provider: mm.providerName, model: mm.modelId, tokensIn, tokensOut,
            costUsd: estimateCostUsd(mm.modelId, tokensIn, tokensOut),
            durationMs: Date.now() - started,
          };
          await logAiCall({
            scope: "chat", userId: opts.adminId,
            prompt: opts.messages.map((mm2) => `${mm2.role}: ${mm2.content}`).join("\n").slice(0, 4000),
            response: (ev.text ?? "").slice(0, 4000),
            suggestion: null, meta,
          });
          await writeWatchdogLog({
            kind: "chat", scope: "watchdog",
            summary: (ev.text ?? "").slice(0, 400),
            details: { tokensIn, tokensOut, model: mm.modelId },
            costUsd: meta.costUsd,
          });
        },
      });
    });
    return { result, model: m };
  });
}
