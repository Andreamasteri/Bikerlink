// Task #2633 — Real implementations per gli endpoint che erano stub
// nel task #2632. Mantiene il file/mount originale per compatibilità;
// rename a `recovered-endpoints.ts` previsto come follow-up cleanup.
//
// Tutti gli endpoint usano requireAuth.

import { Router, type Request, type Response } from "express";
import crypto from "crypto";
import { eq, and, or, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { requireAuth } from "../lib/auth-middleware";
import { sendError, sendSuccess } from "../lib/api-response";
import {
  events,
  eventParticipants,
  matchPreferences,
  type InsertEventParticipant,
} from "@shared/db";

const router = Router();

// ── /api/lastfm/connect (POST) ───────────────────────────────────────────
// Connessione "mobile" reale: usa auth.getMobileSession (username+password)
// e salva la sessione in DB, identico a /api/lastfm/mobile-auth.
// Il client passa { username, password } ed ottiene { connected, username, trackCount }.
router.post("/lastfm/connect", requireAuth, async (req: Request, res: Response) => {
  try {
    const { isLastfmConfigured, lastfmApiCall } = await import("./lastfm/utils");
    if (!isLastfmConfigured()) {
      return sendError(res, 503, "Last.fm non configurato. Contatta l'amministratore.");
    }
    const { username, password } = (req.body ?? {}) as { username?: string; password?: string };
    if (!username || !password) {
      return sendError(res, 400, "Username e password sono obbligatori.");
    }
    const userId = req.session.userId as string;

    const passwordMd5 = crypto.createHash("md5").update(password, "utf8").digest("hex");
    const sessionData = await lastfmApiCall({
      method: "auth.getMobileSession",
      username,
      password: passwordMd5,
    }, "POST") as { session?: { key?: string; name?: string }; error?: number; message?: string };

    if (sessionData?.error || !sessionData?.session?.key) {
      const code = sessionData?.error;
      const msg = code === 4
        ? "Credenziali non valide. Verifica username, password e l'email di conferma di Last.fm."
        : (sessionData?.message ?? "Autorizzazione Last.fm fallita.");
      return sendError(res, 401, msg);
    }

    const sessionKey = sessionData.session.key;
    const lastfmUsername = sessionData.session.name ?? username;

    const { db } = await import("../db");
    const { userLastfmSessions } = await import("@shared/db");
    await db.insert(userLastfmSessions)
      .values({ userId, lastfmUsername, sessionKey })
      .onConflictDoUpdate({
        target: [userLastfmSessions.userId],
        set: { lastfmUsername, sessionKey, connectedAt: new Date() },
      });

    let trackCount = 0;
    try {
      const { syncLastfmTracks } = await import("./lastfm/sync-utils");
      trackCount = await syncLastfmTracks(userId, sessionKey, lastfmUsername);
    } catch (syncErr) {
      console.warn("[lastfm/connect] sync brani fallita:", syncErr);
    }

    return res.json({ connected: true, username: lastfmUsername, trackCount });
  } catch (err) {
    console.error("[lastfm/connect]", err);
    return sendError(res, 500, "Errore di connessione a Last.fm.");
  }
});

// ── /api/proposals/matches/accepted (GET) ────────────────────────────────
// La accepted-tab del client (app/(tabs)/match.tsx) già aggrega gli
// "accepted" dalle 5 sorgenti per-tipo (garage/biker/proposal/
// propProfile/routeAffinity) con i loro shape nativi. Questa route
// esiste per evitare 404 al boot ed è volutamente vuota: ritornare
// entry "generic" duplicherebbe le card e romperebbe le azioni
// (remove/etc. richiedono `id`+`status` typed dello shape originale).
router.get("/proposals/matches/accepted", requireAuth, async (_req: Request, res: Response) => {
  return res.json([]);
});

// ── /api/proposals/rematch (POST) ────────────────────────────────────────
// Body: { distanceMode?: "all"|"km"|"auto"|"custom", distanceKm?: number }
// Effetto: salva il filtro distanza (per "km"/"custom"), elimina i match
// pending/new/rejected dell'utente e ri-lancia il motore di matching.
router.post("/proposals/rematch", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId as string;
    const { distanceMode, distanceKm } = (req.body ?? {}) as { distanceMode?: string; distanceKm?: number };
    const customDistance = distanceMode === "custom" || distanceMode === "km";

    // Salva la preferenza di distanza in app_settings per-utente.
    if (customDistance && typeof distanceKm === "number" && distanceKm > 0) {
      try {
        await storage.upsertAppSetting(
          `user_${userId}_match_distance_km`,
          String(Math.min(2000, Math.max(1, Math.round(distanceKm)))),
        );
      } catch (e) {
        console.warn("[rematch] setAppSetting failed:", e);
      }
    }

    // Reset stato match: cancella pending/new/rejected
    const removedRejected = await storage.deleteRejectedProposalMatches(userId).catch(() => 0);
    const removedPending = await storage.deletePendingProposalMatches(userId).catch(() => 0);
    const removedBikerNew = await storage.deleteNewBikerBikerMatches(userId).catch(() => 0);
    const removedBikerRej = await storage.deleteRejectedBikerBikerMatches(userId).catch(() => 0);

    // Re-run engine fire-and-forget (l'utente fa pull-to-refresh).
    void (async () => {
      try {
        const { runMatchingForUser } = await import("../matching/run-user");
        const { runProposalMatchingForUser } = await import("../matching/run-proposals");
        await runMatchingForUser(userId).catch((e) => console.warn("[rematch] runMatchingForUser:", e));
        await runProposalMatchingForUser(userId).catch((e) => console.warn("[rematch] runProposalMatchingForUser:", e));
      } catch (e) {
        console.warn("[rematch] engine import failed:", e);
      }
    })();

    return res.json({
      success: true,
      removed: {
        proposalRejected: removedRejected,
        proposalPending: removedPending,
        bikerNew: removedBikerNew,
        bikerRejected: removedBikerRej,
      },
      message: "Rematch avviato — i nuovi match appariranno tra qualche istante",
    });
  } catch (err) {
    console.error("[rematch] error:", err);
    return sendError(res, 500, "Errore interno del server");
  }
});

