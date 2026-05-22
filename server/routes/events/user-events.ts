import { sendError } from "../../lib/api-response";
import { Router, type Request, type Response } from "express";
import { db } from "../../db";
import { eventParticipants } from "@shared/db";
import { requireAuth, eq } from "../events-helpers";
import { sql } from "drizzle-orm";

const router = Router();

// GET /api/events/user-events/:userId — IDs eventi dove l'utente partecipa (per pre-filtro invite)
router.get("/:userId", async (req: Request, res: Response) => {
  try {
    const requesterId = requireAuth(req, res);
    if (!requesterId) return;
    const { userId } = req.params;
    const rows = await db
      .select({ eventId: eventParticipants.eventId })
      .from(eventParticipants)
      .where(sql`${eventParticipants.userId} = ${userId}`);
    return res.json(rows.map((r) => r.eventId));
  } catch (e) {
    console.error("[GET /events/user-events/:userId]", e);
    return sendError(res, 500, "Errore interno");
  }
});

export default router;
