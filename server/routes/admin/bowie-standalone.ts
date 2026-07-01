/**
 * Admin — Bowie Standalone monitor (Task #5228)
 *
 * Monitor diagnostico del client "Bowie Terminal" (APK standalone). Espone SOLO
 * metadati: nessun contenuto dei messaggi viene mai letto o restituito.
 *
 *  GET    /stats            — snapshot completo per la schermata admin:
 *                             stato connessione (token registrati/attivi),
 *                             attività recente (solo metadati), statistiche di
 *                             consegna notification-reply (oggi), blocchi di
 *                             sicurezza (timestamp+userId), ripartizione persona
 *                             (ultimi 100 turni) e lista dispositivi.
 *  GET    /badge            — conteggio blocchi di sicurezza nelle ultime 24h
 *                             (per il badge rosso nel menu admin).
 *  DELETE /token/:id        — revoca un singolo device (set revoked_at), senza
 *                             toccare users.expoPushToken.
 */

import { Router, type Request, type Response } from "express";
import { db } from "../../db";
import { aiCallLogs, bowieTerminalTokens, users } from "@shared/db";
import { and, eq, gte, sql, desc, isNull, isNotNull } from "drizzle-orm";
import { sendSuccess, sendError } from "../../lib/api-response";
import { AI_ROSTER, type AiPersonaId } from "../../ai/assistant/roster";

const router = Router();

const SOURCE = "bowie_terminal";
const ACTIVE_WINDOW_MS = 24 * 60 * 60 * 1000;

// Righe "turno" (non di sola consegna): source bowie_terminal, persona nota e
// notification_status NULL così le righe di esito push non vengono contate due volte.
const turnFilter = and(
  eq(aiCallLogs.sourceApp, SOURCE),
  isNotNull(aiCallLogs.persona),
  isNull(aiCallLogs.notificationStatus),
);

