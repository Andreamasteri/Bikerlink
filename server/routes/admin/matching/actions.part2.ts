import { Router, type Request, type Response } from "express";
import { db } from "../../../db";
import { plannedRouteInvites, matchPreferences } from "@shared/db";
import { sendError } from "../../../lib/api-response";
import { isNull, and, eq, inArray } from "drizzle-orm";
import { sendPlannedRouteInvitePushNotifications } from "../../../push-notifications";
import { getDailyBudget, getIndividualPushCount, incrementIndividualPushCount } from "../../../matching/notifications/budget";

const router = Router();

/**
 * POST /api/admin/matching/backfill-planned-route-notifications
 *
 * One-shot (or capped) backfill: legge i record `planned_route_invites` con
 * `notifiedAt IS NULL` e `status = 'suggested'` e invia la push notification
 * mancante, rispettando:
 *   - toggle `plannedRouteInvite` in `match_preferences`
 *   - budget giornaliero individuale (notification_individual_daily_budget)
 *   - parametro `cap` (default 100) per limitare il volume per singola chiamata
 *
 * Sicuro da eseguire più volte (idempotente: aggiorna notifiedAt solo sui
 * record effettivamente notificati, i già notificati vengono saltati).
 */
router.post("/backfill-planned-route-notifications", async (req: Request, res: Response) => {
  const startedAt = Date.now();
  const rawCap = Number(req.body?.cap);
  const cap = Number.isFinite(rawCap) && rawCap >= 1 ? Math.min(Math.floor(rawCap), 500) : 100;

  try {
    // 1. Preleva gli inviti non ancora notificati (status=suggested, notifiedAt null)
    //    Ordine stabile (più vecchi prima) per fairness quando si applica il cap.
    const pending = await db
      .select({
        id: plannedRouteInvites.id,
        routeId: plannedRouteInvites.routeId,
        suggestedUserId: plannedRouteInvites.suggestedUserId,
      })
      .from(plannedRouteInvites)
      .where(
        and(
          isNull(plannedRouteInvites.notifiedAt),
          eq(plannedRouteInvites.status, "suggested"),
        ),
      )
      .orderBy(plannedRouteInvites.createdAt)
      .limit(cap);

    if (pending.length === 0) {
      return res.json({ success: true, processed: 0, notified: 0, skipped: 0, durationMs: Date.now() - startedAt });
    }

    // 2. Carica preferenze plannedRouteInvite per gli utenti coinvolti
    const userIds = [...new Set(pending.map((r) => r.suggestedUserId))];
    const prefRows = await db
      .select({ userId: matchPreferences.userId, on: matchPreferences.plannedRouteInvite })
      .from(matchPreferences)
      .where(inArray(matchPreferences.userId, userIds));
    const allowMap = new Map<string, boolean>();
    for (const p of prefRows) allowMap.set(p.userId, p.on);

    // 3. Carica budget giornaliero e contatori già usati oggi
    const budget = await getDailyBudget();

    // Pre-carica i contatori già usati oggi per tutti gli utenti coinvolti
    // e mantieni un contatore in-memory per evitare che lo stesso utente
    // superi il budget se ha più inviti pending su route diverse nel batch.
    const usedCountMap = new Map<string, number>();
    for (const uid of userIds) {
      usedCountMap.set(uid, await getIndividualPushCount(uid));
    }

    // 4. Per ogni route raggruppa gli utenti budget-eligible
    //    (raggruppiamo per routeId per sfruttare la funzione push che invia
    //     un batch per route)
    const byRoute = new Map<string, Array<{ id: string; suggestedUserId: string }>>();
    const terminalSkipIds: string[] = [];  // opt-out: non riceveranno mai la push → marca notifiedAt
    let budgetSkipped = 0;                 // over-budget: retryable domani, lascia notifiedAt NULL
    for (const inv of pending) {
      // skip TERMINALE: toggle disabilitato (null = default true).
      // Marcare notifiedAt ora evita che questi record saturino le run future.
      if (allowMap.get(inv.suggestedUserId) === false) {
        terminalSkipIds.push(inv.id);
        continue;
      }

      const used = usedCountMap.get(inv.suggestedUserId) ?? 0;
      if (used >= budget) { budgetSkipped++; continue; }

      // Riserva il "posto" in memoria prima di inviare, così se lo stesso utente
      // appare in un secondo invito nello stesso batch il check successivo lo blocca.
      usedCountMap.set(inv.suggestedUserId, used + 1);

      const list = byRoute.get(inv.routeId) ?? [];
      list.push({ id: inv.id, suggestedUserId: inv.suggestedUserId });
      byRoute.set(inv.routeId, list);
    }

    // Marca subito i record terminali così non intasano le run successive
    if (terminalSkipIds.length > 0) {
      await db
        .update(plannedRouteInvites)
        .set({ notifiedAt: new Date() })
        .where(inArray(plannedRouteInvites.id, terminalSkipIds));
    }

    // 5. Invia push e aggiorna notifiedAt
    let totalNotified = 0;
    for (const [routeId, invites] of byRoute) {
      const candidateUserIds = invites.map((i) => i.suggestedUserId);
      const inviteByUserId = new Map<string, string>(invites.map((i) => [i.suggestedUserId, i.id]));

      const actuallySentUserIds = await sendPlannedRouteInvitePushNotifications(
        candidateUserIds,
        { routeId },
      );

      if (actuallySentUserIds.length > 0) {
        const sentInviteIds = actuallySentUserIds
          .map((uid) => inviteByUserId.get(uid))
          .filter((id): id is string => id !== undefined);

        for (const uid of actuallySentUserIds) {
          await incrementIndividualPushCount(uid, 1);
        }

        if (sentInviteIds.length > 0) {
          await db
            .update(plannedRouteInvites)
            .set({ notifiedAt: new Date() })
            .where(inArray(plannedRouteInvites.id, sentInviteIds));
        }

        totalNotified += actuallySentUserIds.length;
      }
    }

    const durationMs = Date.now() - startedAt;
    console.log(
      `[admin/backfill-planned-route-notifications] pending=${pending.length} notified=${totalNotified} terminalSkipped=${terminalSkipIds.length} budgetSkipped=${budgetSkipped} in ${durationMs}ms`,
    );
    return res.json({
      success: true,
      processed: pending.length,
      notified: totalNotified,
      terminalSkipped: terminalSkipIds.length,
      budgetSkipped,
      durationMs,
    });
  } catch (error) {
    console.error("[admin/backfill-planned-route-notifications] error:", error);
    return sendError(res, 500, "Errore backfill notifiche planned route");
  }
});

export default router;
