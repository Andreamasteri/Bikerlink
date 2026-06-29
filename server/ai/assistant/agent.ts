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
import {
  buildSystemPrompt,
  buildAdminSystemPrompt,
  buildHorusSystemPrompt,
  buildAresSystemPrompt,
  type KnowledgeEntry,
} from "./knowledge";
import { getOllamaModel, isOllamaConfigured, isOllamaReachable } from "../../lib/ollama-client";
import { AI_ROSTER, type AiPersonaId } from "./roster";
import { isAresConfigured, getAresModelId, streamAresChat } from "../../lib/ares-client";
import { retrieveContext, formatRagContext, indexKnowledge } from "./rag";
import { OLLAMA_TOOLS } from "./tools";
import { logAiCall } from "../../lib/ai-logger";
import { db } from "../../db";
import { aiConversationTurns } from "@shared/db";
import { eq, desc } from "drizzle-orm";
import { pruneUserMemory, MEMORY_TURNS_LIMIT } from "./memory-pruner";
import { fetchUserLiveContext } from "./user-context";

const OLLAMA_FALLBACK_MODEL_ID = process.env.OLLAMA_MODEL ?? "mistral-nemo:latest";
// Task #5197 — Horus usa un modello Ollama dedicato (stessa infra di Bowie).
const HORUS_MODEL_ID = process.env.OLLAMA_ROUTING_MODEL?.trim() || "bikerlink-routing";

// Task #5210 — Presentazione poetica di Bowie: iniettata come turno "assistant"
// seed quando la conversazione è nuova (nessuna history). NON viene salvata nel DB:
// è statica e ricostruita a ogni prima apertura.
const BOWIE_INTRO_POEM =
  "Son nato nel fuoco\nSon cresciuto giocando con l'acqua e la terra.\n\nDavanti a me si son prostrati\nDei, Sovrani, Principi e servi\n\nM'ha accarezzato il vento\nSono qui al tuo servizio";

export interface AssistantAgentOpts {
  message: string;
  platform: "android" | "ios" | "web" | "admin";
  allowedActions: string[];
  customFaqs?: KnowledgeEntry[];
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  userId?: string | null;
  signal?: AbortSignal;
  onTextDelta?: (delta: string) => void;
  // Task #4842 — Contesto admin sintetico (snapshot piattaforma) iniettato nel
  // system prompt quando platform === "admin".
  adminContext?: string;
  // Soluzione 3 — Codice sorgente da GitHub (tools/actions) per admin mode.
  adminCodeContext?: string;
  // Task #5197 — Persona attiva: "bowie" (default, entry point), "horus"
  // (specialista percorsi) o "ares" (diagnostica tecnica, solo admin). La
  // risoluzione dell'handoff avviene nel route; qui si applica solo.
  persona?: AiPersonaId;
  // Callback invocata quando la persona che risponde è nota (prima dei delta),
  // così il client può mostrare CHI sta rispondendo.
  onPersona?: (p: { id: AiPersonaId; name: string }) => void;
}

export interface AssistantAgentResult {
  text: string;
  provider: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  degraded: boolean;
  // Task #5197 — Persona EFFETTIVA che ha risposto (può differire da quella
  // richiesta: es. Ares offline → fallback a Bowie).
  persona: { id: AiPersonaId; name: string };
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
    await pruneUserMemory(userId);
  } catch {
    /* best-effort */
  }
}

// ── Core agent ────────────────────────────────────────────────────────────────

