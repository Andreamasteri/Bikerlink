// Task #2698 — Endpoint AI Assistant utente (NON admin). Sessione richiesta.
// - GET  /api/ai/assistant/config?platform=ios|android — config piattaforma
// - POST /api/ai/assistant/message — SSE streaming risposta dell'agente
// Azioni, prefs, history e telemetry sono splittati (limite 600 righe) in
// ai-assistant-actions.ts e ai-assistant-prefs.ts, montati sotto in fondo.
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { loadAssistantConfig } from "../ai/assistant/config";
import { runAssistantAgent, extractActions } from "../ai/assistant/agent";
import { type AiPersonaId } from "../ai/assistant/roster";
import {
  isCoordinatorControlRequest,
  isCoordinatorStatusRequest,
  askHorusForCoordinatorDirective,
  getCoordinatorStatusNote,
} from "../ai/assistant/coordinator-bridge";
import { resolvePersonaForTurn, commitPersonaAfterTurn } from "../ai/assistant/persona-state";
import { hasAnyAiProvider, AI_NO_PROVIDER_MESSAGE } from "../ai/moderation/provider";
import {
  createStreamingSecurityFilter,
  matchesSensitive,
  SECURITY_REFUSAL_MESSAGE,
} from "../ai/assistant/security-filter";
import { logAiCall } from "../lib/ai-logger";
import {
  ASSISTANT_ACTIONS,
  isWhitelistedAction,
  type AssistantActionId,
} from "../ai/assistant/actions";
import { ASSISTANT_KNOWLEDGE, type KnowledgeEntry } from "../ai/assistant/knowledge";
import { logAssistantEvent } from "../ai/assistant/telemetry";
import {
  ADMIN_ASSISTANT_ACTIONS,
  isWhitelistedAdminAction,
  type AdminAssistantActionId,
} from "../ai/assistant/admin-actions";
import { sendError } from "../lib/api-response";
import { requireUser, messageLimiter, parsePlatform, loadCustomFaqs } from "./ai-assistant-helpers";
import aiAssistantActionsRouter from "./ai-assistant-actions";
import aiAssistantPrefsRouter from "./ai-assistant-prefs";
import aiAssistantImagesRouter, { resolveAssistantImageBuffer } from "./ai-assistant-images";

const router = Router();

// ── GET /config ───────────────────────────────────────────────────────────
router.get("/ai/assistant/config", requireUser, async (req: Request, res: Response) => {
  try {
    const platform = parsePlatform(req.query.platform);
    const config = await loadAssistantConfig(platform);
    res.json({ platform, config, knowledge: ASSISTANT_KNOWLEDGE });
  } catch (e) {
    console.error("[ai-assistant/config]", e);
    sendError(res, 500, "Errore lettura config");
  }
});

// ── POST /message — SSE streaming ─────────────────────────────────────────
const MessageBody = z.object({
  message: z.string().min(1).max(2000),
  // Task #4842 — "admin" abilita la chat assistant embeddata nel pannello admin.
  platform: z.enum(["android", "ios", "web", "admin"]).optional(),
  history: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().min(1).max(4000),
  })).max(10).optional(),
  // Task #5228 — client di origine per l'attribuzione nel monitor Bowie Standalone.
  source: z.enum(["main_app", "bowie_terminal"]).optional(),
  // Task #5327 — URL immagini allegate (relativi, restituiti da POST /images).
  // Risolti server-side in base64 e passati all'agent per il path vision.
  imageUrls: z.array(z.string().min(1).max(300)).max(4).optional(),
});