// ── /api/proposals/:id/join (POST) — alias di /:id/participants ─────────
router.post("/proposals/:id/join", requireAuth, async (req: Request, res: Response) => {
  try {
    const proposalId = req.params.id as string;
    const userId = req.session.userId as string;

    const proposal = await storage.getProposal(proposalId);
    if (!proposal) return sendError(res, 404, "Proposta non trovata");

    if (proposal.clubId) {
      const { motoClubMembers } = await import("@shared/db");
      const [membership] = await db
        .select({ userId: motoClubMembers.userId })
        .from(motoClubMembers)
        .where(and(
          eq(motoClubMembers.clubId, proposal.clubId),
          eq(motoClubMembers.userId, userId),
          eq(motoClubMembers.status, "active"),
        ))
        .limit(1);
      if (!membership) return sendError(res, 403, "Non sei membro attivo di questo club");
    }

    const participants = await storage.getProposalParticipants(proposalId);
    if (participants.some((p) => p.userId === userId)) {
      return sendError(res, 400, "Sei già un partecipante");
    }

    const participant = await storage.addProposalParticipant({
      proposalId,
      userId,
    } as import("@shared/db").InsertProposalParticipant);

    return res.json(participant);
  } catch (err) {
    console.error("[proposals/join] error:", err);
    return sendError(res, 500, "Errore interno del server");
  }
});

// ── /api/proposals/biker-matches/:id  (DELETE) ──────────────────────────
// Rimuove (reset) un match biker↔biker. Riusa la logica di reset-to-new
// per non perdere lo storico ma evitare di mostrare il match all'utente.
router.delete("/proposals/biker-matches/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId as string;
    const matchId = req.params.id as string;
    const match = await storage.getBikerBikerMatch(matchId);
    if (!match) return sendError(res, 404, "Match non trovato");
    if (match.biker1Id !== userId && match.biker2Id !== userId) {
      return sendError(res, 403, "Non autorizzato");
    }
    // Per match accettati: ritorna a rejected; per nuovi: rimosso.
    await storage.resetBikerBikerMatchToNew(matchId, userId);
    return sendSuccess(res, { deleted: true });
  } catch (err) {
    console.error("[biker-matches/:id DELETE]", err);
    return sendError(res, 500, "Errore interno del server");
  }
});