export async function runAssistantAgent(opts: AssistantAgentOpts): Promise<AssistantAgentResult> {
  const startTs = Date.now();
  const isAdmin = opts.platform === "admin";

  // Task #5197 — Persona richiesta (handoff risolto a monte nel route).
  // Difesa in profondità: Ares è SOLO per gli admin. Il route già lo garantisce,
  // ma se runAssistantAgent venisse chiamato direttamente con persona="ares" fuori
  // dalla modalità admin, ricadiamo su Bowie invece di esporre la diagnostica.
  const requestedPersona: AiPersonaId =
    opts.persona === "ares" && !isAdmin ? "bowie" : (opts.persona ?? "bowie");
  // Persona EFFETTIVA: può cambiare se la richiesta fallisce (es. Ares offline).
  let effectivePersona: AiPersonaId = requestedPersona;
  // Tool calling server-side abilitato SOLO per Bowie (utente e admin); Horus è
  // advisory e Ares passa per un endpoint dedicato.
  const enableTools = requestedPersona === "bowie";
  // Modello Ollama: Horus usa il modello dedicato; Bowie quello di default.
  const ollamaModelName = requestedPersona === "horus" ? HORUS_MODEL_ID : undefined;

  let system: string;
  if (requestedPersona === "ares") {
    // Ares: diagnostica tecnica (solo admin), snapshot piattaforma nel prompt.
    system = buildAresSystemPrompt(opts.adminContext ?? "");
  } else if (requestedPersona === "horus") {
    // Horus: specialista percorsi. RAG + contesto utente come Bowie, persona diversa.
    indexKnowledge(opts.customFaqs ?? []);
    const ragSnippets = retrieveContext(opts.message, {
      k: 3,
      threshold: 0.05,
      extra: opts.customFaqs ?? [],
    });
    const ragContext = formatRagContext(ragSnippets);
    const userContext = await fetchUserLiveContext(opts.userId);
    system = buildHorusSystemPrompt({
      platform: (isAdmin ? "web" : opts.platform) as "android" | "ios" | "web",
      userId: opts.userId,
      userContext: userContext || undefined,
      ragContext,
    });
  } else if (isAdmin) {
    // Task #4842 — Modalità admin: system prompt dedicato con snapshot piattaforma.
    // Soluzione 3 — codeContext da GitHub (tools/actions) iniettato opzionalmente.
    system = buildAdminSystemPrompt(opts.adminContext ?? "", opts.adminCodeContext);
  } else {
    // Task #3017 — RAG: assicuriamoci che l'indice sia aggiornato e recuperiamo contesto
    indexKnowledge(opts.customFaqs ?? []);
    const ragSnippets = retrieveContext(opts.message, {
      k: 3,
      threshold: 0.05,
      extra: opts.customFaqs ?? [],
    });
    const ragContext = formatRagContext(ragSnippets);

    // Soluzione 2 — Contesto live utente (profilo, ultimi giri, proposte attive).
    const userContext = await fetchUserLiveContext(opts.userId);

    system = buildSystemPrompt({
      platform: opts.platform as "android" | "ios" | "web",
      customFaqs: opts.customFaqs,
      allowedActions: opts.allowedActions,
      ragContext,
      // Task #3090 — passa userId così Ollama lo usa nei tool call (getUserPlannedRoutes, getBikerStats)
      userId: opts.userId,
      userContext: userContext || undefined,
    });
  }

  // Task #3017 — Memoria: carica turni precedenti dal DB se userId è disponibile.
  // Task #4842 — La chat admin è in-sessione (nessuna persistenza cross-sessione):
  // non carichiamo né salviamo la memoria conversazionale per la modalità admin.
  const memoryTurns = (opts.userId && !isAdmin)
    ? await loadMemoryTurns(opts.userId)
    : [];

  // Unione: memoria DB + history dalla richiesta (la history della richiesta ha precedenza
  // sugli ultimi turni in memoria, evita duplicati sommari)
  const historySource = (opts.history ?? []).length > 0 ? (opts.history ?? []) : memoryTurns;

  // Task #5210 — Seed poetico: iniettato SOLO per Bowie alla prima apertura
  // (nessuna history precedente). Il modello "vede" la poesia come già pronunciata
  // da Bowie → non la ripete né la parafrasa. Non viene salvato nel DB.
  const isNewBowieConversation = requestedPersona === "bowie" && historySource.length === 0;
  const seedTurns: Array<{ role: "user" | "assistant"; content: string }> = isNewBowieConversation
    ? [{ role: "assistant", content: BOWIE_INTRO_POEM }]
    : [];

  const messages = [
    ...seedTurns,
    ...historySource.map((m) => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: opts.message },
  ];

  let finalText = "";
  // Task #5210 — Testo prodotto SOLO dall'AI (esclude il prefisso poetico).
  // Usato da saveTurns per non persistere il testo statico nel DB.
  let aiText = "";
  let tokensIn = 0;
  let tokensOut = 0;
  let provider = "ollama";
  let modelId = OLLAMA_FALLBACK_MODEL_ID;
  let degraded = false;
  // True non appena il PRIMO delta AI è stato inviato al client. Se un provider muore
  // a metà stream non possiamo ripartire da un altro provider senza corrompere la
  // risposta (output mescolati): in quel caso teniamo il parziale e segnaliamo degraded.
  // NOTA: NON viene impostato dall'emissione della poesia intro (testo statico),
  // solo dai delta del modello AI — così i fallback guard funzionano correttamente.
  let providerEmittedAny = false;

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
      // Task #5197 — abilitato solo per la persona Bowie (Horus è advisory).
      ...(isOllama && enableTools ? { tools: OLLAMA_TOOLS as never, stopWhen: stepCountIs(3) as never } : {}),
    });
    for await (const delta of result.textStream) {
      finalText += delta;
      aiText += delta;
      providerEmittedAny = true;
      opts.onTextDelta?.(delta);
    }
    const usage = await result.usage;
    tokensIn = usage?.inputTokens ?? 0;
    tokensOut = usage?.outputTokens ?? 0;
  };

  let done = false;

  // Task #5210 — Emetti la poesia come primo blocco dello stream (solo Bowie, prima apertura).
  // Il seed nel contesto dice al modello che è già stata pronunciata → non la ripete.
  // La separazione con "\n\n" stacca visivamente l'intro dalla risposta effettiva.
  // providerEmittedAny rimane false: la poesia è testo statico, non output del provider.
  // L'append a finalText è incondizionato (anche senza callback streaming) così i caller
  // non-streaming ricevono sempre il testo completo nella risposta finale.
  if (isNewBowieConversation) {
    const introBlock = BOWIE_INTRO_POEM + "\n\n";
    finalText += introBlock;
    opts.onTextDelta?.(introBlock);
  }

  // 0) Task #5197 — Ares: AI di diagnostica su PC fisso dedicato (DIAG_OLLAMA_*).
  //    Endpoint separato (/api/chat HTTP diretta), NON la chain Ollama/cloud.
  //    Se Ares è offline, degrada con GRAZIA: Bowie riprende con un messaggio
  //    garbato (nessun crash, nessun secret stampato).
  if (requestedPersona === "ares") {
    opts.onPersona?.({ id: "ares", name: AI_ROSTER.ares.name });
    try {
      if (!isAresConfigured) throw new Error("Ares non configurato (DIAG_OLLAMA_URL mancante).");
      await streamAresChat({
        system,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        signal: opts.signal,
        timeoutMs: 60_000,
        onDelta: (delta) => {
          finalText += delta;
          aiText += delta;
          providerEmittedAny = true;
          opts.onTextDelta?.(delta);
        },
      });
      provider = "ares";
      modelId = getAresModelId();
      done = true;
      console.log("[assistant] risposta da Ares (diagnostica)");
    } catch (aresErr) {
      if (providerEmittedAny) {
        // Stream già parziale: non ripartire, segnala degraded.
        console.warn("[assistant] Ares fallito a metà stream, mantengo il parziale:", (aresErr as Error).message);
        degraded = true;
        done = true;
      } else {
        // Fallback garbato: Bowie riprende la parola.
        console.warn("[assistant] Ares offline, fallback a Bowie:", (aresErr as Error).message);
        effectivePersona = "bowie";
        opts.onPersona?.({ id: "bowie", name: AI_ROSTER.bowie.name });
        finalText =
          "Ho provato a passare la parola ad Ares (la nostra AI tecnica, gira su una macchina dedicata), ma al momento non risponde. Riprova più tardi.";
        provider = "fallback";
        modelId = "ares-offline";
        opts.onTextDelta?.(finalText);
        done = true;
      }
    }
  } else {
    // Bowie/Horus: notifica la persona prima di iniziare lo stream.
    opts.onPersona?.({ id: effectivePersona, name: AI_ROSTER[effectivePersona].name });
  }

  // 1) Ollama self-hosted — provider PRIMARIO (ThinkCentre, costo zero, illimitato).
  //    Coerente con il resto del backend (moderation, routing engine, watchdog):
  //    Ollama è il primo tentativo ovunque. Tool calling server-side abilitato (maxSteps: 3).
  //    Il probe isOllamaReachable() ha cache 60s: aggiunge latenza minima (<1ms se cached).
  if (!done && isOllamaConfigured) {
    try {
      const reachable = await isOllamaReachable();
      if (reachable) {
        await streamWith(getOllamaModel(ollamaModelName) as unknown as Parameters<typeof streamText>[0]["model"], true);
        provider = "ollama";
        modelId = ollamaModelName ?? OLLAMA_FALLBACK_MODEL_ID;
        done = true;
        console.log(`[assistant] risposta da ollama (primario, persona=${effectivePersona})`);
      } else {
        console.warn("[assistant] Ollama non raggiungibile, scalo a chain cloud");
      }
    } catch (ollamaErr) {
      if (providerEmittedAny) {
        // Stream già parzialmente inviato: NON ripartire da un altro provider.
        console.warn("[assistant] ollama fallito a metà stream, mantengo il parziale:", (ollamaErr as Error).message);
        degraded = true;
        done = true;
      } else {
        console.warn("[assistant] ollama fallito, scalo a chain cloud:", (ollamaErr as Error).message);
        finalText = finalText.slice(0, finalText.length - aiText.length); // mantieni solo l'eventuale intro
        aiText = "";
      }
    }
  }

  // 2) Cloud fallback (chain "router": Groq → Gemini Flash → OpenAI).
  //    Attivato solo se Ollama è irraggiungibile o ha lanciato un errore.
  //    Free tier protetto da RPM (m.scheduler/Bottleneck) + RPD (DAILY_CAPS).
  //    CRITICO: lo stream DEVE passare dallo scheduler del provider, altrimenti
  //    i limiti per-minuto verrebbero bypassati.
  //    skipOllama: true — Ollama è già stato tentato nel passo 1.
  if (!done) {
    try {
      const { model } = await runWithFallback(
        { role: "router", skipOllama: true },
        async (m: ResolvedModel) => {
          await m.scheduler(() => streamWith(m.model, false));
        },
      );
      provider = model.providerName;
      modelId = model.modelId;
      done = true;
    } catch (cloudErr) {
      if (providerEmittedAny) {
        // Stream già parzialmente inviato: NON ripartire.
        console.warn("[assistant] cloud fallito a metà stream, mantengo il parziale:", (cloudErr as Error).message);
        degraded = true;
        done = true;
      } else {
        degraded = true;
        finalText = `⚠️ Assistente non disponibile al momento (${(cloudErr as Error).message.slice(0, 100)}). Riprova tra qualche istante.`;
        opts.onTextDelta?.(finalText);
      }
    }
  }

  // 3) Nessun provider disponibile (né Ollama né cloud).
  if (!done && !degraded) {
    degraded = true;
    finalText = "⚠️ Assistente non disponibile al momento (nessun provider AI configurato). Riprova tra qualche istante.";
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
  // Task #4842 — La chat admin è in-sessione: non persistiamo i turni.
  // Task #5210 — Salva solo la risposta AI (aiText), mai il prefisso poetico statico.
  if (!degraded && opts.userId && aiText && !isAdmin) {
    saveTurns(opts.userId, opts.message, aiText).catch(() => {});
  }

  return {
    text: finalText,
    provider,
    model: modelId,
    tokensIn,
    tokensOut,
    costUsd,
    degraded,
    persona: { id: effectivePersona, name: AI_ROSTER[effectivePersona].name },
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
