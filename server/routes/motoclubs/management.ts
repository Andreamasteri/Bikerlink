import { Router, type Request, type Response } from "express";
import { db, withDbRetry } from "../../db";
import { storage } from "../../storage";
import { motoClubs, motoClubMembers } from "@shared/db";
import { proposeLocationSchema } from "@shared/validators";
import { eq, and, desc, sql } from "drizzle-orm";
import { allLimited } from "../../lib/concurrency";

import { requireAuth } from "../../lib/auth-middleware";
import { sendSuccess, sendError } from "../../lib/api-response";

const router = Router();

router.get("/map/pending-locations", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const user = await storage.getUser(userId);
    if (!user || (user.role !== "admin" && user.role !== "moderator" && user.role !== "moderatore")) {
      return sendError(res, 403, "Accesso non autorizzato");
    }

    const clubs = await withDbRetry(() => db.select({
      id: motoClubs.id,
      name: motoClubs.name,
      clubType: motoClubs.clubType,
      logoUrl: motoClubs.logoUrl,
      region: motoClubs.region,
      proposedLatitude: motoClubs.proposedLatitude,
      proposedLongitude: motoClubs.proposedLongitude,
      proposedAddress: motoClubs.proposedAddress,
      proposedBy: motoClubs.proposedBy,
      proposedAt: motoClubs.proposedAt,
    })
      .from(motoClubs)
      .where(and(
        eq(motoClubs.isApproved, true),
        sql`${motoClubs.proposedLatitude} IS NOT NULL`,
      ))
      .orderBy(desc(motoClubs.updatedAt)));

    const enriched = await allLimited(clubs.map((c) => async () => {
      let proposerNickname: string | null = null;
      if (c.proposedBy) {
        const proposer = await storage.getUser(c.proposedBy);
        proposerNickname = proposer?.nickname ?? null;
      }
      return { ...c, proposerNickname };
    }));

    return res.json(enriched);
  } catch (e) {
    console.error("[GET /motoclubs/map/pending-locations]", e);
    return sendError(res, 500, "Errore interno");
  }
});

router.post("/:id/propose-location", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const clubId = req.params.id;
    const parsedPl = proposeLocationSchema.safeParse(req.body);
    if (!parsedPl.success) return sendError(res, 400, parsedPl.error.issues[0].message);
    const { latitude, longitude, address } = parsedPl.data;

    const [club] = await db.select().from(motoClubs).where(and(eq(motoClubs.id, clubId as string), eq(motoClubs.isApproved, true))).limit(1);
    if (!club) return sendError(res, 404, "Club non trovato");

    const [membership] = await db.select()
      .from(motoClubMembers)
      .where(and(eq(motoClubMembers.clubId, clubId as string), eq(motoClubMembers.userId, userId), eq(motoClubMembers.status, "active")))
      .limit(1);
    if (!membership) return sendError(res, 403, "Devi essere membro del club per proporre una sede");

    await db.update(motoClubs).set({
      proposedLatitude: latitude,
      proposedLongitude: longitude,
      proposedAddress: address ? address.trim() || null : null,
      proposedBy: userId,
      proposedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(motoClubs.id, clubId as string));

    await storage.createNotification({
      userId,
      title: "Proposta sede inviata",
      body: `La tua proposta di sede per "${club.name}" è in attesa di approvazione`,
      notificationType: "motoclub_invite",
      referenceType: "motoclub",
      referenceId: clubId as string,
    });

    return sendSuccess(res);
  } catch (e) {
    console.error("[POST /motoclubs/:id/propose-location]", e);
    return sendError(res, 500, "Errore interno");
  }
});

router.post("/:id/approve-location", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const clubId = req.params.id;
    const adminUser = await storage.getUser(userId);
    if (!adminUser || (adminUser.role !== "admin" && adminUser.role !== "moderator" && adminUser.role !== "moderatore")) {
      return sendError(res, 403, "Accesso non autorizzato");
    }

    const [club] = await db.select().from(motoClubs).where(eq(motoClubs.id, clubId as string)).limit(1);
    if (!club) return sendError(res, 404, "Club non trovato");
    if (club.proposedLatitude == null) return sendError(res, 400, "Nessuna proposta in attesa");

    await db.update(motoClubs).set({
      latitude: club.proposedLatitude,
      longitude: club.proposedLongitude,
      proposedLatitude: null,
      proposedLongitude: null,
      proposedAddress: null,
      proposedBy: null,
      proposedAt: null,
      updatedAt: new Date(),
    }).where(eq(motoClubs.id, clubId as string));

    if (club.proposedBy) {
      await storage.createNotification({
        userId: club.proposedBy,
        title: "Sede approvata!",
        body: `La sede proposta per "${club.name}" è stata approvata`,
        notificationType: "motoclub_invite",
        referenceType: "motoclub",
        referenceId: clubId as string,
      });
    }

    return sendSuccess(res);
  } catch (e) {
    console.error("[POST /motoclubs/:id/approve-location]", e);
    return sendError(res, 500, "Errore interno");
  }
});

router.post("/:id/reject-location", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const clubId = req.params.id;
    const adminUser = await storage.getUser(userId);
    if (!adminUser || (adminUser.role !== "admin" && adminUser.role !== "moderator" && adminUser.role !== "moderatore")) {
      return sendError(res, 403, "Accesso non autorizzato");
    }

    const [club] = await db.select().from(motoClubs).where(eq(motoClubs.id, clubId as string)).limit(1);
    if (!club) return sendError(res, 404, "Club non trovato");

    const proposedByUserId = club.proposedBy;

    await db.update(motoClubs).set({
      proposedLatitude: null,
      proposedLongitude: null,
      proposedAddress: null,
      proposedBy: null,
      proposedAt: null,
      updatedAt: new Date(),
    }).where(eq(motoClubs.id, clubId as string));

    if (proposedByUserId) {
      await storage.createNotification({
        userId: proposedByUserId,
        title: "Proposta sede rifiutata",
        body: `La sede proposta per "${club.name}" non è stata approvata`,
        notificationType: "motoclub_invite",
        referenceType: "motoclub",
        referenceId: clubId as string,
      });
    }

    return sendSuccess(res);
  } catch (e) {
    console.error("[POST /motoclubs/:id/reject-location]", e);
    return sendError(res, 500, "Errore interno");
  }
});

router.patch("/:id/settings", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const clubId = req.params.id;

    const [club] = await db.select().from(motoClubs).where(eq(motoClubs.id, clubId as string)).limit(1);
    if (!club) return sendError(res, 404, "Club non trovato");

    const [membership] = await db.select()
      .from(motoClubMembers)
      .where(and(eq(motoClubMembers.clubId, clubId as string), eq(motoClubMembers.userId, userId), eq(motoClubMembers.status, "active")))
      .limit(1);
    if (!membership || membership.role !== "admin") {
      return sendError(res, 403, "Solo gli admin del club possono modificare le impostazioni");
    }

    const { allowZavorrine } = req.body as { allowZavorrine?: boolean };
    if (typeof allowZavorrine !== "boolean") {
      return sendError(res, 400, "allowZavorrine deve essere un booleano");
    }

    await db.update(motoClubs).set({ allowZavorrine, updatedAt: new Date() }).where(eq(motoClubs.id, clubId as string));

    return sendSuccess(res);
  } catch (e) {
    console.error("[PATCH /motoclubs/:id/settings]", e);
    return sendError(res, 500, "Errore interno");
  }
});

export default router;
