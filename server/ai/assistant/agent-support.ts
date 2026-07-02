// Task #2698/#3017 — Supporto dell'agente AI Assistant: tipi, memoria
// conversazionale, costruzione del system prompt per persona ed estrazione
// delle ACTION. Estratto da agent.ts per il ratchet 600 righe (target ≤450).
import {
  buildSystemPrompt,
  buildAdminSystemPrompt,
  buildHorusSystemPrompt,
  buildAresSystemPrompt,
  type KnowledgeEntry,
} from "./knowledge";
import type { AiPersonaId } from "./roster";
import { retrieveContext, formatRagContext, indexKnowledge } from "./rag";
import { buildAresLearningContext } from "./ares-learning";
import { loadShareableAnalysisKnowledge } from "./horus-analyzer";
import { db } from "../../db";
import { aiConversationTurns } from "@shared/db";
import { eq, desc } from "drizzle-orm";
import { pruneUserMemory, MEMORY_TURNS_LIMIT } from "./memory-pruner";
import { fetchUserLiveContext } from "./user-context";

export const OLLAMA_FALLBACK_MODEL_ID = process.env.BOWIE_OLLAMA_MODEL ?? "mistral-nemo:latest";
// Task #5197 — Horus usa un modello Ollama dedicato (stessa infra di Bowie).
export const HORUS_MODEL_ID = process.env.HORUS_OLLAMA_MODEL?.trim() || "bikerlink-routing";

export interface AssistantAgentOpts {
  message: string;
  platform: "android" | "ios" | "web" | "admin";
  allowedActions: string[];
  customFaqs?: KnowledgeEntry[];
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  userId?: string | null;
  // Task #5327 — Immagini allegate dall'utente, già risolte a base64 + mediaType
  // dal route (da object storage). Attiva il path multimodale (vision) sui
  // provider cloud (Gemini/OpenAI); Ollama locale non è multimodale → fallback
  // text-only che ignora le immagini ma risponde comunque al testo.
  images?: Array<{ base64: string; mediaType: string }>;
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
  // Task #5331 — true quando questo è la VERA prima apparizione di Horus/Ares
  // in questa conversazione, calcolato a monte nel route via
  // resolvePersonaForTurn (persistito in ai_conversation_state.introShownPersonas,
  // sopravvive ai cicli Bowie ⇄ Horus/Ares ⇄ Bowie).
  // Ignorato per Bowie (usa historySource.length===0, coerente con Task #5210).
  personaFirstTurn?: boolean;
  // Task #5228 — Client di origine ("main_app" | "bowie_terminal"). Loggato in
  // ai_call_logs.source_app per il monitor Bowie Standalone.
  sourceApp?: string;
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
  // Task #5322 — true se la persona ha emesso il marcatore di congedo
  // (HANDOFF_BACK_TO_BOWIE): il chiamante resetta lo stato "persona attiva" così
  // il turno successivo torna a Bowie. Il marcatore è già rimosso da `text`.
  farewell: boolean;
}

// ── Memoria conversazionale ───────────────────────────────────────────────────

export async function loadMemoryTurns(
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

export async function saveTurns(userId: string, userMsg: string, assistantMsg: string): Promise<void> {
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

// ── System prompt per persona ─────────────────────────────────────────────────

/**
 * Costruisce il system prompt per la persona richiesta (Bowie/Horus/Ares o
 * modalità admin) e ritorna anche il miglior punteggio RAG del turno (null se
 * il RAG non è stato interrogato o non ha trovato match), usato a fine turno
 * per registrare le lacune di conoscenza (ai_knowledge_gaps).
 */
export async function buildAgentSystem(
  opts: AssistantAgentOpts,
  requestedPersona: AiPersonaId,
  isAdmin: boolean,
): Promise<{ system: string; ragTopScore: number | null }> {
  let ragTopScore: number | null = null;
  if (requestedPersona === "ares") {
    // Ares: diagnostica tecnica (solo admin), snapshot piattaforma nel prompt.
    // Task #5326 — knowledge transfer read-only Horus → Ares (RAG + prompt injection).
    const horusLearningContext = await buildAresLearningContext();
    return {
      system: buildAresSystemPrompt(opts.adminContext ?? "", horusLearningContext || undefined),
      ragTopScore,
    };
  }
  if (requestedPersona === "horus") {
    // Horus: specialista percorsi. RAG + contesto utente come Bowie, persona diversa.
    // Task #5326 — in modalità admin riceve anche la memoria delle proprie
    // analisi autonome (extra RAG) + il codice sorgente GitHub per la modalità
    // "code reviewer" (adminCodeContext già fetchato dalla route per isAdminMode).
    const horusExtra = isAdmin ? await loadShareableAnalysisKnowledge() : [];
    indexKnowledge(opts.customFaqs ?? []);
    const ragSnippets = retrieveContext(opts.message, {
      k: 3,
      threshold: 0.05,
      extra: [...(opts.customFaqs ?? []), ...horusExtra],
    });
    ragTopScore = ragSnippets[0]?.score ?? null;
    const ragContext = formatRagContext(ragSnippets);
    const userContext = await fetchUserLiveContext(opts.userId);
    return {
      system: buildHorusSystemPrompt({
        platform: (isAdmin ? "web" : opts.platform) as "android" | "ios" | "web",
        userId: opts.userId,
        userContext: userContext || undefined,
        ragContext,
        isAdmin,
        codeContext: isAdmin ? opts.adminCodeContext : undefined,
      }),
      ragTopScore,
    };
  }
  if (isAdmin) {
    // Task #4842 — Modalità admin: system prompt dedicato con snapshot piattaforma.
    // Soluzione 3 — codeContext da GitHub (tools/actions) iniettato opzionalmente.
    return {
      system: buildAdminSystemPrompt(opts.adminContext ?? "", opts.adminCodeContext),
      ragTopScore,
    };
  }
  // Task #3017 — RAG: assicuriamoci che l'indice sia aggiornato e recuperiamo contesto
  indexKnowledge(opts.customFaqs ?? []);
  const ragSnippets = retrieveContext(opts.message, {
    k: 3,
    threshold: 0.05,
    extra: opts.customFaqs ?? [],
  });
  ragTopScore = ragSnippets[0]?.score ?? null;
  const ragContext = formatRagContext(ragSnippets);

  // Soluzione 2 — Contesto live utente (profilo, ultimi giri, proposte attive).
  const userContext = await fetchUserLiveContext(opts.userId);

  return {
    system: buildSystemPrompt({
      platform: opts.platform as "android" | "ios" | "web",
      customFaqs: opts.customFaqs,
      allowedActions: opts.allowedActions,
      ragContext,
      // Task #3090 — passa userId così Ollama lo usa nei tool call (getUserPlannedRoutes, getBikerStats)
      userId: opts.userId,
      userContext: userContext || undefined,
    }),
    ragTopScore,
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
