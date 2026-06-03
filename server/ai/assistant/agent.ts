// Task #2698 — Agente AI Assistant utente (streaming, scope ridotto).
// Task #3017 — Memoria conversazionale, RAG, tool calling Ollama, logging ai_call_logs.
//
// Ollama-primario: usa il modello self-hosted quando disponibile (costo zero),
// con fallback automatico ai provider cloud (chain "router") se Ollama è giù.
// Tool calls: attivi solo quando il provider è Ollama (maxSteps: 3).
// Memoria: gli ultimi N turni dell'utente vengono caricati dal DB e inclusi nel contesto.
// RAG: i top-3 snippet più rilevanti dalla knowledge base vengono iniettati nel system prompt.
// Logging: ogni chiamata viene loggata in ai_call_logs (fire-and-forget).
import { streamText, stepCountIs } from "ai";
import { runWithFallback, estimateCostUsd, type ResolvedModel } from "../moderation/provider";
import { buildSystemPrompt, type KnowledgeEntry } from "./knowledge";
import { getOllamaModel, isOllamaConfigured } from "../../lib/ollama-client";
import { retrieveContext, formatRagContext, indexKnowledge } from "./rag";
import { OLLAMA_TOOLS } from "./tools";
import { logAiCall } from "../../lib/ai-logger";
import { db } from "../../db";
import { aiConversationTurns } from "@shared/db";
import { eq, desc, sql } from "drizzle-orm";

const OLLAMA_FALLBACK_MODEL_ID = process.env.OLLAMA_MODEL ?? "llama3.2:latest";

// Numero di turni da caricare dalla memoria (max per richiesta)
const MEMORY_TURNS_LIMIT = 12;
// Threshold oltre il quale fare summarization (tot turni per user)
const MEMORY_SUMMARIZE_THRESHOLD = 30;