router.get("/stats", async (_req: Request, res: Response) => {
  try {
    const now = Date.now();
    const activeSince = new Date(now - ACTIVE_WINDOW_MS);
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [
      tokenCounts,
      recentActivity,
      notifRows,
      securityRows,
      personaRows,
      devices,
    ] = await Promise.all([
      // Stato connessione: token registrati (non revocati) e attivi (heartbeat 24h).
      db
        .select({
          registered: sql<number>`count(*)::int`,
          active: sql<number>`count(*) filter (where ${bowieTerminalTokens.lastActiveAt} >= ${activeSince})::int`,
        })
        .from(bowieTerminalTokens)
        .where(isNull(bowieTerminalTokens.revokedAt)),

      // Attività recente — SOLO metadati (nessun contenuto messaggio).
      db
        .select({
          id: aiCallLogs.id,
          createdAt: aiCallLogs.createdAt,
          persona: aiCallLogs.persona,
          provider: aiCallLogs.provider,
          modelId: aiCallLogs.modelId,
          tokensIn: aiCallLogs.tokensIn,
          tokensOut: aiCallLogs.tokensOut,
          degraded: aiCallLogs.degraded,
          securityBlocked: aiCallLogs.securityBlocked,
          userId: aiCallLogs.userId,
        })
        .from(aiCallLogs)
        .where(turnFilter)
        .orderBy(desc(aiCallLogs.createdAt))
        .limit(30),

      // Consegna notification-reply di oggi (righe con notification_status).
      db
        .select({ status: aiCallLogs.notificationStatus, n: sql<number>`count(*)::int` })
        .from(aiCallLogs)
        .where(
          and(
            eq(aiCallLogs.sourceApp, SOURCE),
            isNotNull(aiCallLogs.notificationStatus),
            gte(aiCallLogs.createdAt, startOfToday),
          ),
        )
        .groupBy(aiCallLogs.notificationStatus),

      // Blocchi di sicurezza — SOLO timestamp + userId.
      db
        .select({ createdAt: aiCallLogs.createdAt, userId: aiCallLogs.userId })
        .from(aiCallLogs)
        .where(and(eq(aiCallLogs.sourceApp, SOURCE), eq(aiCallLogs.securityBlocked, true)))
        .orderBy(desc(aiCallLogs.createdAt))
        .limit(50),

      // Ripartizione persona sugli ultimi 100 turni.
      db
        .select({ persona: aiCallLogs.persona })
        .from(aiCallLogs)
        .where(turnFilter)
        .orderBy(desc(aiCallLogs.createdAt))
        .limit(100),

      // Dispositivi registrati (non revocati) + nickname utente.
      db
        .select({
          id: bowieTerminalTokens.id,
          deviceId: bowieTerminalTokens.deviceId,
          userId: bowieTerminalTokens.userId,
          nickname: users.nickname,
          createdAt: bowieTerminalTokens.createdAt,
          lastActiveAt: bowieTerminalTokens.lastActiveAt,
        })
        .from(bowieTerminalTokens)
        .leftJoin(users, eq(bowieTerminalTokens.userId, users.id))
        .where(isNull(bowieTerminalTokens.revokedAt))
        .orderBy(desc(bowieTerminalTokens.lastActiveAt)),
    ]);

    // Statistiche notifiche di oggi.
    let delivered = 0;
    let failed = 0;
    for (const r of notifRows) {
      if (r.status === "delivered") delivered = r.n;
      else if (r.status === "failed") failed = r.n;
    }

    // Ripartizione persona in percentuali (roster completo, anche a 0).
    const personaOrder = Object.keys(AI_ROSTER) as AiPersonaId[];
    const counts: Record<string, number> = {};
    for (const p of personaOrder) counts[p] = 0;
    for (const row of personaRows) {
      if (row.persona && row.persona in counts) counts[row.persona] += 1;
    }
    const totalTurns = personaRows.length;
    const personaBreakdown = personaOrder.map((id) => ({
      id,
      name: AI_ROSTER[id].name,
      count: counts[id],
      pct: totalTurns > 0 ? Math.round((counts[id] / totalTurns) * 100) : 0,
    }));

    return sendSuccess(res, {
      connection: {
        registered: tokenCounts[0]?.registered ?? 0,
        active: tokenCounts[0]?.active ?? 0,
      },
      recentActivity,
      notifications: {
        sent: delivered + failed,
        delivered,
        failed,
      },
      securityBlocks: securityRows,
      personaBreakdown,
      personaTotal: totalTurns,
      devices: devices.map((d) => ({
        ...d,
        active: d.lastActiveAt.getTime() >= now - ACTIVE_WINDOW_MS,
      })),
    });
  } catch (err) {
    console.error("[admin/bowie-standalone] stats error:", err);
    return sendError(res, 500, "Errore lettura statistiche Bowie Standalone");
  }
});

router.get("/badge", async (_req: Request, res: Response) => {
  try {
    const since = new Date(Date.now() - ACTIVE_WINDOW_MS);
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(aiCallLogs)
      .where(
        and(
          eq(aiCallLogs.sourceApp, SOURCE),
          eq(aiCallLogs.securityBlocked, true),
          gte(aiCallLogs.createdAt, since),
        ),
      );
    return sendSuccess(res, { securityBlocks24h: row?.n ?? 0 });
  } catch (err) {
    console.error("[admin/bowie-standalone] badge error:", err);
    return sendError(res, 500, "Errore conteggio blocchi di sicurezza");
  }
});

router.delete("/token/:id", async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const [updated] = await db
      .update(bowieTerminalTokens)
      .set({ revokedAt: sql`now()` })
      .where(and(eq(bowieTerminalTokens.id, id), isNull(bowieTerminalTokens.revokedAt)))
      .returning({ id: bowieTerminalTokens.id });
    if (!updated) return sendError(res, 404, "Dispositivo non trovato o già revocato");
    return sendSuccess(res, { success: true, id: updated.id });
  } catch (err) {
    console.error("[admin/bowie-standalone] revoke error:", err);
    return sendError(res, 500, "Errore revoca dispositivo");
  }
});

export default router;
