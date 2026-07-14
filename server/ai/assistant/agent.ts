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
  type KnowledgeEntry,
} from "./knowledge";
import { getOllamaModel, isOllamaConfigured, warmOllama } from "../../lib/ollama-client";
import { isThinkCentreOffline } from "../../lib/thinkcentre-offline";
import { AI_ROSTER, type AiPersonaId, createHandoffMarkerFilter, stripHandoffMarker } from "./roster";
import { recordKnowledgeGap } from "./knowledge-gaps";
import { composeAresQuestion } from "./ares-question";
import { isAresConfigured, getAresModelId, streamAresChat } from "../../lib/ares-client";
import { retrieveContext, formatRagContext, indexKnowledge } from "./rag";
import { OLLAMA_TOOLS, HORUS_TOOLS } from "./tools";
import { buildAresLearningContext } from "./ares-learning";
import { loadShareableAnalysisKnowledge } from "./horus-analyzer";
import { logAiCall } from "../../lib/ai-logger";
import { db } from "../../db";
import { aiConversationTurns } from "@shared/db";
import { eq, desc } from "drizzle-orm";
import { pruneUserMemory, MEMORY_TURNS_LIMIT } from "./memory-pruner";
import { fetchUserLiveContext } from "./user-context";
import { BOWIE_INTRO_POEM, HORUS_INTRO_POEM, ARES_INTRO_POEM } from "@shared/bowie-greeting";

const OLLAMA_FALLBACK_MODEL_ID = process.env.BOWIE_OLLAMA_MODEL ?? "mistral-nemo:latest";
// Task #5197 — Horus usa un modello Ollama dedicato (stessa infra di Bowie).
const HORUS_MODEL_ID = process.env.HORUS_OLLAMA_MODEL?.trim() || "bikerlink-routing";

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
  // Tool calling server-side abilitato per Bowie e Horus (Task #5326 — Horus
  // usa HORUS_TOOLS: meteo, stato ThinkCentre, eventi vicini, ricerca web).
  // Ares passa per un endpoint dedicato (nessun tool calling server-side).
  const enableTools = requestedPersona === "bowie" || requestedPersona === "horus";
  const toolsForPersona = requestedPersona === "horus" ? HORUS_TOOLS : OLLAMA_TOOLS;
  // Modello Ollama: Horus usa il modello dedicato; Bowie quello di default.
  const ollamaModelName = requestedPersona === "horus" ? HORUS_MODEL_ID : undefined;

  // Task #5327 — immagini allegate → path multimodale (vision) sui provider cloud.
  const hasImages = (opts.images?.length ?? 0) > 0;

  // Latenza (Task #5327): scalda il modello Ollama in modo fire-and-forget, in
  // parallelo alla costruzione del contesto (RAG + profilo utente + memoria), così
  // è già residente quando parte lo stream. Skip per Ares (endpoint dedicato) e
  // quando ci sono immagini (si va sul path vision cloud, non su Ollama).
  if (isOllamaConfigured && requestedPersona !== "ares" && !hasImages) {
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
    system = buildHorusSystemPrompt({
      platform: (isAdmin ? "web" : opts.platform) as "android" | "ios" | "web",
      userId: opts.userId,
      userContext: userContext || undefined,
      ragContext,
      isAdmin,
      codeContext: isAdmin ? opts.adminCodeContext : undefined,
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
  const introPoem = isNewBowieConversation
    ? BOWIE_INTRO_POEM
    : isNewHorusTurn
      ? HORUS_INTRO_POEM
      : isNewAresTurn
        ? ARES_INTRO_POEM
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
  const streamWith = async (
    model: Parameters<typeof streamText>[0]["model"],
    isOllama: boolean,
    msgs: ModelMessage[] = messages,
  ) => {
    const result = streamText({
      model,
      system,
      messages: msgs,
      abortSignal: opts.signal,
      temperature: 0.3,
      // Task #3017 — Tool calling: solo per Ollama, con max 3 step
      // Task #5326 — abilitato per Bowie e Horus (Ares passa da un endpoint dedicato).
      ...(isOllama && enableTools ? { tools: toolsForPersona as never, stopWhen: isStepCount(3) as never } : {}),
    });
    for await (const delta of result.textStream) {
      ensureIntroEmitted();
      finalText += delta;
      aiText += delta;
      providerEmittedAny = true;
      emitAiDelta(delta);
    }
    const usage = await result.usage;
    tokensIn = usage?.inputTokens ?? 0;
    tokensOut = usage?.outputTokens ?? 0;
  };

  let done = false;

  // 0) Task #5197 — Ares: AI di diagnostica su PC fisso dedicato (DIAG_OLLAMA_*).
  //    Endpoint separato (/api/chat HTTP diretta), NON la chain Ollama/cloud.
  //    Se Ares è offline, degrada con GRAZIA: Bowie riprende con un messaggio
  //    garbato (nessun crash, nessun secret stampato).
  if (requestedPersona === "ares") {
    opts.onPersona?.({ id: "ares", name: AI_ROSTER.ares.name });
    try {
      if (!isAresConfigured) throw new Error("Ares non configurato (ARES_OLLAMA_URL mancante).");
      // Task #5322 — Composizione: Bowie sintetizza il contesto in UNA domanda per
      // Ares (via Ollama locale). Ares riceve SOLO quella domanda + un vincolo di
      // sintesi nel system prompt, così risponde con la sua voce e in modo contenuto.
      const aresQuestion = await composeAresQuestion(opts.history ?? [], opts.message);
      const aresSystem = `${system}\n\nVINCOLO DI RISPOSTA: rispondi in modo CONTENUTO e STRUTTURATO (punti chiave, niente preamboli né divagazioni). Vai dritto alla diagnosi/azione.`;
      await streamAresChat({
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
        await streamWith(getOllamaModel(ollamaModelName, ollamaPersona) as unknown as Parameters<typeof streamText>[0]["model"], true);
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
  if (!isAdmin && effectivePersona !== "ares") {
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
