// Task #2603 — estratto da server/routes/admin/matching.ts (mechanical split)
import { Router, type Request, type Response } from "express";
import { db, pool } from "../../../db";
import { bikerZavarrinaMatches, bikerBikerMatches, proposalProfileMatches, plannedRouteInvites, matchPreferences } from "@shared/db";
import { MATCHING_REGISTRY } from "@shared/matching-registry";
import { sendSuccess, sendError } from "../../../lib/api-response";
import { sql, or, eq, isNull, and, inArray } from "drizzle-orm";
import { triggerMatchingRun } from "../../../matching-engine";
import { forceUnlockMatching, getMatchingLockState } from "../../../matching/scheduler";
import { ITALIAN_REGION_CENTROIDS } from "../../../lib/region-centroids";
import { sendPlannedRouteInvitePushNotifications } from "../../../push-notifications";
import { getDailyBudget, getIndividualPushCount, incrementIndividualPushCount } from "../../../matching/notifications/budget";

const router = Router();

router.post("/match-settings/reset-all", async (_req: Request, res: Response) => {
  try {
    // Task #2527 — derivato dal registry (niente più lista hardcoded).
    // Filtra solo le colonne effettivamente presenti su `match_preferences`
    // (gli slot affinity senza colonna fisica vengono ignorati a runtime).
    const client = await pool.connect();
    let schemaCols: Set<string>;
    try {
      const schemaRes = await client.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema='public' AND table_name='match_preferences'`
      );
      schemaCols = new Set(schemaRes.rows.map((r) => r.column_name));
    } finally {
      client.release();
    }
    const cols = MATCHING_REGISTRY
      .map((t) => t.prefColumn)
      .filter((c) => schemaCols.has(c));
    if (cols.length === 0) {
      return sendError(res, 500, "Nessuna colonna da resettare");
    }
    const setExpr = cols.map((c) => `${c} = true`).join(", ");
    const result = await db.execute(sql.raw(
      `UPDATE match_preferences SET ${setExpr}, updated_at = NOW()`
    ));
    const affected = (result.rowCount as number | null) ?? 0;
    return res.json({ success: true, affected, columns: cols.length });
  } catch (_error) {
    return sendError(res, 500, "Errore reset settings matching");
  }
});

router.post("/matches/recalculate-all", async (_req: Request, res: Response) => {
  try {
    const result = triggerMatchingRun();
    return res.json(result);
  } catch (_error) {
    return sendError(res, 500, "Errore ricalcolo matching");
  }
});

router.post("/force-matching", async (_req: Request, res: Response) => {
  try {
    triggerMatchingRun();
    return sendSuccess(res, { status: "triggered" });
  } catch (_error) {
    return sendError(res, 500, "Errore avvio matching");
  }
});

router.post("/matching/trigger", async (_req: Request, res: Response) => {
  try {
    triggerMatchingRun();
    return res.json({ status: "triggered" });
  } catch (_error) {
    return sendError(res, 500, "Errore avvio matching");
  }
});

router.delete("/reset-matches", async (_req: Request, res: Response) => {
  try {
    const bzDeleted = await db.delete(bikerZavarrinaMatches).returning({ id: bikerZavarrinaMatches.id });
    const bbDeleted = await db.delete(bikerBikerMatches).returning({ id: bikerBikerMatches.id });
    const unlock = forceUnlockMatching();
    console.log(
      `[admin/reset-matches] biker_biker=${bbDeleted.length}, biker_zavorrina=${bzDeleted.length}, wasRunning=${unlock.wasRunning}`
    );
    return res.json({
      success: true,
      deleted: {
        bikerBiker: bbDeleted.length,
        bikerZavorrina: bzDeleted.length,
        total: bbDeleted.length + bzDeleted.length,
      },
      unlock,
    });
  } catch (error) {
    console.error("[admin/reset-matches] error:", error);
    return sendError(res, 500, "Errore reset match");
  }
});

router.delete("/users/:userId/matches", async (req: Request, res: Response) => {
  try {
    const userId = req.params.userId as string;
    if (!userId) return sendError(res, 400, "userId mancante");
    const bbResult = await db.delete(bikerBikerMatches).where(
      or(eq(bikerBikerMatches.biker1Id, userId), eq(bikerBikerMatches.biker2Id, userId))
    ).returning({ id: bikerBikerMatches.id });
    const bzResult = await db.delete(bikerZavarrinaMatches).where(
      or(eq(bikerZavarrinaMatches.bikerId, userId), eq(bikerZavarrinaMatches.zavarrinaId, userId))
    ).returning({ id: bikerZavarrinaMatches.id });
    const ppResult = await db.delete(proposalProfileMatches).where(
      or(eq(proposalProfileMatches.bikerId, userId), eq(proposalProfileMatches.zavarrinaId, userId))
    ).returning({ id: proposalProfileMatches.id });
    console.log(`[admin/users/${userId}/matches] bb=${bbResult.length} bz=${bzResult.length} pp=${ppResult.length}`);
    return res.json({
      success: true,
      lastDeletedAt: new Date().toISOString(),
      deleted: {
        bikerBiker: bbResult.length,
        bikerZavorrina: bzResult.length,
        proposalProfile: ppResult.length,
        total: bbResult.length + bzResult.length + ppResult.length,
      },
    });
  } catch (error) {
    console.error("[admin/users/:userId/matches] error:", error);
    return sendError(res, 500, "Errore eliminazione match utente");
  }
});

router.post("/matching/force-unlock", async (_req: Request, res: Response) => {
  try {
    const before = getMatchingLockState();
    const unlock = forceUnlockMatching();
    return res.json({ success: true, before, unlock });
  } catch (error) {
    console.error("[admin/matching/force-unlock] error:", error);
    return sendError(res, 500, "Errore force-unlock matching");
  }
});

/**
 * POST /api/admin/matching/backfill-real-users
 *
 * Popola le tabelle richieste dal motore di matching per gli utenti reali
 * esistenti. Sicuro da eseguire più volte (idempotente via ON CONFLICT).
 *
 * Azioni:
 *  A) Inserisce match_preferences (valori di default) per ogni utente reale
 *     attivo non di servizio che ne è privo.
 *  B) Recupera le coordinate mancanti in user_profiles dalla catena di
 *     fallback: (1) first_login_lat/lng, (2) ultima posizione GPS in
 *     route_points, (3) centroide della regione. NON sovrascrive mai
 *     coordinate già presenti. NON inventa coordinate se nessuna fonte è
 *     disponibile.
 *
 * In produzione: deployare il server e chiamare questo endpoint DALL'ADMIN
 * dopo il publish. Non eseguire mai script di migrazione dati direttamente
 * sul DB di produzione.
 */
router.post("/matching/backfill-real-users", async (_req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    // --- step 0: marca gli account di servizio noti come is_system=true ---
    // Idempotente: non tocca account già marcati.
    const SERVICE_EMAILS = [
      "admin@bikerlink.it",
      "mod@bikerlink.it",
      "smoke@bikerlink.test",
      "noreply-system@bikerlink.internal",
      "applereview@bikerlink.it",
      "googlereview@bikerlink.it",
    ];
    const serviceMarked = await client.query(`
      UPDATE users SET is_system = true
      WHERE LOWER(email) = ANY($1::text[])
        AND is_system = false
    `, [SERVICE_EMAILS]);
    const serviceMarkedCount = serviceMarked.rowCount ?? 0;
    console.log(`[backfill] account di servizio marcati is_system=true: ${serviceMarkedCount}`);

    // --- A: match_preferences backfill ---
    const prefsResult = await client.query<{ user_id: string }>(`
      INSERT INTO match_preferences (user_id)
      SELECT u.id
      FROM users u
      LEFT JOIN match_preferences mp ON mp.user_id = u.id
      WHERE u.is_fake = false
        AND u.status = 'active'
        AND u.is_system = false
        AND u.role <> 'admin'
        AND mp.id IS NULL
      ON CONFLICT (user_id) DO NOTHING
      RETURNING user_id
    `);
    const prefsInserted = prefsResult.rowCount ?? 0;
    console.log(`[backfill] match_preferences inserite: ${prefsInserted}`);

    // --- B1: coordinate da first_login_lat/lng ---
    const coordsFromLogin = await client.query(`
      UPDATE user_profiles up
      SET latitude = u.first_login_lat,
          longitude = u.first_login_lng
      FROM users u
      WHERE up.user_id = u.id
        AND up.latitude IS NULL
        AND up.longitude IS NULL
        AND u.first_login_lat IS NOT NULL
        AND u.first_login_lng IS NOT NULL
        AND u.is_fake = false
        AND u.is_system = false
        AND u.role <> 'admin'
    `);
    const coordsFromLoginCount = coordsFromLogin.rowCount ?? 0;
    console.log(`[backfill] coordinate da first_login: ${coordsFromLoginCount}`);

    // --- B2: coordinate da ultima posizione GPS in route_points ---
    const coordsFromGps = await client.query(`
      UPDATE user_profiles up
      SET latitude = latest.latitude,
          longitude = latest.longitude
      FROM (
        SELECT DISTINCT ON (r.user_id) r.user_id, rp.latitude, rp.longitude
        FROM route_points rp
        INNER JOIN routes r ON r.id = rp.route_id
        INNER JOIN users u ON u.id = r.user_id
        WHERE u.is_fake = false
          AND u.is_system = false
          AND u.role <> 'admin'
        ORDER BY r.user_id, rp.created_at DESC
      ) latest
      WHERE up.user_id = latest.user_id
        AND up.latitude IS NULL
        AND up.longitude IS NULL
    `);
    const coordsFromGpsCount = coordsFromGps.rowCount ?? 0;
    console.log(`[backfill] coordinate da route_points GPS: ${coordsFromGpsCount}`);

    // --- B3: coordinate da centroide regione (ultimo fallback) ---
    // Recupera gli utenti ancora senza coordinate e con regione nota.
    const stillMissingCoords = await client.query<{ user_id: string; region: string | null }>(`
      SELECT up.user_id, u.region
      FROM user_profiles up
      INNER JOIN users u ON u.id = up.user_id
      WHERE up.latitude IS NULL
        AND up.longitude IS NULL
        AND u.is_fake = false
        AND u.is_system = false
        AND u.status = 'active'
        AND u.role <> 'admin'
    `);
    let coordsFromRegion = 0;
    for (const row of stillMissingCoords.rows) {
      const region = row.region ?? "";
      const centroid = ITALIAN_REGION_CENTROIDS[region];
      if (!centroid) continue;
      await client.query(
        `UPDATE user_profiles SET latitude = $1, longitude = $2 WHERE user_id = $3 AND latitude IS NULL`,
        [centroid[0], centroid[1], row.user_id]
      );
      coordsFromRegion++;
    }
    console.log(`[backfill] coordinate da centroide regione: ${coordsFromRegion}`);

    return res.json({
      success: true,
      stats: {
        serviceAccountsMarked: serviceMarkedCount,
        prefsInserted,
        coordsFromLogin: coordsFromLoginCount,
        coordsFromGps: coordsFromGpsCount,
        coordsFromRegion,
        usersStillWithoutCoords: stillMissingCoords.rowCount
          ? stillMissingCoords.rows.filter((r) => !ITALIAN_REGION_CENTROIDS[r.region ?? ""]).length
          : 0,
      },
    });
  } catch (error) {
    console.error("[backfill-real-users] error:", error);
    return sendError(res, 500, "Errore backfill utenti reali");
  } finally {
    client.release();
  }
});

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
router.post("/matching/backfill-planned-route-notifications", async (req: Request, res: Response) => {
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
