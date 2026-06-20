import { sendError } from "../../lib/api-response";
import { Router, type Request, type Response } from "express";
import { db, withDbRetry } from "../../db";
import { events, users } from "@shared/db";
import { requireAuth, eq, and, asc, systemAccountConditions } from "../events-helpers";

const router = Router();

// GET /api/events/map — eventi con coordinate per la mappa
router.get("/", async (req: Request, res: Response) => {
  try {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const now = new Date();
    const rows = await withDbRetry(() => db.select({
      id: events.id,
      title: events.title,
      eventType: events.eventType,
      latitude: events.latitude,
      longitude: events.longitude,
      locationName: events.locationName,
      eventDate: events.eventDate,
      eventTime: events.eventTime,
      isRecurring: events.isRecurring,
    })
      .from(events)
      .innerJoin(users, eq(users.id, events.creatorId))
      .where(and(
        eq(events.status, "approved"),
        ...systemAccountConditions(users),
      ))
      .orderBy(asc(events.eventDate))
      .limit(200));

    // post-query filter for date
    const filteredRows = rows.filter(r => r.eventDate && new Date(r.eventDate) >= now);

    return res.json(filteredRows);
  } catch (err) {
    console.error("[events] GET /map error:", err);
    return sendError(res, 500, "Errore interno del server");
  }
});

export default router;
