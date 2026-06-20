import { sendError } from "../lib/api-response";
import { Router, type Request, type Response } from "express";
import { storage } from "../storage";
import { haversineKm } from "../geo";
import { db, withDbRetry } from "../db";
import { events, eventImages, users, type InsertEvent } from "@shared/db";
import { createEventSchema } from "@shared/validators";
import {
  eq,
  and,
  asc,
  count,
  gte,
  lte,
  systemAccountConditions,
  requireAuth,
  isAdminOrModUser,
  enrichEvent,
  type EventRow
} from "./events-helpers";
import { sendNewEventNotificationEmail } from "../email";
import path from "path";

// Import sub-routers
import adminRouter from "./events/admin";
import mapRouter from "./events/map";
import myRouter from "./events/my";
import clubsListRouter from "./events/clubs-list";
import userEventsRouter from "./events/user-events";
import invitesRouter from "./events/invites";
import crudRouter from "./events/crud";
import { sendClubInvitesByIds } from "./events/notifications";

const router = Router();

// ── MOUNT SUB-ROUTERS ──────────────────────────────────────────────────────────

router.use("/admin", adminRouter);
router.use("/map", mapRouter);
router.use("/my", myRouter);
router.use("/clubs-list", clubsListRouter);
router.use("/user-events", userEventsRouter);
router.use("/", crudRouter); // Detail and update
router.use("/", invitesRouter);

// ── SERVE IMAGES ─────────────────────────────────────────────────────────────

router.get("/images/:filename", async (req: Request, res: Response) => {
  try {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const filename = req.params.filename as string;
    if (!filename || /[/\\.]\./.test(filename) || filename.includes("..")) {
      return sendError(res, 400, "Nome file non valido");
    }

    const imageUrl = `/api/events/images/${filename}`;
    const [parent] = await withDbRetry(() => db
      .select({ status: events.status, creatorId: events.creatorId })
      .from(eventImages)
      .innerJoin(events, eq(events.id, eventImages.eventId))
      .where(eq(eventImages.imageUrl, imageUrl))
      .limit(1));

    if (!parent) {
      return sendError(res, 404, "Immagine non trovata");
    }
    if (parent.status !== "approved" && parent.creatorId !== userId) {
      const allowed = await isAdminOrModUser(userId);
      if (!allowed) {
        return sendError(res, 404, "Immagine non trovata");
      }
    }

    const { downloadBuffer } = await import("../objectStorage");
    const buf = await downloadBuffer(`public/events/${filename}`);
    const ext = path.extname(filename).toLowerCase();
    const mime = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
    res.setHeader("Content-Type", mime);
    res.setHeader("Cache-Control", "private, max-age=86400");
    return res.send(buf);
  } catch {
    return sendError(res, 404, "Immagine non trovata");
  }
});

// ── PUBLIC LIST ───────────────────────────────────────────────────────────────

router.get("/", async (req: Request, res: Response) => {
  try {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const { type, from, to, lat, lng, radius, page = "1", limit = "20" } = req.query as Record<string, string>;

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit) || 20));
    const offset = (pageNum - 1) * limitNum;

    const conditions = [eq(events.status, "approved")];

    if (type && type !== "tutti") {
      conditions.push(eq(events.eventType, type));
    }
    if (from) {
      conditions.push(gte(events.eventDate, new Date(from)));
    }
    if (to) {
      conditions.push(lte(events.eventDate, new Date(to)));
    }

    const rows: EventRow[] = await withDbRetry(() => db.select({
      id: events.id,
      title: events.title,
      description: events.description,
      eventType: events.eventType,
      creatorId: events.creatorId,
      creatorNickname: users.nickname,
      locationName: events.locationName,
      latitude: events.latitude,
      longitude: events.longitude,
      eventDate: events.eventDate,
      eventTime: events.eventTime,
      isRecurring: events.isRecurring,
      recurrenceInfo: events.recurrenceInfo,
      maxParticipants: events.maxParticipants,
      websiteUrl: events.websiteUrl,
      autoInviteReason: events.autoInviteReason,
      autoInviteRegion: events.autoInviteRegion,
      autoInviteBrand: events.autoInviteBrand,
      status: events.status,
      rejectionReason: events.rejectionReason,
      approvedBy: events.approvedBy,
      approvedAt: events.approvedAt,
      createdAt: events.createdAt,
      updatedAt: events.updatedAt
    })
      .from(events)
      .leftJoin(users, eq(users.id, events.creatorId))
      .where(and(...conditions, ...systemAccountConditions(users)))
      .orderBy(asc(events.eventDate)));

    let filtered = rows;
    if (lat && lng && radius) {
      const userLat = parseFloat(lat);
      const userLng = parseFloat(lng);
      const maxKm = parseFloat(radius);
      filtered = rows.filter(r => {
        if (r.latitude == null || r.longitude == null) return true;
        return haversineKm(userLat, userLng, r.latitude, r.longitude) <= maxKm;
      });
    }

    const total = filtered.length;
    const paginated = filtered.slice(offset, offset + limitNum);

    const enriched = await Promise.all(paginated.map(r => enrichEvent(r, userId)));

    return res.json({ events: enriched, total, page: pageNum, limit: limitNum });
  } catch (err) {
    console.error("[events] GET / error:", err);
    return sendError(res, 500, "Errore interno del server");
  }
});

