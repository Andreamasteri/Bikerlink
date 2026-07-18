/**
 * Admin — Conversazione osservabile a più agenti (Task #51)
 *
 * L'admin propone un ARGOMENTO e Bowie/Horus discutono a TURNI, in
 * diretta, mentre l'admin osserva. Il transcript è persistito così che, se la
 * connessione cade a metà, riaprendo la stessa conversazione si vedono i turni
 * già avvenuti e la si può far ripartire dall'ultimo turno completato.
 *
 *  GET  /group-chat/conversations            — lista conversazioni recenti (meta).
 *  GET  /group-chat/conversations/:id        — conversazione + tutti i turni.
 *  POST /group-chat/conversations            — (SSE) avvia una nuova conversazione.
 *  POST /group-chat/conversations/:id/resume — (SSE) riprende una conversazione
 *                                              interrotta dall'ultimo turno.
 *  POST /group-chat/conversations/:id/abort  — interrompe (stato "aborted").
 *
 * Solo admin (montato sotto _requireAdmin in routes/admin.ts). Nessuna
 * esposizione a utenti normali.
 */

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "../../db";
import {
  aiGroupConversations,
  aiGroupConversationTurns,
  type AiGroupConversation,
} from "@shared/db";
import { sendError, sendSuccess } from "../../lib/api-response";
import { logAiCall } from "../../lib/ai-logger";
import { startSseHeartbeat } from "../../ai/assistant/sse-heartbeat";
import {
  createStreamingSecurityFilter,
  matchesSensitive,
  SECURITY_REFUSAL_MESSAGE,
} from "../../ai/assistant/security-filter";
import { AI_ROSTER, type AiPersonaId } from "../../ai/assistant/roster";
import {
  clampMaxTurns,
  generateGroupTurn,
  normalizeParticipants,
  personaForTurn,
} from "../../ai/assistant/group-conversation";
import { APP_LANGUAGES, SOURCE_APP_LANGUAGE, type AppLanguageCode } from "@shared/languages";

const router = Router();

const startSchema = z.object({
  topic: z.string().trim().min(3).max(500),
  participants: z.array(z.string()).optional(),
  maxTurns: z.number().optional(),
  // Task #130 — Lingua dell'utente presente (stesso enum della chat 1:1). Se
  // assente ricade sull'italiano (client vecchi / comportamento storico).
  language: z.enum(APP_LANGUAGES).optional(),
});

function currentAdminId(req: Request): string | null {
  return req.session?.userId ?? null;
}

// ── GET /group-chat/conversations — lista recenti ────────────────────────────
router.get("/group-chat/conversations", async (req: Request, res: Response) => {
  try {
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const rows = await db
      .select({
        id: aiGroupConversations.id,
        topic: aiGroupConversations.topic,
        participants: aiGroupConversations.participants,
        maxTurns: aiGroupConversations.maxTurns,
        turnCount: aiGroupConversations.turnCount,
        status: aiGroupConversations.status,
        createdAt: aiGroupConversations.createdAt,
        updatedAt: aiGroupConversations.updatedAt,
        endedAt: aiGroupConversations.endedAt,
      })
      .from(aiGroupConversations)
      .orderBy(desc(aiGroupConversations.createdAt))
      .limit(limit);
    return sendSuccess(res, { conversations: rows });
  } catch (err) {
    console.error("[admin/ai-group-chat] list error:", err);
    return sendError(res, 500, "Errore lettura conversazioni di gruppo");
  }
});

// ── GET /group-chat/conversations/:id — dettaglio + turni ─────────────────────
router.get("/group-chat/conversations/:id", async (req: Request, res: Response) => {
  try {
    const convo = await loadConversation(String(req.params.id));
    if (!convo) return sendError(res, 404, "Conversazione non trovata");
    const turns = await loadTurns(convo.id);
    return sendSuccess(res, { conversation: convo, turns });
  } catch (err) {
    console.error("[admin/ai-group-chat] detail error:", err);
    return sendError(res, 500, "Errore lettura conversazione");
  }
});

