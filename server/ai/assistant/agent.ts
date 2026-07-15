// LARGE-FILE-ALLOW: agente AI Assistant core — flusso streaming unico e coeso (persona, fallback chain, memoria); split vietato per decisione utente.
// Task #2698 — Agente AI Assistant utente (streaming, scope ridotto).
// Task #3017 — Memoria conversazionale, RAG, tool calling Ollama, logging ai_call_logs.
//
// Ollama-primario: usa il modello self-hosted quando disponibile (costo zero),
// con fallback automatico ai provider cloud (chain "router") se Ollama è giù.
// Tool calls: attivi solo quando il provider è Ollama (maxSteps: 3).
// Memoria: gli ultimi N turni dell'utente vengono caricati dal DB e inclusi nel contesto.
// RAG: i top-3 snippet più rilevanti dalla knowledge base vengono iniettati nel system prompt.
// Logging: ogni chiamata viene loggata in ai_call_logs (fire-and-forget).
import { streamText, isStepCount, type ModelMessage } from "ai";
import { runWithFallback, estimateCostUsd, type ResolvedModel } from "../moderation/provider";
import {
  buildSystemPrompt,
  buildAdminSystemPrompt,
  buildHorusSystemPrompt,
  buildAresSystemPrompt,
  buildQuebrachoSystemPrompt,
  type KnowledgeEntry,
} from "./knowledge";
import { getOllamaModel, isOllamaConfigured, warmOllama } from "../../lib/ollama-client";
import { isThinkCentreOffline } from "../../lib/thinkcentre-offline";
import { AI_ROSTER, type AiPersonaId, createHandoffMarkerFilter, stripHandoffMarker, detectAresJobRequest } from "./roster";
import { startAresJob, withAresInteractivePriority, type AresJobMode } from "../ares-jobs";
import { recordKnowledgeGap } from "./knowledge-gaps";
import { composeAresQuestion } from "./ares-question";
import { isAresConfigured, getAresModelId, streamAresChat } from "../../lib/ares-client";
import { withAresVramPriority } from "../../lib/vram-arbiter";
import { composeQuebrachoQuestion } from "./quebracho-question";
import { isQuebrachoConfigured, getQuebrachoModelId, streamQuebrachoChat } from "../../lib/quebracho-client";
import { detectPlanReviewRequest, reviewTaskPlan } from "./task-review";
import { detectHorusScanRequest, startHorusScan } from "./horus-scanner";
import { retrieveContext, formatRagContext, indexKnowledge } from "./rag";
import {
  OLLAMA_TOOLS,
  HORUS_TOOLS,
  buildBowieInterAgentTools,
  buildRememberNoteTool,
  buildReviewTaskPlanTool,
  buildSearchManualTool,
} from "./tools";
import { loadHorusMemory } from "./horus-memory";
import { searchNadir, SEARCH_MANUAL_RE } from "../nadir";
import {
  selectToolNamesForMessage,
  buildMissingToolInstruction,
  createOllamaOutputGate,
} from "./tool-calling";
import { isWebSearchConfigured } from "./web-search";
import { buildAresLearningContext } from "./ares-learning";
import { loadShareableAnalysisKnowledge } from "./horus-analyzer";
import { logAiCall } from "../../lib/ai-logger";
import { db } from "../../db";
import { aiConversationTurns } from "@shared/db";
import { eq, desc } from "drizzle-orm";
import { pruneUserMemory, MEMORY_TURNS_LIMIT } from "./memory-pruner";
import { fetchUserLiveContext } from "./user-context";
import { BOWIE_INTRO_POEM, HORUS_INTRO_POEM, ARES_INTRO_POEM, QUEBRACHO_INTRO_POEM } from "@shared/bowie-greeting";

// Default Bowie = "qwen3:1.7b" (lineup: Horus=qwen3:4b, Bowie=qwen3:1.7b).
const OLLAMA_FALLBACK_MODEL_ID = process.env.BOWIE_OLLAMA_MODEL ?? "qwen3:1.7b";
// Task #5197 — Horus usa un modello Ollama dedicato (stessa infra di Bowie).
// Task #4 — default aggiornato a "qwen3:4b" (modello residente sul ThinkCentre).
const HORUS_MODEL_ID = process.env.HORUS_OLLAMA_MODEL?.trim() || "qwen3:4b";

// Task #5210/#5233 — Presentazione poetica di Bowie (BOWIE_INTRO_POEM): iniettata
// come turno "assistant" seed quando la conversazione è nuova (nessuna history).
// NON viene salvata nel DB: è statica e ricostruita a ogni prima apertura. Il
// testo è centralizzato in @shared/bowie-greeting così che terminale standalone/
// backend e chat in-app condividano la stessa fonte (import in cima al file).

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

/**
 * Task #75 — Contesto Nadir per personas SENZA tool-calling nativo (Quebracho).
 * Se il messaggio contiene un cue di richiamo semantico (stesso gate del tool
 * `search_manual`), interroga Nadir e ritorna un blocco da appendere al system
 * prompt. Nessun cue → stringa vuota (nessuna ricerca, nessun costo). Best-effort:
 * un errore di Nadir non deve far fallire il turno.
 */