// ── CREATE ───────────────────────────────────────────────────────────────────

router.post("/", async (req: Request, res: Response) => {
  try {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const parsedEvent = createEventSchema.safeParse(req.body);
    if (!parsedEvent.success) {
      return sendError(res, 400, parsedEvent.error.issues[0].message);
    }
    const {
      title, description, eventType, latitude, longitude,
      maxParticipants
    } = parsedEvent.data;
    const body = req.body as Record<string, unknown>;
    const selectedClubIds = Array.isArray(req.body?.selectedClubIds) ? req.body.selectedClubIds as string[] : [];

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const [todayCount] = await db
      .select({ count: count() })
      .from(events)
      .where(and(eq(events.creatorId, userId), gte(events.createdAt, todayStart)));

    if (Number(todayCount?.count ?? 0) >= 5) {
      return sendError(res, 429, "Hai raggiunto il limite di 5 eventi al giorno");
    }

    const creator = await storage.getUser(userId);

    const insertData: InsertEvent = {
      title: title.trim(),
      description: description ? description.trim() || null : null,
      eventType: eventType || "raduno",
      creatorId: userId,
      latitude: latitude ?? null,
      longitude: longitude ?? null,
      maxParticipants: maxParticipants ?? null,
      status: "approved",
      createdAt: new Date(),
      updatedAt: new Date(),
      locationName: body.locationName ? String(body.locationName).trim() : null,
      eventDate: body.eventDate ? new Date(body.eventDate as string) : new Date(),
      eventTime: body.eventTime ? String(body.eventTime).trim() || null : null,
      isRecurring: Boolean(body.isRecurring),
      recurrenceInfo: body.recurrenceInfo ? String(body.recurrenceInfo).trim() || null : null,
      websiteUrl: body.websiteUrl ? String(body.websiteUrl).trim() || null : null,
      autoInviteReason: (body.autoInviteReason as string | null | undefined) ?? null,
      autoInviteRegion: (body.autoInviteRegion as string | null | undefined) ?? null,
      autoInviteBrand: (body.autoInviteBrand as string | null | undefined) ?? null,
      approvedAt: new Date(),
      approvedBy: userId,
    };

    const [newEvent] = await db.insert(events).values(insertData).returning();

    const clubIds = Array.isArray(selectedClubIds) ? (selectedClubIds as string[]) : [];
    if (clubIds.length > 0) {
      sendClubInvitesByIds(newEvent, newEvent.id, clubIds, userId).catch((e) =>
        console.error("[events] sendClubInvitesByIds error:", e)
      );
    }

    sendNewEventNotificationEmail({
      title: newEvent.title,
      eventType: newEvent.eventType,
      eventDate: newEvent.eventDate ? new Date(newEvent.eventDate).toLocaleDateString("it-IT") : "N/D",
      locationName: newEvent.locationName || "N/D",
      creatorNickname: creator?.nickname ?? "Utente",
    }).catch((e) => console.warn("[events] email notification error:", e));

    return res.status(201).json({
      event: newEvent,
      message: "Evento creato e pubblicato con successo!"
    });
  } catch (err) {
    console.error("[events] POST / error:", err);
    return sendError(res, 500, "Errore interno del server");
  }
});

export default router;