router.post("/ai/assistant/message", requireUser, messageLimiter, async (req: Request, res: Response) => {
  const parsed = MessageBody.safeParse(req.body);
  if (!parsed.success) { sendError(res, 400, parsed.error.issues[0].message); return; }
  const user = (req as Request & { sessionUser?: { id: string; role?: string | null; assistantPrefs?: { disabled?: boolean } | null } }).sessionUser!;

  const rawPlatform = parsed.data.platform ?? "android";
  // Task #4842 — Modalità admin: solo per utenti con ruolo admin. Bypassa il
  // gating per-piattaforma (prefs utente, config.enabled) perché è una feature
  // operativa del pannello admin, non l'assistente utente.
  const isAdminMode = rawPlatform === "admin";
  if (isAdminMode && user.role !== "admin") {
    sendError(res, 403, "Accesso riservato agli amministratori");
    return;
  }

  let allowedActions: string[] = [];
  let customFaqs: KnowledgeEntry[] = [];

  if (!isAdminMode) {
    if (user.assistantPrefs?.disabled) {
      sendError(res, 403, "Assistente disattivato dalle tue preferenze");
      return;
    }
    const platformForConfig = parsePlatform(rawPlatform);
    const config = await loadAssistantConfig(platformForConfig);
    if (!config.enabled) {
      sendError(res, 403, "Assistente disattivato dall'amministratore");
      return;
    }
    allowedActions = Object.entries(config.actions)
      .filter(([, on]) => on)
      .map(([id]) => id);
    customFaqs = await loadCustomFaqs(config.customFaqKeys);
  }

  // Task #5197 — Risoluzione persona / handoff (Bowie è sempre l'entry point):
  //   - Admin che invoca Ares ("chiama Ares") → Ares (diagnostica, solo admin).
  //   - Utente che chiede un percorso/itinerario → Horus (specialista navigazione).
  //   - Tutto il resto → Bowie.
  // NOTA: risolta PRIMA del precheck provider, perché Ares ha un provider
  // dedicato (DIAG_OLLAMA_*) non coperto da hasAnyAiProvider().
  // Task #5322 — La persona è ora deterministica E persistente: lo stato attivo
  // (ai_conversation_state, con TTL) rende sticky l'handoff tra i turni finché
  // l'utente non torna esplicitamente indietro o la persona emette il congedo.
  // sourceApp separa il contesto admin dal main_app dell'utente.
  const personaSourceApp = isAdminMode ? "admin" : (parsed.data.source ?? "main_app");
  const personaResolution = await resolvePersonaForTurn({
    userId: user.id,
    sourceApp: personaSourceApp,
    message: parsed.data.message,
    isAdmin: isAdminMode,
  });
  const persona: AiPersonaId = personaResolution.persona;
  // Task #5331 — vera prima apparizione di Horus/Ares in questa conversazione
  // (mai mostrata prima, calcolato su introShownPersonas: sopravvive ai cicli
  // Bowie ⇄ Horus/Ares ⇄ Bowie). Bowie usa un criterio separato (agent.ts).
  const personaFirstTurn = personaResolution.personaFirstTurn;

  let effectiveMessage = parsed.data.message;

  // Task #2825 — Nessun provider AI configurato: rispondi 503 con il nome delle
  // variabili mancanti così il client può mostrare il banner "Funzione AI non attivata".
  // Task #5197 — Ares usa il provider dedicato (DIAG_OLLAMA_*): se è configurato,
  // l'invocazione di Ares NON deve essere bloccata da hasAnyAiProvider() (che
  // considera solo i provider di Bowie/Horus). Se Ares è offline, l'agent degrada
  // con grazia (messaggio garbato), non con un 503.
  if (persona !== "ares" && !hasAnyAiProvider()) {
    sendError(res, 503, AI_NO_PROVIDER_MESSAGE);
    return;
  }

  // Task #5318 — Matching Coordinator via Bowie/chat. DEVE stare DOPO il
  // precheck 503 sopra: il ramo di CONTROLLO ha effetti collaterali (applica
  // una direttiva via Horus), quindi non deve mai eseguirsi se la richiesta
  // finirebbe comunque in 503 ("azione applicata ma richiesta fallita").
  //  - Richieste di CONTROLLO (write-intent: "metti in pausa", "forza un
  //    ciclo ora"...) relayano a Horus, che decide E applica l'eventuale
  //    direttiva. Horus ha autorità di scrittura reale sul coordinator, quindi
  //    questo path è riservato ESCLUSIVAMENTE alla chat admin (isAdminMode,
  //    già verificato user.role==='admin' sopra) — MAI alla chat utente
  //    ordinaria, o qualsiasi utente autenticato potrebbe mettere in pausa il
  //    matching dell'intera piattaforma scrivendo un messaggio.
  //  - Richieste puramente INFORMATIVE ("il matching è fermo?", "come va il
  //    matching?") sono una lettura, aperta a QUALSIASI utente: leggono lo
  //    snapshot direttamente (getCoordinatorStatusNote), senza mai passare da
  //    Horus/Ollama — funzionano anche se Horus/il ThinkCentre sono offline.
  // Timeout stretto e fail-safe: in caso di errore, Bowie risponde
  // normalmente senza la nota (nessun blocco della chat).
  if (persona === "bowie" && isAdminMode && isCoordinatorControlRequest(parsed.data.message)) {
    try {
      const relay = await askHorusForCoordinatorDirective(parsed.data.message);
      effectiveMessage = `${parsed.data.message}\n\n[Nota di sistema — Horus ha valutato la richiesta sul matching: direttiva="${relay.directive}", applicata=${relay.applied ? "sì" : "no"}, motivo="${relay.reason}". Rispondi all'utente in modo naturale su questa base, senza esporre dettagli tecnici interni.]`;
    } catch (e) {
      console.warn("[ai-assistant/coordinator-relay]", (e as Error).message);
    }
  } else if (persona === "bowie" && isCoordinatorStatusRequest(parsed.data.message)) {
    try {
      const statusNote = await getCoordinatorStatusNote();
      effectiveMessage = `${parsed.data.message}\n\n${statusNote}`;
    } catch (e) {
      console.warn("[ai-assistant/coordinator-status]", (e as Error).message);
    }
  }

  // Task #4842 — Snapshot admin sintetico + codice sorgente (GitHub) iniettati nel system prompt.
  let adminContext: string | undefined;
  let adminCodeContext: string | undefined;
  if (isAdminMode) {
    try {
      const { buildAdminContextSnapshot } = await import("../ai/assistant/admin-context");
      const codePersona = persona === "horus" || persona === "ares" ? persona : "bowie";
      const result = await buildAdminContextSnapshot(codePersona);
      adminContext = result.snapshot;
      adminCodeContext = result.codeContext || undefined;
    } catch (e) {
      console.warn("[ai-assistant/admin-context]", (e as Error).message);
      adminContext = "(snapshot piattaforma non disponibile al momento)";
    }
  }

  // SSE
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();
  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };
  const abort = new AbortController();
  req.on("close", () => abort.abort());

  await logAssistantEvent({
    eventType: "message_sent",
    platform: rawPlatform,
    userRole: user.role ?? null,
    userId: user.id,
    payload: { messageLen: parsed.data.message.length },
  });

  // Task #5222 — Filtro di sicurezza in streaming: trattiene una coda di
  // caratteri e blocca l'emissione se rileva un pattern sensibile (token,
  // credenziali, connection string, env var). Difesa in profondità: il system
  // prompt vieta già il leak, questo filtro è il backstop lato server.
  const securityFilter = createStreamingSecurityFilter();

  // Task #5327 — Risolvi le immagini allegate (object storage → base64) per il
  // path multimodale. Best-effort: le immagini non risolvibili vengono ignorate.
  let images: Array<{ base64: string; mediaType: string }> | undefined;
  if (parsed.data.imageUrls && parsed.data.imageUrls.length > 0) {
    const resolved = await Promise.all(
      parsed.data.imageUrls.map((u) => resolveAssistantImageBuffer(u)),
    );
    const usable = resolved.filter((r): r is { base64: string; mediaType: string } => r !== null);
    if (usable.length > 0) images = usable;
  }

  try {
    const result = await runAssistantAgent({
      message: effectiveMessage,
      platform: rawPlatform as "android" | "ios" | "web" | "admin",
      allowedActions,
      customFaqs,
      history: parsed.data.history ?? [],
      images,
      // Task #4842 — userId solo in modalità admin (per il logging ai_call_logs).
      // Per gli utenti normali resta omesso, preservando il comportamento esistente
      // (nessuna persistenza di memoria conversazionale via questa route).
      // Soluzione 2: userId passato sempre — fetchUserLiveContext lo usa per
      // iniettare profilo/giri/proposte nel system prompt (non-admin mode).
      userId: user.id,
      adminContext,
      adminCodeContext,
      // Task #5197 — persona risolta a monte + notifica al client di CHI risponde.
      persona,
      // Task #5331 — primo turno di Horus/Ares → intro poetica dedicata.
      personaFirstTurn,
      // Task #5228 — attribuzione client di origine.
      sourceApp: parsed.data.source ?? "main_app",
      onPersona: (p) => send("persona", p),
      signal: abort.signal,
      onTextDelta: (delta) => securityFilter.push(delta, (safe) => send("delta", { text: safe })),
    });

    // Task #5322 — Persisti lo stato "persona attiva" (sticky handoff con TTL).
    // farewell o persona=bowie → torna a Bowie; altrimenti rinnova lo stato.
    await commitPersonaAfterTurn({
      userId: user.id,
      sourceApp: personaSourceApp,
      persona: result.persona.id,
      reason: personaResolution.reason,
      farewell: result.farewell,
    });

    // Rilascia la coda residua del filtro e determina lo stato di blocco
    // (controllo finale anche sul testo completo come ulteriore rete).
    securityFilter.flush((safe) => send("delta", { text: safe }));
    const blocked = securityFilter.isBlocked || matchesSensitive(result.text);

    if (blocked) {
      console.warn(`[ai-assistant/security] output bloccato (persona=${result.persona}, user=${user.id})`);
      logAiCall({
        userId: user.id,
        provider: result.provider,
        modelId: result.model,
        tokensIn: 0,
        tokensOut: 0,
        costUsd: 0,
        securityBlocked: true,
        persona: result.persona.id,
        sourceApp: parsed.data.source ?? "main_app",
        error: "security_blocked: output filter intercepted sensitive content",
      });
      send("done", {
        text: SECURITY_REFUSAL_MESSAGE,
        provider: result.provider,
        model: result.model,
        costUsd: result.costUsd,
        degraded: result.degraded,
        actionsCount: 0,
        persona: result.persona,
        securityBlocked: true,
      });
      res.end();
      return;
    }

    const { cleanText, actions } = extractActions(result.text);
    // Filtra azioni in base alla modalità:
    // - admin: whitelist azioni admin (eseguite server-side dopo conferma)
    // - utente: whitelist globale E abilitate dall'admin per la piattaforma
    const safeActions = isAdminMode
      ? actions.filter((a) => isWhitelistedAdminAction(a.actionId))
      : actions.filter((a) =>
          isWhitelistedAction(a.actionId) && allowedActions.includes(a.actionId),
        );
    for (const a of safeActions) {
      if (isAdminMode) {
        const def = ADMIN_ASSISTANT_ACTIONS[a.actionId as AdminAssistantActionId];
        send("action", {
          actionId: a.actionId,
          params: a.params,
          confirmLabel: def.confirmLabel,
          scope: "admin",
        });
      } else {
        const def = ASSISTANT_ACTIONS[a.actionId as AssistantActionId];
        send("action", {
          actionId: a.actionId,
          params: a.params,
          confirmKey: def.confirmKey,
        });
      }
      await logAssistantEvent({
        eventType: "action_proposed",
        platform: rawPlatform,
        userRole: user.role ?? null,
        userId: user.id,
        payload: { actionId: a.actionId },
      });
    }
    send("done", {
      text: cleanText,
      provider: result.provider,
      model: result.model,
      costUsd: result.costUsd,
      degraded: result.degraded,
      actionsCount: safeActions.length,
      persona: result.persona,
    });
    res.end();
  } catch (err) {
    console.error("[ai-assistant/message]", err);
    try { send("error", { code: 500, message: (err as Error).message }); } catch { /* */ }
    res.end();
  }
});

// ── Sotto-router splittati per il limite 600 righe ────────────────────────
router.use(aiAssistantActionsRouter);
router.use(aiAssistantPrefsRouter);
router.use(aiAssistantImagesRouter);

export default router;
