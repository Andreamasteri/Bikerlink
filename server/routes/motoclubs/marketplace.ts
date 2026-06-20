import { sendError } from "../../lib/api-response";
import { Router, type Request, type Response } from "express";
import { db, withDbRetry } from "../../db";
import { storage } from "../../storage";
import { motoClubMembers, users, userMotorcycles } from "@shared/db";
import { eq, and, desc, sql } from "drizzle-orm";

import { requireAuth } from "../../lib/auth-middleware";

const router = Router();

router.get("/marketplace", requireAuth, async (req: Request, res: Response) => {
  try {
    const marketplaceSetting = await storage.getAppSetting("marketplace_enabled");
    if (marketplaceSetting?.value === "false") {
      return res.json([]);
    }

    const userId = req.session.userId!;

    const userClubs = await withDbRetry(() => db.select({ clubId: motoClubMembers.clubId })
      .from(motoClubMembers)
      .where(and(eq(motoClubMembers.userId, userId), eq(motoClubMembers.status, "active"))));

    if (userClubs.length === 0) return res.json([]);

    const clubIds = userClubs.map(c => c.clubId);

    const allMembers = await withDbRetry(() => db.select({ userId: motoClubMembers.userId })
      .from(motoClubMembers)
      .where(and(
        sql`${motoClubMembers.clubId} IN (${sql.join(clubIds.map(id => sql`${id}`), sql`, `)})`,
        eq(motoClubMembers.status, "active"),
        sql`${motoClubMembers.userId} != ${userId}`
      )));

    if (allMembers.length === 0) return res.json([]);

    const memberIds = [...new Set(allMembers.map(m => m.userId))];

    const motos = await withDbRetry(() => db.select({
      moto: userMotorcycles,
      user: { id: users.id, nickname: users.nickname, avatarUrl: users.avatarUrl },
    })
      .from(userMotorcycles)
      .innerJoin(users, eq(users.id, userMotorcycles.userId))
      .where(and(
        eq(userMotorcycles.isForSale, true),
        sql`${userMotorcycles.userId} IN (${sql.join(memberIds.map(id => sql`${id}`), sql`, `)})`
      ))
      .orderBy(desc(userMotorcycles.createdAt)));

    const seen = new Set<string>();
    const result = motos
      .filter(r => {
        if (seen.has(r.moto.id)) return false;
        seen.add(r.moto.id);
        return true;
      })
      .map(r => ({
        id: r.moto.id,
        brand: r.moto.brand,
        model: r.moto.model,
        year: r.moto.year,
        displacement: r.moto.displacement,
        motorcycleType: r.moto.motorcycleType,
        photoUrl: r.moto.photoUrl,
        saleDescription: r.moto.saleDescription,
        seller: r.user,
      }));

    return res.json(result);
  } catch (e) {
    console.error("Marketplace error:", e);
    return sendError(res, 500, "Errore interno");
  }
});

router.get("/:id/marketplace", requireAuth, async (req: Request, res: Response) => {
  try {
    const marketplaceSetting = await storage.getAppSetting("marketplace_enabled");
    if (marketplaceSetting?.value === "false") {
      return res.json([]);
    }

    const clubId = req.params.id;
    const userId = req.session.userId!;

    const [isMember] = await withDbRetry(() => db.select({ userId: motoClubMembers.userId })
      .from(motoClubMembers)
      .where(and(eq(motoClubMembers.clubId, clubId as string), eq(motoClubMembers.userId, userId), eq(motoClubMembers.status, "active")))
      .limit(1));
    if (!isMember) return sendError(res, 403, "Devi essere membro del club");

    const memberIds = await withDbRetry(() => db.select({ userId: motoClubMembers.userId })
      .from(motoClubMembers)
      .where(and(eq(motoClubMembers.clubId, clubId as string), eq(motoClubMembers.status, "active"))));

    if (memberIds.length === 0) return res.json([]);

    const ids = memberIds.map(m => m.userId);
    const motos = await withDbRetry(() => db.select({
      moto: userMotorcycles,
      user: { id: users.id, nickname: users.nickname, avatarUrl: users.avatarUrl },
    })
      .from(userMotorcycles)
      .innerJoin(users, eq(users.id, userMotorcycles.userId))
      .where(and(
        eq(userMotorcycles.isForSale, true),
        sql`${userMotorcycles.userId} IN (${sql.join(ids.map(id => sql`${id}`), sql`, `)})`
      ))
      .orderBy(desc(userMotorcycles.createdAt)));

    const result = motos.map(r => ({
      id: r.moto.id,
      brand: r.moto.brand,
      model: r.moto.model,
      year: r.moto.year,
      displacement: r.moto.displacement,
      motorcycleType: r.moto.motorcycleType,
      photoUrl: r.moto.photoUrl,
      saleDescription: r.moto.saleDescription,
      seller: r.user,
    }));

    return res.json(result);
  } catch (e) {
    console.error("Club marketplace error:", e);
    return sendError(res, 500, "Errore interno");
  }
});

export default router;