// ── POST /group-chat/conversations — avvia (SSE) ─────────────────────────────
router.post("/group-chat/conversations", async (req: Request, res: Response) => {
  const parsed = startSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, 400, "Argomento non valido (min 3, max 500 caratteri).");
  }
  const participants = normalizeParticipants(parsed.data.participants);
  const maxTurns = clampMaxTurns(parsed.data.maxTurns);

  const [created] = await db
    .insert(aiGroupConversations)
    .values({
      topic: parsed.data.topic,
      participants,
      maxTurns,
      turnCount: 0,
      status: "running",
      language: parsed.data.language ?? SOURCE_APP_LANGUAGE,
      createdBy: currentAdminId(req),
    })
    .returning();

  return runConversationStream(res, created, 0);
});

// ── POST /group-chat/conversations/:id/resume — riprende (SSE) ────────────────
router.post("/group-chat/conversations/:id/resume", async (req: Request, res: Response) => {
  const convo = await loadConversation(String(req.params.id));
  if (!convo) return sendError(res, 404, "Conversazione non trovata");
  if (convo.status === "completed") {
    return sendError(res, 409, "Conversazione già conclusa.");
  }
  if (convo.status === "aborted") {
    return sendError(res, 409, "Conversazione interrotta dall'admin: non riprendibile.");
  }
  // Riparti dal numero di turni GIÀ persistiti (fonte di verità): un turno
  // interrotto a metà non era stato scritto, quindi verrà rigenerato.
  const turns = await loadTurns(convo.id);
  return runConversationStream(res, { ...convo, status: "running" }, turns.length);
});

// ── POST /group-chat/conversations/:id/abort — interrompe ────────────────────
router.post("/group-chat/conversations/:id/abort", async (req: Request, res: Response) => {
  try {
    const convo = await loadConversation(String(req.params.id));
    if (!convo) return sendError(res, 404, "Conversazione non trovata");
    if (convo.status === "running") {
      await db
        .update(aiGroupConversations)
        .set({ status: "aborted", endedAt: new Date(), updatedAt: new Date() })
        .where(eq(aiGroupConversations.id, convo.id));
    }
    return sendSuccess(res, { id: convo.id, status: "aborted" });
  } catch (err) {
    console.error("[admin/ai-group-chat] abort error:", err);
    return sendError(res, 500, "Errore interruzione conversazione");
  }
});

// ── Helpers ──────────────────────────────────────────────────────────────────

async function loadConversation(id: string): Promise<AiGroupConversation | null> {
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [row] = await db
    .select()
    .from(aiGroupConversations)
    .where(eq(aiGroupConversations.id, id))
    .limit(1);
  return row ?? null;
}

async function loadTurns(conversationId: string) {
  return db
    .select({
      turnIndex: aiGroupConversationTurns.turnIndex,
      persona: aiGroupConversationTurns.persona,
      content: aiGroupConversationTurns.content,
      provider: aiGroupConversationTurns.provider,
      modelId: aiGroupConversationTurns.modelId,
      createdAt: aiGroupConversationTurns.createdAt,
    })
    .from(aiGroupConversationTurns)
    .where(eq(aiGroupConversationTurns.conversationId, conversationId))
    .orderBy(asc(aiGroupConversationTurns.turnIndex));
}

/**
 * Cuore del turn-taking: apre lo stream SSE, genera i turni da `startTurnIndex`
 * fino a maxTurns (o all'abort/disconnessione), persiste ogni turno completato
 * NON appena disponibile e chiude con lo stato finale.
 */