async function buildNadirContextForPrompt(
  message: string,
  access: { requesterId?: string | null; includeAllUsers?: boolean } = {},
): Promise<string> {
  if (!SEARCH_MANUAL_RE.test(message ?? "")) return "";
  try {
    // SICUREZZA (Task #75): stesso scoping del tool `search_manual`. Quebracho è
    // solo-admin (contesto di sistema) → includeAllUsers; passiamo comunque il
    // requesterId per coerenza con Bowie/Horus.
    const result = await searchNadir(message, 5, {
      requesterId: access.requesterId ?? null,
      includeAllUsers: access.includeAllUsers ?? false,
    });
    if (result.fragments.length === 0) return "";
    const lines = result.fragments
      .map(
        (f, i) =>
          `${i + 1}. [${f.origin}, similarità ${f.similarity.toFixed(3)}] ${f.text}`,
      )
      .join("\n");
    return (
      `\n\n---\nNADIR — RICERCA SEMANTICA (motore ${result.model}). Frammenti pertinenti ` +
      `recuperati per significato dalla knowledge base; usali se utili, cita l'origine ` +
      `solo se serve:\n${lines}\n---`
    );
  } catch (e) {
    console.warn("[Nadir] injection Quebracho fallita (non-fatal):", (e as Error)?.message ?? e);
    return "";
  }
}

// ── Task #87 — Avvio job Ares da chat ──────────────────────────────────────────
// Bowie avvia il job long-running di Ares e conferma all'admin. Non attende il
// completamento (che può durare ore): il job prosegue in background, lo stato è
// consultabile a parte. Se un job è già in corso o Ares è irraggiungibile,
// restituisce un messaggio chiaro.
async function startAresJobFromChat(mode: AresJobMode, userId: string | null): Promise<string> {
  const label = mode === "analysis" ? "analisi completa di codice e database" : "generazione del manuale dell'app";
  try {
    const res = await startAresJob(mode, { trigger: "bowie-chat", startedBy: userId });
    if (res.started) {
      return `Ho svegliato Ares: ha avviato la ${label} in background. È un lavoro lungo, procede da solo. Puoi chiedermi lo stato quando vuoi — non serve tenere aperta la chat.`;
    }
    return `Non ho avviato la ${label}: ${res.reason ?? "operazione non riuscita"}.`;
  } catch (err) {
    return `Non sono riuscito ad avviare la ${label}: ${(err as Error)?.message ?? "errore sconosciuto"}.`;
  }
}

// ── Core agent ────────────────────────────────────────────────────────────────