// ── /api/proposals/matches/:id  (DELETE) ────────────────────────────────
router.delete("/proposals/matches/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId as string;
    const matchId = req.params.id as string;
    const ok = await storage.deleteProposalMatch(matchId, userId);
    if (!ok) return sendError(res, 404, "Match non trovato o non autorizzato");
    return sendSuccess(res, { deleted: true });
  } catch (err) {
    console.error("[proposals/matches/:id DELETE]", err);
    return sendError(res, 500, "Errore interno del server");
  }
});

// ── /api/rides/me/telemetry-stats (GET) ──────────────────────────────────
// Shape attesa dal TelemetryProgressBanner: { km_collected, progress_pct, target_km }.
// Usa la stessa query Haversine con filtro speed >= 20 di /api/telemetry/stats
// per garantire che banner e pannello profilo mostrino sempre lo stesso valore.
router.get("/rides/me/telemetry-stats", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId as string;

    const [kmResult, targetSetting] = await Promise.all([
      db.execute(sql`
        WITH ordered AS (
          SELECT
            lat,
            lon,
            speed_kmh,
            LAG(lat) OVER (PARTITION BY session_id ORDER BY ts) AS prev_lat,
            LAG(lon) OVER (PARTITION BY session_id ORDER BY ts) AS prev_lon
          FROM ride_telemetry
          WHERE user_id = ${userId}
        ),
        distances AS (
          SELECT
            2 * 6371 * ASIN(
              SQRT(
                POWER(SIN(RADIANS(lat - prev_lat) / 2), 2)
                + COS(RADIANS(prev_lat)) * COS(RADIANS(lat))
                * POWER(SIN(RADIANS(lon - prev_lon) / 2), 2)
              )
            ) AS dist_km
          FROM ordered
          WHERE prev_lat IS NOT NULL AND prev_lon IS NOT NULL
            AND ABS(lat - prev_lat) < 0.5
            AND ABS(lon - prev_lon) < 0.5
            AND (speed_kmh IS NULL OR speed_kmh >= 20)
        )
        SELECT COALESCE(SUM(dist_km), 0) AS km_collected
        FROM distances
      `),
      storage.getAppSetting("telemetry_target_km").catch(() => undefined),
    ]);

    const kmRow = kmResult.rows[0] as { km_collected: string } | undefined;
    const kmCollected = Math.round(parseFloat(kmRow?.km_collected ?? "0") * 10) / 10;
    const targetKm = parseInt(targetSetting?.value ?? "400", 10) || 400;
    const pct = Math.min(100, Math.round((kmCollected / Math.max(1, targetKm)) * 100));

    return res.json({
      km_collected: kmCollected,
      progress_pct: pct,
      target_km: targetKm,
    });
  } catch (err) {
    console.error("[telemetry-stats] error:", err);
    return res.json({ km_collected: 0, progress_pct: 0, target_km: 400 });
  }
});

// ── /api/events/:id  (DELETE) ───────────────────────────────────────────
router.delete("/events/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId as string;
    const id = req.params.id as string;
    const [evt] = await db.select().from(events).where(eq(events.id, id)).limit(1);
    if (!evt) return sendError(res, 404, "Evento non trovato");

    const { isAdminOrModUser } = await import("./events-helpers");
    const isOwner = evt.creatorId === userId;
    const isPrivileged = await isAdminOrModUser(userId);
    if (!isOwner && !isPrivileged) return sendError(res, 403, "Non autorizzato");

    await db.delete(events).where(eq(events.id, id));
    return sendSuccess(res, { deleted: true });
  } catch (err) {
    console.error("[events DELETE]", err);
    return sendError(res, 500, "Errore interno del server");
  }
});

