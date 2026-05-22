import { sendError } from "../lib/api-response";
import { Router, type Request, type Response } from "express";
import { storage } from "../storage";
import { haversineKm } from "../geo";
import { db } from "../db";
import {
  events,
  eventImages,
  eventParticipants,
  users,
  type InsertEvent,
  createEventSchema,
} from "@shared/schema";
import {
  eq,
  and,
  asc,
  sql,
  count,
  gte,
  lte,
  systemAccountConditions,
  requireAuth,
  isAdminOrModUser,
  enrichEvent,
  type EventRow,
} from "./events-helpers";
import { allLimited } from "../lib/concurrency";
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

    const { filename } = req.params;
    if (!filename || /[/\\.]\./.test(filename) || filename.includes("..")) {
      return sendError(res, 400, "Nome file non valido");
    }

    const imageUrl = `/api/events/images/${filename}`;
    const [parent] = await db
      .select({ status: events.status, creatorId: events.creatorId })
      .from(eventImages)
      .innerJoin(events, eq(events.id, (eventImages as any).eventId))
      .where(eq((eventImages as any).imageUrl, imageUrl))
      .limit(1);

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
      conditions.push(sql`${(events as any).eventDate} >= ${new Date(from)}`);
    }
    if (to) {
      conditions.push(sql`${(events as any).eventDate} <= ${new Date(to)}`);
    }

    const rows: EventRow[] = await db.select({
      id: events.id,
      title: events.title,
      description: events.description,
      eventType: events.eventType,
      creatorId: events.creatorId,
      creatorNickname: users.nickname,
      locationName: (events as any).locationName,
      latitude: events.latitude,
      longitude: events.longitude,
      eventDate: (events as any).eventDate,
      eventTime: (events as any).eventTime,
      isRecurring: (events as any).isRecurring,
      recurrenceInfo: (events as any).recurrenceInfo,
      maxParticipants: events.maxParticipants,
      websiteUrl: (events as any).websiteUrl,
      autoInviteReason: (events as any).autoInviteReason,
      autoInviteRegion: (events as any).autoInviteRegion,
      autoInviteBrand: (events as any).autoInviteBrand,
      status: events.status,
      rejectionReason: (events as any).rejectionReason,
      approvedBy: (events as any).approvedBy,
      approvedAt: (events as any).approvedAt,
      createdAt: events.createdAt,
      updatedAt: events.updatedAt,
    })
      .from(events)
      .leftJoin(users, eq(users.id, events.creatorId))
      .where(and(...conditions, ...systemAccountConditions(users)))
      .orderBy(asc((events as any).eventDate));

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
      maxParticipants,
    } = parsedEvent.data;
    const body = req.body;
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

    const insertData: Partial<InsertEvent> = {
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
    };

    // Use any for missing fields in some schema versions
    const anyData = insertData as any;
    anyData.locationName = (body as any).locationName?.trim();
    anyData.eventDate = body.eventDate ? new Date(body.eventDate) : new Date();
    anyData.eventTime = body.eventTime ? body.eventTime.trim() || null : null;
    anyData.isRecurring = Boolean(body.isRecurring);
    anyData.recurrenceInfo = body.recurrenceInfo ? body.recurrenceInfo.trim() || null : null;
    anyData.websiteUrl = body.websiteUrl ? body.websiteUrl.trim() || null : null;
    anyData.autoInviteReason = body.autoInviteReason ?? null;
    anyData.autoInviteRegion = body.autoInviteRegion ?? null;
    anyData.autoInviteBrand = body.autoInviteBrand ?? null;
    anyData.approvedAt = new Date();
    anyData.approvedBy = userId;

    const [newEvent] = await db.insert(events).values(anyData as any).returning();

    const clubIds = Array.isArray(selectedClubIds) ? (selectedClubIds as string[]) : [];
    if (clubIds.length > 0) {
      sendClubInvitesByIds(newEvent, newEvent.id, clubIds, userId).catch((e) =>
        console.error("[events] sendClubInvitesByIds error:", e)
      );
    }

    sendNewEventNotificationEmail({
      title: newEvent.title,
      eventType: (newEvent as any).eventType,
      eventDate: (newEvent as any).eventDate ? new Date((newEvent as any).eventDate).toLocaleDateString("it-IT") : "N/D",
      locationName: (newEvent as any).locationName || "N/D",
      creatorNickname: creator?.nickname ?? "Utente",
    }).catch((e) => console.warn("[events] email notification error:", e));

    return res.status(201).json({
      event: newEvent,
      message: "Evento creato e pubblicato con successo!",
    });
  } catch (err) {
    console.error("[events] POST / error:", err);
    return sendError(res, 500, "Errore interno del server");
  }
});

export default router;