export async function runAssistantAgent(opts: AssistantAgentOpts): Promise<AssistantAgentResult> {
  const startTs = Date.now();
  const isAdmin = opts.platform === "admin";

  // Task #87 — Trigger dei job long-running di Ares da chat (SOLO admin). Bowie
  // riconosce l'intento ("sveglia Ares, fagli fare l'analisi completa del codice
  // e del db" → analisi; "Ares, leggi l'app intera e produci un manuale" →
  // manuale) e AVVIA il job giusto in Ares, senza rispondere al posto suo né
  // trattarlo come una consultazione mid-chat generica. Il job prosegue da solo:
  // qui rispondiamo solo con la conferma d'avvio. Intercettato PRIMA del dispatch
  // della persona, indipendentemente dalla persona risolta.
  if (isAdmin) {
    const aresJobMode = detectAresJobRequest(opts.message);
    if (aresJobMode) {
      const text = await startAresJobFromChat(aresJobMode, opts.userId ?? null);
      opts.onPersona?.({ id: "bowie", name: AI_ROSTER.bowie.name });
      opts.onTextDelta?.(text);
      return {
        text,
        provider: "ares-jobs",
        model: "ares-jobs",
        tokensIn: 0,
        tokensOut: 0,
        costUsd: 0,
        degraded: false,
        persona: { id: "bowie", name: AI_ROSTER.bowie.name },
        farewell: false,
      };
    }
  }

  // Task #5197 — Persona richiesta (handoff risolto a monte nel route).
  // Difesa in profondità: Ares e Quebracho sono SOLO per gli admin. Il route già
  // lo garantisce, ma se runAssistantAgent venisse chiamato direttamente con
  // persona="ares"/"quebracho" fuori dalla modalità admin, ricadiamo su Bowie
  // invece di esporre agenti riservati.
  const requestedPersona: AiPersonaId =
    (opts.persona === "ares" || opts.persona === "quebracho") && !isAdmin
      ? "bowie"
      : (opts.persona ?? "bowie");
  // Persona EFFETTIVA: può cambiare se la richiesta fallisce (es. Ares offline).
  let effectivePersona: AiPersonaId = requestedPersona;
  // Tool calling server-side abilitato per Bowie e Horus (Task #5326 — Horus
  // usa HORUS_TOOLS: meteo, stato ThinkCentre, eventi vicini, ricerca web).
  // Ares passa per un endpoint dedicato (nessun tool calling server-side).
  const enableTools = requestedPersona === "bowie" || requestedPersona === "horus";
  // Task #50 — Set di tool costruito PER TURNO: al set base della persona
  // (OLLAMA_TOOLS/HORUS_TOOLS) si aggiungono i tool inter-agente (solo Bowie;
  // call_ares solo in sessioni admin), il tool di memoria (solo Horus) e il tool
  // di revisione piani (Bowie e Horus). La selezione contestuale (sotto) filtra
  // ulteriormente; il retry sentinella riesegue con l'intero `toolsForPersona`,
  // così anche i nuovi tool sono coperti dall'auto-correzione.
  const toolsForPersona: Record<string, unknown> = {
    ...(requestedPersona === "horus" ? HORUS_TOOLS : OLLAMA_TOOLS),
  };
  if (requestedPersona === "bowie") {
    Object.assign(
      toolsForPersona,
      buildBowieInterAgentTools({
        isAdmin,
        history: opts.history ?? [],
        latestMessage: opts.message,
        signal: opts.signal,
      }),
      buildReviewTaskPlanTool("bowie", { signal: opts.signal, allowFileRead: isAdmin }),
      // Task #75 — Nadir: motore di ricerca semantica, agent-neutral (identico per
      // Bowie e Horus). La selezione contestuale lo allega SOLO su un cue di
      // richiamo semantico (SEARCH_MANUAL_RE), mai come default. SICUREZZA: le
      // conversazioni private sono scoping-ate al richiedente (solo le SUE chat);
      // in sessione admin `includeAllUsers` le sblocca tutte.
      buildSearchManualTool({
        signal: opts.signal,
        requesterId: opts.userId ?? null,
        includeAllUsers: isAdmin,
      }),
    );
  } else if (requestedPersona === "horus") {
    Object.assign(
      toolsForPersona,
      buildRememberNoteTool(isAdmin),
      buildReviewTaskPlanTool("horus", { signal: opts.signal, allowFileRead: isAdmin }),
      buildSearchManualTool({
        signal: opts.signal,
        requesterId: opts.userId ?? null,
        includeAllUsers: isAdmin,
      }),
    );
  }

  // Task #7 (#3) — Selezione contestuale + gating per capacità: invece di
  // allegare l'INTERO set di tool a ogni turno, alleghiamo solo il sottoinsieme
  // pertinente al messaggio e ai servizi effettivamente attivi (webSearch solo
  // con SearXNG configurato; stats/percorsi solo con un userId reale). Un
  // messaggio conversazionale non riceve alcun tool.
  const availableToolNames = Object.keys(toolsForPersona);
  const selectedToolNames = enableTools
    ? selectToolNamesForMessage(availableToolNames, opts.message, {
        webSearchAvailable: isWebSearchConfigured(),
        hasUserId: Boolean(opts.userId),
      })
    : [];
  const selectedTools: Record<string, unknown> = Object.fromEntries(
    Object.entries(toolsForPersona).filter(([name]) => selectedToolNames.includes(name)),
  );
  // True quando la selezione contestuale ha ridotto il set: in tal caso diamo al
  // modello la via d'uscita del sentinel (#2) per un tool non allegato.
  const toolsReduced = enableTools && selectedToolNames.length < availableToolNames.length;

  // Modello Ollama: Horus usa il modello dedicato; Bowie quello di default.
  const ollamaModelName = requestedPersona === "horus" ? HORUS_MODEL_ID : undefined;

  // Task #77 — Ragionamento di Horus (qwen3:4b) fuori dallo stream utente.
  // Verificato live (2026-07-15) via curl: con `think:false` su Ollama 0.30.x
  // qwen3:4b NON smette di ragionare — il ragionamento (~4000+ char) finisce nel
  // `content` (tag <think> di apertura perso, </think> orfano solo se num_predict
  // è ampio), quindi in streaming i delta di ragionamento raggiungono il client
  // PRIMA che qualunque strip post-hoc possa agire (a differenza del path consult
  // non-streaming di inter-agent.ts, che bufferizza tutto e poi chiama stripThink).
  // Con `think:true` invece Ollama separa il ragionamento nel canale `thinking`:
  // il provider (ollama-ai-provider-v2) lo mappa a parti "reasoning" del fullStream,
  // NON a "text" del textStream. Siccome qui consumiamo SOLO `result.textStream`,
  // il ragionamento non raggiunge mai l'utente, mentre la risposta continua a fare
  // streaming token-per-token (nessun full-buffering, latenza percepita invariata:
  // il modello ragiona comunque, ma in silenzio). Scoping a Horus: Bowie resta su
  // think:false (Task #74 ne verifica separatamente la pulizia su qwen3:1.7b).
  const ollamaThinkSeparated = requestedPersona === "horus";

  // Task #5327 — immagini allegate → path multimodale (vision) sui provider cloud.
  const hasImages = (opts.images?.length ?? 0) > 0;

  // Latenza (Task #5327): scalda il modello Ollama in modo fire-and-forget, in
  // parallelo alla costruzione del contesto (RAG + profilo utente + memoria), così
  // è già residente quando parte lo stream. Skip per Ares/Quebracho (endpoint
  // dedicati) e quando ci sono immagini (si va sul path vision cloud, non Ollama).
  if (isOllamaConfigured && requestedPersona !== "ares" && requestedPersona !== "quebracho" && !hasImages) {
    warmOllama(requestedPersona === "horus" ? "horus" : "bowie", ollamaModelName);
  }

  // Latenza (Task #5327): la memoria conversazionale (query DB) parte SUBITO, in
  // parallelo con fetchUserLiveContext (anch'essa DB) usata nel build del system,
  // invece di attenderla sequenzialmente dopo.
  const memoryPromise: Promise<Array<{ role: "user" | "assistant"; content: string }>> =
    (opts.userId && !isAdmin) ? loadMemoryTurns(opts.userId) : Promise.resolve([]);

  let system: string;
  // Task #5322 — Miglior punteggio RAG del turno (null = nessun match). Usato a
  // fine turno per registrare le lacune di conoscenza (ai_knowledge_gaps).
  let ragTopScore: number | null = null;
  if (requestedPersona === "ares") {
    // Ares: diagnostica tecnica (solo admin), snapshot piattaforma nel prompt.
    // Task #5326 — knowledge transfer read-only Horus → Ares (RAG + prompt injection).
    const horusLearningContext = await buildAresLearningContext();
    system = buildAresSystemPrompt(opts.adminContext ?? "", horusLearningContext || undefined);
  } else if (requestedPersona === "quebracho") {
    // Task #4 — Quebracho: coordinatore/regista (solo admin), snapshot piattaforma.
    system = buildQuebrachoSystemPrompt(opts.adminContext ?? "");
    // Task #75 — Nadir agent-neutral anche per Quebracho. Quebracho NON usa il
    // tool-calling nativo (endpoint dedicato), quindi invece del tool `search_manual`
    // usiamo l'INTERCETTAZIONE PRE-COMPOSIZIONE: se il messaggio contiene un cue di
    // richiamo semantico, interroghiamo Nadir e iniettiamo i frammenti nel prompt.
    // Stesso gating (SEARCH_MANUAL_RE) di Bowie/Horus: mai su un messaggio generico.
    system += await buildNadirContextForPrompt(opts.message, {
      requesterId: opts.userId ?? null,
      includeAllUsers: isAdmin,
    });
  } else if (requestedPersona === "horus") {
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
    // Task #25 — in modalità admin, inietta lo stato LIVE dei motori di routing
    // così Horus risponde a "come sta andando il routing?" con dati reali.
    let routingStatus: string | undefined;
    if (isAdmin) {
      try {
        const { buildRoutingStatusSummary } = await import("../watchdog/routing-status-summary");
        routingStatus = await buildRoutingStatusSummary();
      } catch (e) {
        console.warn("[assistant/horus] routing-status non disponibile:", (e as Error).message);
      }
    }
    system = buildHorusSystemPrompt({
      platform: (isAdmin ? "web" : opts.platform) as "android" | "ios" | "web",
      userId: opts.userId,
      userContext: userContext || undefined,
      ragContext,
      isAdmin,
      codeContext: isAdmin ? opts.adminCodeContext : undefined,
      routingStatus,
    });
    // Task #50 — Memoria persistente di Horus: le note salvate via remember_note
    // in conversazioni precedenti vengono iniettate PRIMA del resto del prompt,
    // così Horus "ricorda" tra sessioni diverse. Solo Horus le vede (Bowie/Ares/
    // Quebracho non passano di qui). Best-effort: assente → nessuna sezione.
    const horusMemory = await loadHorusMemory();
    if (horusMemory) {
      system =
        "MEMORIA PERSISTENTE DI HORUS — note che hai salvato in conversazioni precedenti " +
        "(usale se pertinenti al turno corrente, non citarle testualmente se non serve):\n\n" +
        `${horusMemory}\n\n---\n\n${system}`;
    }
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
    ragTopScore = ragSnippets[0]?.score ?? null;
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

  // Task #7 (#2) — Se la selezione contestuale ha ridotto i tool disponibili,
  // istruiamo il modello a segnalare col sentinel [TOOL_MANCANTE: nome] un tool
  // che gli serve ma non è allegato, invece di allucinare i dati o scrivere una
  // tool call testuale. Il turno verrà rieseguito con l'intero set (vedi sotto).
  if (toolsReduced) {
    system += `\n\n${buildMissingToolInstruction(availableToolNames)}`;
  }

  // Task #3017 — Memoria: carica turni precedenti dal DB se userId è disponibile.
  // Task #4842 — La chat admin è in-sessione (nessuna persistenza cross-sessione):
  // non carichiamo né salviamo la memoria conversazionale per la modalità admin.
  const memoryTurns = await memoryPromise;

  // Unione: memoria DB + history dalla richiesta (la history della richiesta ha precedenza
  // sugli ultimi turni in memoria, evita duplicati sommari)
  const historySource = (opts.history ?? []).length > 0 ? (opts.history ?? []) : memoryTurns;

  // Task #5210 — Seed poetico: iniettato SOLO per Bowie alla prima apertura
  // (nessuna history precedente). Il modello "vede" la poesia come già pronunciata
  // da Bowie → non la ripete né la parafrasa. Non viene salvato nel DB.
  const isNewBowieConversation = requestedPersona === "bowie" && historySource.length === 0;
  // Task #5331 — Stesso pattern per Horus/Ares, ma il "primo turno" è deciso a
  // monte (route) confrontando la persona richiesta con quella attiva prima di
  // questo turno (personaFirstTurn), non dalla lunghezza della history: la
  // conversazione può già avere turni di Bowie quando Horus/Ares entrano per
  // la prima volta via handoff.
  const isNewHorusTurn = requestedPersona === "horus" && !!opts.personaFirstTurn;
  const isNewAresTurn = requestedPersona === "ares" && !!opts.personaFirstTurn;
  const isNewQuebrachoTurn = requestedPersona === "quebracho" && !!opts.personaFirstTurn;
  const introPoem = isNewBowieConversation
    ? BOWIE_INTRO_POEM
    : isNewHorusTurn
      ? HORUS_INTRO_POEM
      : isNewAresTurn
        ? ARES_INTRO_POEM
        : isNewQuebrachoTurn
          ? QUEBRACHO_INTRO_POEM
          : null;
  const seedTurns: Array<{ role: "user" | "assistant"; content: string }> = introPoem
    ? [{ role: "assistant", content: introPoem }]
    : [];

  // Task #5327 — Ultimo turno utente: multimodale se ci sono immagini (parti
  // testo + immagine), altrimenti stringa semplice. Le immagini arrivano già in
  // base64 dal route (risolte da object storage): le passiamo come Buffer così i
  // provider cloud (Gemini/OpenAI) le vedono senza dover fare fetch di URL autenticati.
  const baseHistory: ModelMessage[] = [
    ...seedTurns.map((m) => ({ role: m.role, content: m.content })),
    ...historySource.map((m) => ({ role: m.role, content: m.content })),
  ];
  const imageParts = (opts.images ?? []).map((img) => ({
    type: "image" as const,
    image: Buffer.from(img.base64, "base64"),
    mediaType: img.mediaType,
  }));
  const messages: ModelMessage[] = [
    ...baseHistory,
    hasImages
      ? { role: "user", content: [{ type: "text" as const, text: opts.message }, ...imageParts] }
      : { role: "user", content: opts.message },
  ];
  // Variante text-only: usata da Ares (endpoint non multimodale) e come fallback
  // Ollama quando nessun provider vision cloud è disponibile.
  const messagesTextOnly: ModelMessage[] = [
    ...baseHistory,
    { role: "user", content: opts.message },
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

  // Task #5210/#5331 — Poesia di benvenuto (Bowie alla prima apertura, Horus/Ares
  // al primo turno della persona) emessa SOLO al primo delta REALE del provider,
  // mai in anticipo. Prima (bug da code review) veniva emessa subito via
  // onTextDelta: se il provider falliva a zero delta il chiamante non-streaming
  // vedeva finalText riassegnato SENZA intro, ma il client SSE l'aveva già
  // ricevuta → comportamento divergente tra i due percorsi. Ritardando
  // l'emissione fino al primo delta, i due percorsi restano identici: nessuna
  // intro se il provider non produce nulla, intro+risposta se produce almeno un
  // delta (anche poi fallito a metà, nel qual caso resta come parziale degraded).
  let introEmitted = false;
  const ensureIntroEmitted = () => {
    if (!introPoem || introEmitted) return;
    introEmitted = true;
    const introBlock = introPoem + "\n\n";
    finalText += introBlock;
    opts.onTextDelta?.(introBlock);
  };

  // Task #5322 — Filtro di streaming che rimuove il marcatore di congedo
  // (HANDOFF_BACK_TO_BOWIE) dai delta prima che raggiungano il client. Tutti i
  // delta del MODELLO passano di qui; l'intro poetica e i messaggi di errore/
  // fallback (testo statico senza marcatore) sono emessi direttamente.
  const handoffFilter = createHandoffMarkerFilter();
  const emitAiDelta = (delta: string) => {
    if (opts.onTextDelta) handoffFilter.push(delta, opts.onTextDelta);
  };

  // Streaming helper riusabile per qualunque modello (Ollama o cloud).
  // Per Ollama: passa i tool e maxSteps per il tool calling server-side.
  // Sink di default per i delta AI: emette l'intro alla PRIMA emissione reale,
  // accumula finalText/aiText e inoltra al client (via handoff filter).
  const defaultSink = (delta: string) => {
    ensureIntroEmitted();
    finalText += delta;
    aiText += delta;
    providerEmittedAny = true;
    emitAiDelta(delta);
  };

  const streamWith = async (
    model: Parameters<typeof streamText>[0]["model"],
    isOllama: boolean,
    msgs: ModelMessage[] = messages,
    sink: (delta: string) => void = defaultSink,
    toolsForTurn: Record<string, unknown> = selectedTools,
  ) => {
    // Task #7 (#3) — allega SOLO i tool selezionati per il turno (o nessuno per
    // un messaggio conversazionale); il cloud gira comunque senza tool.
    const turnTools = isOllama && enableTools ? toolsForTurn : {};
    const result = streamText({
      model,
      system,
      messages: msgs,
      abortSignal: opts.signal,
      temperature: 0.3,
      // Task #3017 — Tool calling: solo per Ollama, con max 3 step
      // Task #5326 — abilitato per Bowie e Horus (Ares passa da un endpoint dedicato).
      ...(Object.keys(turnTools).length > 0
        ? { tools: turnTools as never, stopWhen: isStepCount(3) as never }
        : {}),
      // Bowie (qwen3:1.7b) e Horus (qwen3:4b) "pensano" di default. Per Horus
      // usiamo think:true (Task #77): Ollama separa il ragionamento nel canale
      // `thinking` → parti "reasoning" del fullStream, MAI nel textStream che
      // consumiamo qui, così il chain-of-thought grezzo non trapela in chat.
      // Per Bowie manteniamo think:false (comportamento invariato). Innocuo per
      // gli altri modelli (accettano entrambi i valori).
      ...(isOllama
        ? { providerOptions: { ollama: { think: ollamaThinkSeparated } } as never }
        : {}),
    });
    for await (const delta of result.textStream) {
      sink(delta);
    }
    const usage = await result.usage;
    tokensIn = usage?.inputTokens ?? 0;
    tokensOut = usage?.outputTokens ?? 0;
  };

  let done = false;

  // Task #86 — Trigger da chat: se un admin chiede a Bowie (o direttamente a
  // Horus) di far partire una delle due scansioni COMPLETE di Horus (analisi
  // codice+DB, o generazione manuale), NON rispondiamo con l'LLM né trattiamo la
  // richiesta come una consultazione mid-chat: avviamo direttamente il job giusto
  // in Horus e confermiamo. Stessa logica di intercettazione pre-composizione di
  // Ares/Quebracho. Gated ad admin (le scansioni sono capacità admin).
  if (!done && isAdmin) {
    const scanReq = detectHorusScanRequest(opts.message);
    if (scanReq) {
      opts.onPersona?.({ id: "horus", name: AI_ROSTER.horus.name });
      try {
        const res = await startHorusScan(scanReq.mode);
        const label = scanReq.mode === "analysis" ? "analisi completa del codice e del DB" : "generazione del manuale dell'app";
        const text = res.started
          ? scanReq.mode === "analysis"
            ? `Ho avviato l'${label}. Procedo da solo a lotti sull'intero codice (${res.status.filesPending} file da leggere, ${res.status.filesSkipped} invariati saltati) e sullo stato di integrità del DB; al termine produco proposte azionabili — resto in sola lettura, non applico nulla. Chiedimi "stato scansioni Horus" per l'avanzamento.`
            : `Ho avviato la ${label}. Leggo tutta l'app (${res.status.filesPending} file da leggere, ${res.status.filesSkipped} invariati saltati) e comporrò un manuale per funzionalità, che salvo nello storage di Nadir (versione precedente conservata) e reindicizzo. Chiedimi "stato scansioni Horus" per l'avanzamento.`
          : `Non sono riuscito ad avviare l'${label}: ${res.reason}.`;
        ensureIntroEmitted();
        finalText += text;
        aiText += text;
        providerEmittedAny = true;
        emitAiDelta(text);
        effectivePersona = "horus";
        provider = "horus-scan";
        modelId = "horus-scan";
        done = true;
        console.log(`[assistant] scansione Horus "${scanReq.mode}" avviata da chat (started=${res.started})`);
      } catch (scanErr) {
        console.warn("[assistant] avvio scansione Horus da chat fallito:", (scanErr as Error).message);
      }
    }
  }

  // 0) Task #5197 — Ares: AI di diagnostica su PC fisso dedicato (DIAG_OLLAMA_*).
  //    Endpoint separato (/api/chat HTTP diretta), NON la chain Ollama/cloud.
  //    Se Ares è offline, degrada con GRAZIA: Bowie riprende con un messaggio
  //    garbato (nessun crash, nessun secret stampato).
  if (requestedPersona === "ares") {
    opts.onPersona?.({ id: "ares", name: AI_ROSTER.ares.name });
    // Task #57 — Ares non passa da streamText (nessun tool-calling nativo: HTTP
    // diretta + una domanda composta), quindi non può esporre review_task_plan
    // come tool AI SDK come Bowie/Horus. Rileviamo qui una richiesta di revisione
    // piano nel messaggio grezzo dell'admin e, se riconosciuta, saltiamo la
    // composizione della domanda per chiamare direttamente reviewTaskPlan (stesso
    // lock a ciclo singolo e stesso "propone, non applica" della CLI).
    const aresReviewReq = detectPlanReviewRequest(opts.message);
    if (aresReviewReq) {
      try {
        const r = await reviewTaskPlan({
          ...aresReviewReq,
          agent: "ares",
          signal: opts.signal,
          allowFileRead: isAdmin,
        });
        const text = r.ok
          ? (r.review ?? "(nessuna review prodotta)") +
            (r.missingFiles && r.missingFiles.length > 0
              ? `\n\n⚠️ File citati nel piano ma non trovati nel repository: ${r.missingFiles.join(", ")}`
              : "")
          : `⚠️ Revisione non eseguita: ${r.error ?? "errore sconosciuto"}`;
        ensureIntroEmitted();
        finalText += text;
        aiText += text;
        providerEmittedAny = true;
        emitAiDelta(text);
        provider = "ares";
        modelId = getAresModelId();
        done = true;
        console.log(`[assistant] revisione task plan in-chat da Ares (ok=${r.ok})`);
      } catch (reviewErr) {
        console.warn("[assistant] revisione task plan Ares fallita:", (reviewErr as Error).message);
      }
    }
    if (!done) try {
      if (!isAresConfigured) throw new Error("Ares non configurato (ARES_OLLAMA_URL mancante).");
      // Task #5322 — Composizione: Bowie sintetizza il contesto in UNA domanda per
      // Ares (via Ollama locale). Ares riceve SOLO quella domanda + un vincolo di
      // sintesi nel system prompt, così risponde con la sua voce e in modo contenuto.
      const aresQuestion = await composeAresQuestion(opts.history ?? [], opts.message);
      const aresSystem = `${system}\n\nVINCOLO DI RISPOSTA: rispondi in modo CONTENUTO e STRUTTURATO (punti chiave, niente preamboli né divagazioni). Vai dritto alla diagnosi/azione.`;
      // Task #10 — VRAM arbiter: libera memoria sull'istanza Ollama di Ares da
      // eventuali altri modelli residenti prima di caricare il suo modello
      // pesante on-demand, poi li ricarica best-effort (mai altera l'esito).
      // Task #87 — La consultazione INTERATTIVA di Ares ha la precedenza sui job
      // long-running: la marca "busy" così un eventuale job di background cede il
      // passo tra un chunk e l'altro. La chat non attende mai il job.
      await withAresInteractivePriority(() =>
        withAresVramPriority(getAresModelId(), () =>
          streamAresChat({
            system: aresSystem,
            messages: [{ role: "user", content: aresQuestion }],
            signal: opts.signal,
            timeoutMs: 60_000,
            onDelta: (delta) => {
              ensureIntroEmitted();
              finalText += delta;
              aiText += delta;
              providerEmittedAny = true;
              emitAiDelta(delta);
            },
          }),
        ),
      );
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
  } else if (requestedPersona === "quebracho") {
    // 0.5) Task #4 — Quebracho: coordinatore/regista su Ollama (client dedicato,
    //      /api/chat HTTP diretta), NON la chain Ollama/cloud. Se offline degrada
    //      con GRAZIA: Bowie riprende con un messaggio garbato (mai fallback cloud).
    opts.onPersona?.({ id: "quebracho", name: AI_ROSTER.quebracho.name });
    // Task #57 — stesso intercettamento pre-composizione applicato ad Ares sopra:
    // Quebracho gira anch'esso su HTTP diretta senza tool-calling nativo.
    const quebrachoReviewReq = detectPlanReviewRequest(opts.message);
    if (quebrachoReviewReq) {
      try {
        const r = await reviewTaskPlan({
          ...quebrachoReviewReq,
          agent: "quebracho",
          signal: opts.signal,
          allowFileRead: isAdmin,
        });
        const text = r.ok
          ? (r.review ?? "(nessuna review prodotta)") +
            (r.missingFiles && r.missingFiles.length > 0
              ? `\n\n⚠️ File citati nel piano ma non trovati nel repository: ${r.missingFiles.join(", ")}`
              : "")
          : `⚠️ Revisione non eseguita: ${r.error ?? "errore sconosciuto"}`;
        ensureIntroEmitted();
        finalText += text;
        aiText += text;
        providerEmittedAny = true;
        emitAiDelta(text);
        provider = "quebracho";
        modelId = getQuebrachoModelId();
        done = true;
        console.log(`[assistant] revisione task plan in-chat da Quebracho (ok=${r.ok})`);
      } catch (reviewErr) {
        console.warn("[assistant] revisione task plan Quebracho fallita:", (reviewErr as Error).message);
      }
    }
    if (!done) try {
      if (!isQuebrachoConfigured) throw new Error("Quebracho non configurato (nessun URL Ollama disponibile).");
      // Composizione: Bowie sintetizza il contesto in UNA richiesta per Quebracho.
      const quebrachoQuestion = await composeQuebrachoQuestion(opts.history ?? [], opts.message);
      const quebrachoSystem = `${system}\n\nVINCOLO DI RISPOSTA: rispondi in modo CONTENUTO e STRUTTURATO (punti chiave, niente preamboli né divagazioni). Vai dritto al coordinamento/azione.`;
      await streamQuebrachoChat({
        system: quebrachoSystem,
        messages: [{ role: "user", content: quebrachoQuestion }],
        signal: opts.signal,
        timeoutMs: 60_000,
        onDelta: (delta) => {
          ensureIntroEmitted();
          finalText += delta;
          aiText += delta;
          providerEmittedAny = true;
          emitAiDelta(delta);
        },
      });
      provider = "quebracho";
      modelId = getQuebrachoModelId();
      done = true;
      console.log("[assistant] risposta da Quebracho (coordinamento)");
    } catch (quebrachoErr) {
      if (providerEmittedAny) {
        console.warn("[assistant] Quebracho fallito a metà stream, mantengo il parziale:", (quebrachoErr as Error).message);
        degraded = true;
        done = true;
      } else {
        console.warn("[assistant] Quebracho offline, fallback a Bowie:", (quebrachoErr as Error).message);
        effectivePersona = "bowie";
        opts.onPersona?.({ id: "bowie", name: AI_ROSTER.bowie.name });
        finalText =
          "Ho provato a passare la parola a Quebracho (il nostro coordinatore, gira su una macchina dedicata), ma al momento non risponde. Riprova più tardi.";
        provider = "fallback";
        modelId = "quebracho-offline";
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
  //    Task #5327 — con immagini si salta Ollama (non multimodale) e si va sul
  //    path vision cloud; il fallback text-only Ollama arriva DOPO il cloud.
  if (!done && isOllamaConfigured && !hasImages) {
    try {
      const ollamaPersona = requestedPersona === "horus" ? "horus" : "bowie";
      // Latenza (Task #5327): niente più probe /api/tags (fino a 2.5s). Saltiamo
      // Ollama solo se il ThinkCentre è NOTO offline (check locale con cache, <1ms).
      // Altrimenti tentiamo lo stream direttamente: un ECONNREFUSED fallisce comunque
      // in fretta e viene gestito dal catch (scalo alla chain cloud).
      if (await isThinkCentreOffline()) {
        console.warn("[assistant] ThinkCentre offline, scalo a chain cloud");
      } else {
        const ollamaModel = getOllamaModel(ollamaModelName, ollamaPersona) as unknown as Parameters<typeof streamText>[0]["model"];
        // Task #7 (#1/#2) — Gate: trattiene l'output finché non è chiaro se è
        // prosa (streaming normale), un sentinel di tool mancante o una tool call
        // scritta come TESTO. In quei due casi il testo grezzo non raggiunge mai
        // l'utente e facciamo il recovery qui sotto.
        const gate = createOllamaOutputGate(availableToolNames);
        await streamWith(ollamaModel, true, messages, (delta) => gate.push(delta, defaultSink));
        const gateResult = gate.flush(defaultSink);

        if (gateResult.mode === "sentinel") {
          // #2 — Il modello ha chiesto un tool non allegato: riesegui UNA volta
          // con l'intero set di tool della persona (silenzioso: il sentinel non è
          // mai stato emesso al client).
          console.log(`[assistant] tool mancante segnalato (${gateResult.sentinelTool}), retry con set completo`);
          await streamWith(ollamaModel, true, messages, defaultSink, toolsForPersona as Record<string, unknown>);
        } else if (gateResult.mode === "toolcall" && gateResult.toolCall) {
          // #1 — Il modello ha scritto la tool call come TESTO: eseguiamo il tool
          // e rigeneriamo la risposta con il risultato, così l'utente non vede il
          // JSON grezzo. Nessun tool nel follow-up (evita loop).
          const { name, arguments: rawArgs } = gateResult.toolCall;
          console.log(`[assistant] tool call testuale intercettata (${name}), eseguo e rigenero`);
          const tool = (toolsForPersona as unknown as Record<string, { execute?: (...args: unknown[]) => Promise<unknown> }>)[name];
          let toolOutput: unknown;
          try {
            toolOutput = await tool?.execute?.({ userId: opts.userId, ...rawArgs });
          } catch (toolErr) {
            toolOutput = { error: (toolErr as Error).message };
          }
          const followUp: ModelMessage[] = [
            ...messages,
            { role: "assistant", content: `Ho eseguito lo strumento ${name} e ho ottenuto: ${JSON.stringify(toolOutput)}` },
            { role: "user", content: "Rispondi ora all'utente in linguaggio naturale usando questi dati, senza mostrare JSON." },
          ];
          await streamWith(ollamaModel, true, followUp, defaultSink, {});
        }

        provider = "ollama";
        modelId = ollamaModelName ?? OLLAMA_FALLBACK_MODEL_ID;
        done = true;
        console.log(`[assistant] risposta da ollama (primario, persona=${effectivePersona})`);
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

  // Task #7 (#12) — Guardia fallback cloud legata ai tool: se il turno RICHIEDE
  // tool (selezione contestuale non vuota) ma Ollama/ThinkCentre è irraggiungibile,
  // NON ripieghiamo sul cloud — la chain cloud gira SENZA tool e produrrebbe una
  // risposta plausibile ma priva dei dati reali (statistiche, percorsi, stato
  // servizi). Meglio degradare con un messaggio esplicito. Il fallback cloud
  // resta per i turni puramente conversazionali (nessun tool) e per il path
  // vision (immagini). Salta se un parziale è già stato inviato (gestito sopra).
  if (!done && !providerEmittedAny && !hasImages && selectedToolNames.length > 0) {
    console.warn(
      `[assistant] Ollama non disponibile e turno con tool (${selectedToolNames.join(", ")}): blocco il fallback cloud senza tool`,
    );
    degraded = true;
    finalText +=
      "⚠️ Per rispondere mi servono i dati in tempo reale dai miei strumenti, ma al momento non sono raggiungibili. Riprova tra poco.";
    opts.onTextDelta?.(finalText);
    done = true;
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
      } else if (hasImages && isOllamaConfigured && !(await isThinkCentreOffline())) {
        // Task #5327 — Fallback text-only: c'erano immagini ma nessun provider
        // vision cloud ha risposto. Rispondiamo comunque via Ollama ignorando le
        // immagini (il modello locale non è multimodale) → l'utente riceve almeno
        // il testo, con un avviso che le immagini non sono state analizzate.
        try {
          const ollamaPersona = requestedPersona === "horus" ? "horus" : "bowie";
          const notice = "⚠️ Non riesco ad analizzare le immagini in questo momento, ma provo a rispondere al testo.\n\n";
          finalText += notice;
          opts.onTextDelta?.(notice);
          await streamWith(
            getOllamaModel(ollamaModelName, ollamaPersona) as unknown as Parameters<typeof streamText>[0]["model"],
            true,
            messagesTextOnly,
          );
          provider = "ollama";
          modelId = ollamaModelName ?? OLLAMA_FALLBACK_MODEL_ID;
          done = true;
          console.log("[assistant] fallback text-only via ollama (vision non disponibile)");
        } catch (fallbackErr) {
          degraded = true;
          finalText = `⚠️ Assistente non disponibile al momento (${(fallbackErr as Error).message.slice(0, 100)}). Riprova tra qualche istante.`;
          opts.onTextDelta?.(finalText);
        }
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

  // Task #5322 — Rilascia la coda residua del filtro di congedo (l'eventuale
  // tail trattenuto) e determina lo stato di congedo dal testo AI grezzo.
  if (opts.onTextDelta) handoffFilter.flush(opts.onTextDelta);
  const { text: cleanAiText, farewell } = stripHandoffMarker(aiText);
  // Il testo restituito ai chiamanti NON-streaming deve essere pulito dal
  // marcatore (l'intro poetica non lo contiene, quindi è sicuro strippare tutto).
  const cleanFinalText = stripHandoffMarker(finalText).text;

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
    persona: effectivePersona,
    sourceApp: opts.sourceApp ?? "main_app",
    error: degraded && !finalText.startsWith("⚠️") ? "degraded" : null,
  });

  // Task #3017 — Salva in memoria conversazionale (solo se non degraded e userId disponibile)
  // Task #4842 — La chat admin è in-sessione: non persistiamo i turni.
  // Task #5210 — Salva solo la risposta AI (aiText), mai il prefisso poetico statico.
  if (!degraded && opts.userId && cleanAiText && !isAdmin) {
    saveTurns(opts.userId, opts.message, cleanAiText).catch(() => {});
  }

  // Task #5322 — Lacune di conoscenza: se il RAG non ha trovato nulla di
  // pertinente (score basso o nullo) registriamo la domanda. Solo Bowie/Horus
  // (persone RAG-driven), mai admin/Ares. Best-effort, non blocca il turno.
  if (!isAdmin && effectivePersona !== "ares" && effectivePersona !== "quebracho") {
    void recordKnowledgeGap({
      question: opts.message,
      topScore: ragTopScore,
      persona: effectivePersona,
      sourceApp: opts.sourceApp ?? "main_app",
    });
  }

  return {
    text: cleanFinalText,
    provider,
    model: modelId,
    tokensIn,
    tokensOut,
    costUsd,
    degraded,
    persona: { id: effectivePersona, name: AI_ROSTER[effectivePersona].name },
    farewell,
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