export interface AssistantAgentOpts {
  message: string;
  platform: "android" | "ios" | "web";
  allowedActions: string[];
  customFaqs?: KnowledgeEntry[];
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  userId?: string | null;
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

// ── Memoria conversazionale ───────────────────────────────────────────────────

async function loadMemoryTurns(
  userId: string,
): Promise<Array<{ role: "user" | "assistant"; content: string }>> {
  try {
    const rows = await db
      .select({ role: aiConversationTurns.role, content: aiConversationTurns.content })
      .from(aiConversationTurns)
      .where(eq(aiConversationTurns.userId, userId))
      .orderBy(desc(aiConversationTurns.createdAt))
      .limit(MEMORY_TURNS_LIMIT);
    // I turni sono in ordine cronologico decrescente: li invertiamo
    return rows.reverse().map((r) => ({
      role: r.role as "user" | "assistant",
      content: r.content,
    }));
  } catch {
    return [];
  }
}

async function saveTurns(userId: string, userMsg: string, assistantMsg: string): Promise<void> {
  try {
    await db.insert(aiConversationTurns).values([
      { userId, role: "user", content: userMsg.slice(0, 4000) },
      { userId, role: "assistant", content: assistantMsg.slice(0, 4000) },
    ]);
    // Summarization asincrona (fire-and-forget) se supera il threshold
    maybeSummarize(userId).catch(() => {});
  } catch {
    /* best-effort */
  }
}

async function maybeSummarize(userId: string): Promise<void> {
  try {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(aiConversationTurns)
      .where(eq(aiConversationTurns.userId, userId));
    if (Number(count) <= MEMORY_SUMMARIZE_THRESHOLD) return;

    // Prendi i primi MEMORY_SUMMARIZE_THRESHOLD/2 turni (i più vecchi)
    const oldest = await db
      .select()
      .from(aiConversationTurns)
      .where(eq(aiConversationTurns.userId, userId))
      .orderBy(aiConversationTurns.createdAt)
      .limit(Math.floor(MEMORY_SUMMARIZE_THRESHOLD / 2));

    if (oldest.length < 4) return;

    // Crea un riassunto compresso come singolo turno "assistant" con summaryOf = id del primo
    const summaryContent = `[RIASSUNTO CONVERSAZIONE PRECEDENTE]\n${oldest
      .map((t) => `${t.role === "user" ? "Utente" : "Assistente"}: ${t.content.slice(0, 200)}`)
      .join("\n")}`;

    const firstId = oldest[0].id as unknown as string;
    const ids = oldest.map((t) => t.id as unknown as string);

    await db.insert(aiConversationTurns).values({
      userId,
      role: "assistant",
      content: summaryContent.slice(0, 4000),
      summaryOf: firstId,
    });

    // Rimuovi i turni compressi
    for (const id of ids) {
      await db.delete(aiConversationTurns)
        .where(eq(aiConversationTurns.id, id as unknown as typeof aiConversationTurns.id));
    }
  } catch {
    /* best-effort */
  }
}

// ── Core agent ────────────────────────────────────────────────────────────────

export async function runAssistantAgent(opts: AssistantAgentOpts): Promise<AssistantAgentResult> {
  const startTs = Date.now();

  // Task #3017 — RAG: assicuriamoci che l'indice sia aggiornato e recuperiamo contesto
  indexKnowledge(opts.customFaqs ?? []);
  const ragSnippets = retrieveContext(opts.message, {
    k: 3,
    threshold: 0.05,
    extra: opts.customFaqs ?? [],
  });
  const ragContext = formatRagContext(ragSnippets);

  const system = buildSystemPrompt({
    platform: opts.platform,
    customFaqs: opts.customFaqs,
    allowedActions: opts.allowedActions,
    ragContext,
    // Task #3090 — passa userId così Ollama lo usa nei tool call (getUserPlannedRoutes, getBikerStats)
    userId: opts.userId,
  });

  // Task #3017 — Memoria: carica turni precedenti dal DB se userId è disponibile
  const memoryTurns = opts.userId
    ? await loadMemoryTurns(opts.userId)
    : [];

  // Unione: memoria DB + history dalla richiesta (la history della richiesta ha precedenza
  // sugli ultimi turni in memoria, evita duplicati sommari)
  const historySource = (opts.history ?? []).length > 0 ? (opts.history ?? []) : memoryTurns;
  const messages = [
    ...historySource.map((m) => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: opts.message },
  ];

  let finalText = "";
  let tokensIn = 0;
  let tokensOut = 0;
  let provider = "ollama";
  let modelId = OLLAMA_FALLBACK_MODEL_ID;
  let degraded = false;
  // True non appena il PRIMO delta è stato inviato al client. Se un provider muore
  // a metà stream non possiamo ripartire da un altro provider senza corrompere la
  // risposta (output mescolati): in quel caso teniamo il parziale e segnaliamo degraded.
  let emittedAny = false;

  // Streaming helper riusabile per qualunque modello (Ollama o cloud).
  // Per Ollama: passa i tool e maxSteps per il tool calling server-side.
  const streamWith = async (
    model: Parameters<typeof streamText>[0]["model"],
    isOllama: boolean,
  ) => {
    const result = streamText({
      model,
      system,
      messages,
      abortSignal: opts.signal,
      temperature: 0.3,
      // Task #3017 — Tool calling: solo per Ollama, con max 3 step
      ...(isOllama ? { tools: OLLAMA_TOOLS as never, stopWhen: stepCountIs(3) as never } : {}),
    });
    for await (const delta of result.textStream) {
      finalText += delta;
      emittedAny = true;
      opts.onTextDelta?.(delta);
    }
    const usage = await result.usage;
    tokensIn = usage?.inputTokens ?? 0;
    tokensOut = usage?.outputTokens ?? 0;
  };

  let done = false;

  // 1) Cloud primario (chain "router": Groq Llama 3.3 70B → Gemini Flash → OpenAI →
  //    Anthropic). Qualità nettamente superiore al modello locale; free tier protetto
  //    da RPM (m.scheduler/Bottleneck) + RPD (DAILY_CAPS): quando i cap si esauriscono
  //    la chain prosegue e poi cade su Ollama. CRITICO: lo stream DEVE passare dallo
  //    scheduler del provider, altrimenti i limiti per-minuto verrebbero bypassati.
  try {
    const { model } = await runWithFallback(
      { role: "router" },
      async (m: ResolvedModel) => {
        await m.scheduler(() => streamWith(m.model, false));
      },
    );
    provider = model.providerName;
    modelId = model.modelId;
    done = true;
  } catch (cloudErr) {
    if (emittedAny) {
      // Stream già parzialmente inviato: NON ripartire da un altro provider.
      console.warn("[assistant] cloud fallito a metà stream, mantengo il parziale:", (cloudErr as Error).message);
      degraded = true;
      done = true;
    } else {
      console.warn("[assistant] cloud non disponibile, fallback Ollama:", (cloudErr as Error).message);
      finalText = "";
    }
  }

  // 2) Ollama self-hosted come rete finale illimitata (ThinkCentre acceso).
  //    Task #3017: con tool calling e maxSteps: 3.
  if (!done && isOllamaConfigured) {
    try {
      await streamWith(getOllamaModel() as unknown as Parameters<typeof streamText>[0]["model"], true);
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

  const costUsd = estimateCostUsd(modelId, tokensIn, tokensOut);
  const latencyMs = Date.now() - startTs;

  // Task #3017 — Logging fire-and-forget
  logAiCall({
    userId: opts.userId ?? null,
    provider,
    modelId,
    tokensIn,
    tokensOut,
    latencyMs,
    costUsd,
    degraded,
    error: degraded && !finalText.startsWith("⚠️") ? "degraded" : null,
  });

  // Task #3017 — Salva in memoria conversazionale (solo se non degraded e userId disponibile)
  if (!degraded && opts.userId && finalText) {
    saveTurns(opts.userId, opts.message, finalText).catch(() => {});
  }

  return {
    text: finalText,
    provider,
    model: modelId,
    tokensIn,
    tokensOut,
    costUsd,
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