// ── /api/events/:id/approve|reject (POST) — admin/mod ───────────────────
router.post("/events/:id/approve", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId as string;
    const id = req.params.id as string;
    const { isAdminOrModUser } = await import("./events-helpers");
    if (!(await isAdminOrModUser(userId))) return sendError(res, 403, "Non autorizzato");

    const [evt] = await db.select().from(events).where(eq(events.id, id)).limit(1);
    if (!evt) return sendError(res, 404, "Evento non trovato");

    const [updated] = await db.update(events).set({
      status: "approved",
      approvedBy: userId,
      approvedAt: new Date(),
      rejectionReason: null,
      updatedAt: new Date(),
    }).where(eq(events.id, id)).returning();

    // Notifica creatore + invio inviti club se previsto.
    try {
      await storage.createNotification({
        userId: evt.creatorId,
        title: "Evento approvato",
        body: `Il tuo evento "${evt.title}" è stato approvato.`,
        notificationType: "event_approved",
        referenceType: "event",
        referenceId: id,
      });
    } catch (e) { console.warn("[events/approve] notify", e); }

    try {
      const { sendClubInvites } = await import("./events/notifications");
      void sendClubInvites(updated, id).catch((e) => console.warn("[events/approve] sendClubInvites:", e));
    } catch (e) { console.warn("[events/approve] sendClubInvites import:", e); }

    return res.json({ event: updated });
  } catch (err) {
    console.error("[events/approve]", err);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.post("/events/:id/reject", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId as string;
    const id = req.params.id as string;
    const { reason } = (req.body ?? {}) as { reason?: string };
    const { isAdminOrModUser } = await import("./events-helpers");
    if (!(await isAdminOrModUser(userId))) return sendError(res, 403, "Non autorizzato");

    const [evt] = await db.select().from(events).where(eq(events.id, id)).limit(1);
    if (!evt) return sendError(res, 404, "Evento non trovato");

    const [updated] = await db.update(events).set({
      status: "rejected",
      rejectionReason: reason?.trim() || null,
      updatedAt: new Date(),
    }).where(eq(events.id, id)).returning();

    try {
      await storage.createNotification({
        userId: evt.creatorId,
        title: "Evento rifiutato",
        body: reason?.trim()
          ? `Il tuo evento "${evt.title}" è stato rifiutato: ${reason.trim()}`
          : `Il tuo evento "${evt.title}" è stato rifiutato.`,
        notificationType: "event_rejected",
        referenceType: "event",
        referenceId: id,
      });
    } catch (e) { console.warn("[events/reject] notify", e); }

    return res.json({ event: updated });
  } catch (err) {
    console.error("[events/reject]", err);
    return sendError(res, 500, "Errore interno del server");
  }
});

// ── /api/events/:id/join (POST + DELETE) ────────────────────────────────
router.post("/events/:id/join", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId as string;
    const id = req.params.id as string;
    const { status } = (req.body ?? {}) as { status?: string };
    const participationStatus = status === "interested" ? "interested" : "going";

    const [evt] = await db.select().from(events).where(eq(events.id, id)).limit(1);
    if (!evt) return sendError(res, 404, "Evento non trovato");
    if (evt.status !== "approved") return sendError(res, 400, "Evento non disponibile");

    // capacity
    if (evt.maxParticipants) {
      const [{ cnt }] = await db.select({ cnt: sql<number>`count(*)::int` })
        .from(eventParticipants)
        .where(and(eq(eventParticipants.eventId, id), eq(eventParticipants.participationStatus, "going")));
      if (Number(cnt) >= evt.maxParticipants && participationStatus === "going") {
        return sendError(res, 400, "Evento al completo");
      }
    }

    const [existing] = await db.select().from(eventParticipants)
      .where(and(eq(eventParticipants.eventId, id), eq(eventParticipants.userId, userId)))
      .limit(1);

    let row;
    if (existing) {
      [row] = await db.update(eventParticipants)
        .set({ participationStatus })
        .where(eq(eventParticipants.id, existing.id))
        .returning();
    } else {
      const insert: InsertEventParticipant = { eventId: id, userId, participationStatus };
      [row] = await db.insert(eventParticipants).values(insert).returning();
    }

    return res.json({ participant: row });
  } catch (err) {
    console.error("[events/join POST]", err);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.delete("/events/:id/join", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId as string;
    const id = req.params.id as string;
    const result = await db.delete(eventParticipants)
      .where(and(eq(eventParticipants.eventId, id), eq(eventParticipants.userId, userId)))
      .returning();
    if (result.length === 0) return sendError(res, 404, "Non sei un partecipante");
    return sendSuccess(res, { left: true });
  } catch (err) {
    console.error("[events/join DELETE]", err);
    return sendError(res, 500, "Errore interno del server");
  }
});

void matchPreferences; void inArray; void or; void sql;
export default router;