async function runConversationStream(
  res: Response,
  convo: AiGroupConversation,
  startTurnIndex: number,
): Promise<void> {
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  const send = (event: string, data: unknown) => {
    if (res.writableEnded || res.destroyed) return;
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const abort = new AbortController();
  // L'abort DEVE ascoltare res.on("close") (mai req): su Node 20 + express.json()
  // req emette "close" alla fine del parse del body → morto in anticipo.
  res.on("close", () => abort.abort());
  const stopHeartbeat = startSseHeartbeat(res);

  const participants = (convo.participants ?? []) as AiPersonaId[];
  send("conversation", {
    id: convo.id,
    topic: convo.topic,
    participants,
    maxTurns: convo.maxTurns,
    turnCount: startTurnIndex,
    status: "running",
  });

  // Storia dei turni già avvenuti (per costruire i prompt di risposta alla ripresa).
  const priorTurns: Array<{ persona: AiPersonaId; content: string }> = [];
  if (startTurnIndex > 0) {
    const existing = await loadTurns(convo.id);
    for (const t of existing) {
      priorTurns.push({ persona: t.persona as AiPersonaId, content: t.content });
    }
  }

  let turnCount = startTurnIndex;
  try {
    for (let turnIndex = startTurnIndex; turnIndex < convo.maxTurns; turnIndex++) {
      if (abort.signal.aborted) break;

      const persona = personaForTurn(participants, turnIndex);
      const roster = AI_ROSTER[persona];
      send("turn-start", { turnIndex, persona: { id: persona, name: roster.name } });

      // Filtro di sicurezza in streaming: backstop lato server contro leak.
      const securityFilter = createStreamingSecurityFilter();
      const startedAt = Date.now();
      let result;
      try {
        result = await generateGroupTurn({
          topic: convo.topic,
          persona,
          participants,
          priorTurns,
          // Task #130 — lingua persistita sulla conversazione: la ripresa usa la
          // stessa lingua dell'avvio (fallback italiano per righe legacy).
          language: ((convo.language as AppLanguageCode | null) ?? SOURCE_APP_LANGUAGE),
          signal: abort.signal,
          onDelta: (delta) =>
            securityFilter.push(delta, (safe) => send("delta", { turnIndex, text: safe })),
        });
      } catch (err) {
        if (abort.signal.aborted) break; // disconnessione/stop: uscita pulita.
        const message = (err as Error).message ?? "Errore generazione turno";
        console.error(`[admin/ai-group-chat] turn ${turnIndex} (${persona}) error:`, message);
        send("error", { turnIndex, persona, message });
        break;
      }
      securityFilter.flush((safe) => send("delta", { turnIndex, text: safe }));

      const blocked = securityFilter.isBlocked || matchesSensitive(result.text);
      const finalText = blocked ? SECURITY_REFUSAL_MESSAGE : result.text;

      // Persisti il turno completato NON appena disponibile (ripresa-proof).
      await db
        .insert(aiGroupConversationTurns)
        .values({
          conversationId: convo.id,
          turnIndex,
          persona,
          content: finalText,
          provider: result.provider,
          modelId: result.modelId,
        })
        .onConflictDoNothing();

      turnCount = turnIndex + 1;
      await db
        .update(aiGroupConversations)
        .set({ turnCount, updatedAt: new Date() })
        .where(eq(aiGroupConversations.id, convo.id));

      // Task #51 — tracciatura AI: superficie "group" + riferimento conversazione,
      // così il monitoraggio admin distingue i turni di gruppo da quelli diretti.
      logAiCall({
        userId: convo.createdBy ?? null,
        provider: result.provider,
        modelId: result.modelId,
        tokensIn: 0,
        tokensOut: 0,
        latencyMs: Date.now() - startedAt,
        costUsd: 0,
        persona,
        sourceApp: "main_app",
        surface: "group",
        groupConversationId: convo.id,
        securityBlocked: blocked,
        error: blocked ? "security_blocked: group turn intercepted" : null,
      });

      priorTurns.push({ persona, content: finalText });
      send("turn-end", { turnIndex, persona: { id: persona, name: roster.name }, content: finalText });
    }

    // Conclusione naturale: raggiunti maxTurns SENZA abort/disconnessione.
    if (!abort.signal.aborted && turnCount >= convo.maxTurns) {
      await db
        .update(aiGroupConversations)
        .set({ status: "completed", endedAt: new Date(), updatedAt: new Date(), turnCount })
        .where(eq(aiGroupConversations.id, convo.id));
      send("done", { status: "completed", turnCount });
    } else if (!abort.signal.aborted) {
      // Stream terminato per errore di un turno: resta "running" (riprendibile).
      send("done", { status: "running", turnCount });
    }
  } catch (err) {
    console.error("[admin/ai-group-chat] stream error:", err);
    try { send("error", { message: (err as Error).message ?? "Errore imprevisto" }); } catch { /* */ }
  } finally {
    stopHeartbeat();
    if (!res.writableEnded) res.end();
  }
}

export default router;
