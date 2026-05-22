import { sendError } from "../../lib/api-response";
import { Router, type Request, type Response } from "express";
import { db } from "../../db";
import { motoClubs } from "@shared/db";
import { requireAuth, asc, eq } from "../events-helpers";

const router = Router();

// GET /api/events/clubs-list — lista club approvati per selezione inviti
router.get("/", async (req: Request, res: Response) => {
  try {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const clubs = await db
      .select({
        id: motoClubs.id,
        name: motoClubs.name,
        clubType: motoClubs.clubType,
        region: motoClubs.region,
        brandName: motoClubs.brandName,
        memberCount: motoClubs.memberCount,
      })
      .from(motoClubs)
      .where(eq(motoClubs.isApproved, true))
      .orderBy(asc(motoClubs.name));

    return res.json(clubs);
  } catch (err) {
    console.error("[events] GET /clubs-list error:", err);
    return sendError(res, 500, "Errore interno del server");
  }
});

export default router;
