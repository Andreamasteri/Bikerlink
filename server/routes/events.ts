import { Router, type Request, type Response } from "express";
import multer from "multer";
import path from "path";
import { storage } from "../storage";
import { db } from "../db";
import {
  events,
  eventImages,
  eventParticipants,
  eventClubInvites,
  motoClubs,
  motoClubMembers,
  users,
  type Event,
  type InsertEvent,
} from "@shared/schema";
import {
  eq,
  and,
  desc,
  asc,
  sql,
  count,
  ilike,
  gte,
  lte,
  inArray,
  ne,
  notInArray,
} from "drizzle-orm";
import { PROTECTED_NICKNAMES } from "../constants";
import { uploadBuffer, deleteObject } from "../objectStorage";
import { allLimited } from "../lib/concurrency";
import { sendNewEventNotificationEmail } from "../email";

const router = Router();

// ── AUTH HELPERS ─────────────────────────────────────────────────────────────

function requireAuth(req: Request, res: Response): string | null {
  if (!req.session.userId) {
    res.status(401).json({ message: "Non autenticato" });
    return null;
  }
  return req.session.userId;
}

async function requireAdminOrMod(req: Request, res: Response): Promise<string | null> {
  const userId = requireAuth(req, res);
  if (!userId) return null;
  const user = await storage.getUser(userId);
  if (!user || (user.role !== "admin" && user.role !== "moderator")) {
    res.status(403).json({ message: "Accesso non autorizzato" });
    return null;
  }
  return userId;
}

async function isAdminOrModUser(userId: string): Promise<boolean> {
  const user = await storage.getUser(userId);
  return !!(user && (user.role === "admin" || user.role === "moderator"));
}

// ── IMAGE UPLOAD ─────────────────────────────────────────────────────────────

const eventUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Solo immagini JPEG, PNG o WebP"));
  },
});

async function uploadEventImage(buffer: Buffer, originalname: string, mimetype: string): Promise<string> {
  const uniqueSuffix = Date.now().toString() + "-" + Math.random().toString(36).substr(2, 9);
  const filename = uniqueSuffix + path.extname(originalname || ".jpg");
  const objectPath = `public/events/${filename}`;
  await uploadBuffer(objectPath, buffer, mimetype);
  return `/api/events/images/${filename}`;
}

// ── TYPES ─────────────────────────────────────────────────────────────────────

type EventRow = {
  id: string;
  title: string;
  description: string | null;
  eventType: string;
  creatorId: string;
  creatorNickname: string | null;
  locationName: string | null;
  latitude: number | null;
  longitude: number | null;
  eventDate: Date;
  eventTime: string | null;
  isRecurring: boolean;
  recurrenceInfo: string | null;
  maxParticipants: number | null;
  websiteUrl: string | null;
  autoInviteReason: string | null;
  autoInviteRegion: string | null;
  autoInviteBrand: string | null;
  status: string;
  rejectionReason: string | null;
  approvedBy: string | null;
  approvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

// ── QUERY HELPERS ─────────────────────────────────────────────────────────────

async function enrichEvent(evt: EventRow, requestingUserId: string | null) {
  const [imgs, participants] = await Promise.all([
    db.select().from(eventImages).where(eq(eventImages.eventId, evt.id)).orderBy(asc(eventImages.sortOrder)),
    db.select({
      id: eventParticipants.id,
      userId: eventParticipants.userId,
      participationStatus: eventParticipants.participationStatus,
      joinedAt: eventParticipants.joinedAt,
      nickname: users.nickname,
      photoUrl: users.avatarUrl,
    })
      .from(eventParticipants)
      .leftJoin(users, eq(users.id, eventParticipants.userId))
      .where(and(
        eq(eventParticipants.eventId, evt.id),
        ne(users.role, "admin"),
        notInArray(users.nickname, PROTECTED_NICKNAMES),
      ))
      .orderBy(asc(eventParticipants.joinedAt)),
  ]);

  const goingCount = participants.filter(p => p.participationStatus === "going").length;
  const interestedCount = participants.filter(p => p.participationStatus === "interested").length;
  const userParticipation = requestingUserId
    ? (participants.find(p => p.userId === requestingUserId)?.participationStatus ?? null)
    : null;

  return {
    ...evt,
    images: imgs.map(img => ({ id: img.id, imageUrl: img.imageUrl, sortOrder: img.sortOrder })),
    participantCount: goingCount,
    interestedCount,
    userParticipation,
    participants: participants.map(p => ({
      userId: p.userId,
      nickname: p.nickname,
      photoUrl: p.photoUrl,
      participationStatus: p.participationStatus,
    })),
  };
}

// Haversine distance in km
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── SERVE IMAGES ─────────────────────────────────────────────────────────────

router.get("/images/:filename", async (req: Request, res: Response) => {
  try {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const { filename } = req.params;
    if (!filename || /[/\\.]\./.test(filename) || filename.includes("..")) {
      return res.status(400).json({ message: "Nome file non valido" });
    }

    // Task #1122: l'URL del poster deve restare valido solo finché l'evento
    // parent è approvato. Se l'evento è stato rifiutato/cancellato la riga
    // event_images potrebbe essere ancora presente, ma il file non deve più
    // essere accessibile a utenti normali (stale-URL bypass).
    const imageUrl = `/api/events/images/${filename}`;
    const [parent] = await db
      .select({ status: events.status, creatorId: events.creatorId })
      .from(eventImages)
      .innerJoin(events, eq(events.id, eventImages.eventId))
      .where(eq(eventImages.imageUrl, imageUrl))
      .limit(1);

    if (!parent) {
      return res.status(404).json({ message: "Immagine non trovata" });
    }
    if (parent.status !== "approved" && parent.creatorId !== userId) {
      const allowed = await isAdminOrModUser(userId);
      if (!allowed) {
        return res.status(404).json({ message: "Immagine non trovata" });
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
    return res.status(404).json({ message: "Immagine non trovata" });
  }
});

// ── ADMIN-FIRST ROUTES (must be before /:id) ─────────────────────────────────

// GET /api/events/admin/pending — admin/mod: lista pending
router.get("/admin/pending", async (req: Request, res: Response) => {
  try {
    const userId = await requireAdminOrMod(req, res);
    if (!userId) return;

    const rows: EventRow[] = await db.select({
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
      updatedAt: events.updatedAt,
    })
      .from(events)
      .leftJoin(users, eq(users.id, events.creatorId))
      .where(eq(events.status, "pending"))
      .orderBy(asc(events.createdAt));

    const enriched = await allLimited(rows.map((r) => () => enrichEvent(r, userId)));
    return res.json(enriched);
  } catch (err) {
    console.error("[events] GET /admin/pending error:", err);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

// GET /api/events/admin/all — admin/mod: tutti gli eventi
router.get("/admin/all", async (req: Request, res: Response) => {
  try {
    const userId = await requireAdminOrMod(req, res);
    if (!userId) return;

    const { status: filterStatus, page = "1", limit = "30" } = req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 30));
    const offset = (pageNum - 1) * limitNum;

    const whereClause = filterStatus ? eq(events.status, filterStatus) : undefined;

    const [rows, totalRows] = await Promise.all([
      db.select({
        id: events.id,
        title: events.title,
        eventType: events.eventType,
        creatorId: events.creatorId,
        creatorNickname: users.nickname,
        locationName: events.locationName,
        eventDate: events.eventDate,
        status: events.status,
        rejectionReason: events.rejectionReason,
        approvedAt: events.approvedAt,
        createdAt: events.createdAt,
      })
        .from(events)
        .leftJoin(users, eq(users.id, events.creatorId))
        .where(whereClause)
        .orderBy(desc(events.createdAt))
        .limit(limitNum)
        .offset(offset),

      db.select({ count: count() }).from(events).where(whereClause),
    ]);

    return res.json({ events: rows, total: Number(totalRows[0]?.count ?? 0), page: pageNum, limit: limitNum });
  } catch (err) {
    console.error("[events] GET /admin/all error:", err);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

// GET /api/events/my — eventi dell'utente (inclusi pending/rejected)
router.get("/my", async (req: Request, res: Response) => {
  try {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const rows: EventRow[] = await db.select({
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
      updatedAt: events.updatedAt,
    })
      .from(events)
      .leftJoin(users, eq(users.id, events.creatorId))
      .where(eq(events.creatorId, userId))
      .orderBy(desc(events.createdAt));

    const enriched = await allLimited(rows.map((r) => () => enrichEvent(r, userId)));
    return res.json(enriched);
  } catch (err) {
    console.error("[events] GET /my error:", err);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

// GET /api/events/map — eventi con coordinate per la mappa
router.get("/map", async (req: Request, res: Response) => {
  try {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const now = new Date();
    const rows = await db.select({
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
      .where(and(
        eq(events.status, "approved"),
        gte(events.eventDate, now),
        sql`${events.latitude} IS NOT NULL AND ${events.longitude} IS NOT NULL`,
      ))
      .orderBy(asc(events.eventDate))
      .limit(200);

    return res.json(rows);
  } catch (err) {
    console.error("[events] GET /map error:", err);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

// ── PUBLIC LIST ───────────────────────────────────────────────────────────────

// GET /api/events — lista eventi approvati
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

    const rows: EventRow[] = await db.select({
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
      updatedAt: events.updatedAt,
    })
      .from(events)
      .leftJoin(users, eq(users.id, events.creatorId))
      .where(and(...conditions))
      .orderBy(asc(events.eventDate));

    // Geo-distance filter (post-query, Haversine)
    let filtered = rows;
    if (lat && lng && radius) {
      const userLat = parseFloat(lat);
      const userLng = parseFloat(lng);
      const maxKm = parseFloat(radius);
      filtered = rows.filter(r => {
        if (r.latitude == null || r.longitude == null) return true; // no coordinates → always show
        return haversineKm(userLat, userLng, r.latitude, r.longitude) <= maxKm;
      });
    }

    const total = filtered.length;
    const paginated = filtered.slice(offset, offset + limitNum);

    const enriched = await Promise.all(paginated.map(r => enrichEvent(r, userId)));

    return res.json({ events: enriched, total, page: pageNum, limit: limitNum });
  } catch (err) {
    console.error("[events] GET / error:", err);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

// ── CRUD ──────────────────────────────────────────────────────────────────────

// GET /api/events/clubs-list — lista club approvati per selezione inviti
router.get("/clubs-list", async (req: Request, res: Response) => {
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
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

// POST /api/events — crea evento
router.post("/", async (req: Request, res: Response) => {
  try {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const {
      title, description, eventType, locationName, latitude, longitude,
      eventDate, eventTime, isRecurring, recurrenceInfo, maxParticipants,
      websiteUrl, selectedClubIds,
    } = req.body as Record<string, string | boolean | number | string[] | undefined>;

    if (!title || !(title as string).trim()) {
      return res.status(400).json({ message: "Il titolo è obbligatorio" });
    }
    if (!eventDate) {
      return res.status(400).json({ message: "La data è obbligatoria" });
    }
    if (!locationName || !(locationName as string).trim()) {
      return res.status(400).json({ message: "Il luogo dell'evento è obbligatorio" });
    }
    if (websiteUrl && !/^https?:\/\/.+/.test(websiteUrl as string)) {
      return res.status(400).json({ message: "URL sito web non valido (deve iniziare con http/https)" });
    }

    // Rate limiting: max 5 eventi al giorno per utente
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const [todayCount] = await db
      .select({ count: count() })
      .from(events)
      .where(and(eq(events.creatorId, userId), gte(events.createdAt, todayStart)));

    if (Number(todayCount?.count ?? 0) >= 5) {
      return res.status(429).json({ message: "Hai raggiunto il limite di 5 eventi al giorno" });
    }

    const creator = await storage.getUser(userId);

    const insertData: InsertEvent = {
      title: (title as string).trim(),
      description: description ? (description as string).trim() || null : null,
      eventType: (eventType as string) || "raduno",
      creatorId: userId,
      locationName: (locationName as string).trim(),
      latitude: latitude != null ? parseFloat(String(latitude)) : null,
      longitude: longitude != null ? parseFloat(String(longitude)) : null,
      eventDate: new Date(eventDate as string),
      eventTime: eventTime ? (eventTime as string).trim() || null : null,
      isRecurring: Boolean(isRecurring),
      recurrenceInfo: recurrenceInfo ? (recurrenceInfo as string).trim() || null : null,
      maxParticipants: maxParticipants ? parseInt(String(maxParticipants)) : null,
      websiteUrl: websiteUrl ? (websiteUrl as string).trim() || null : null,
      autoInviteReason: null,
      autoInviteRegion: null,
      autoInviteBrand: null,
      status: "approved",
      approvedAt: new Date(),
      approvedBy: userId,
    };

    const [newEvent] = await db.insert(events).values(insertData).returning();

    // Inviti club specifici selezionati
    const clubIds = Array.isArray(selectedClubIds) ? (selectedClubIds as string[]) : [];
    if (clubIds.length > 0) {
      sendClubInvitesByIds(newEvent, newEvent.id, clubIds, userId).catch((e) =>
        console.error("[events] sendClubInvitesByIds error:", e)
      );
    }

    // Notifica email ad admin/mod
    sendNewEventNotificationEmail({
      title: newEvent.title,
      eventType: newEvent.eventType,
      eventDate: newEvent.eventDate.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" }),
      locationName: newEvent.locationName,
      creatorNickname: creator?.nickname ?? "Utente",
    }).catch((e) => console.warn("[events] email notification error:", e));

    return res.status(201).json({
      event: newEvent,
      message: "Evento creato e pubblicato con successo!",
    });
  } catch (err) {
    console.error("[events] POST / error:", err);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

// GET /api/events/user-events/:userId — IDs eventi dove l'utente partecipa (per pre-filtro invite)
router.get("/user-events/:userId", async (req: Request, res: Response) => {
  try {
    const requesterId = requireAuth(req, res);
    if (!requesterId) return;
    const { userId } = req.params;
    const rows = await db
      .select({ eventId: eventParticipants.eventId })
      .from(eventParticipants)
      .where(eq(eventParticipants.userId, userId));
    return res.json(rows.map((r) => r.eventId));
  } catch (e) {
    console.error("[GET /events/user-events/:userId]", e);
    return res.status(500).json({ message: "Errore interno" });
  }
});

// GET /api/events/:id — dettaglio evento
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const { id } = req.params;

    const [row] = await db.select({
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
      updatedAt: events.updatedAt,
    })
      .from(events)
      .leftJoin(users, eq(users.id, events.creatorId))
      .where(eq(events.id, id));

    if (!row) return res.status(404).json({ message: "Evento non trovato" });

    // Visibility: approved events are public; non-approved only for creator/admin/mod
    if (row.status !== "approved") {
      const isOwner = userId === row.creatorId;
      const isPrivileged = await isAdminOrModUser(userId);
      if (!isOwner && !isPrivileged) {
        return res.status(404).json({ message: "Evento non trovato" });
      }
    }

    const enriched = await enrichEvent(row as EventRow, userId);
    return res.json(enriched);
  } catch (err) {
    console.error("[events] GET /:id error:", err);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

// PUT /api/events/:id — modifica evento
router.put("/:id", async (req: Request, res: Response) => {
  try {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const { id } = req.params;
    const [existing] = await db.select().from(events).where(eq(events.id, id));
    if (!existing) return res.status(404).json({ message: "Evento non trovato" });

    const isPrivileged = await isAdminOrModUser(userId);
    const isOwner = existing.creatorId === userId;

    if (!isOwner && !isPrivileged) {
      return res.status(403).json({ message: "Non autorizzato" });
    }

    // Creator can only edit events in pending or approved status
    if (isOwner && !isPrivileged && existing.status !== "pending" && existing.status !== "approved") {
      return res.status(403).json({ message: "Non puoi modificare un evento rifiutato o cancellato" });
    }

    const {
      title, description, eventType, locationName, latitude, longitude,
      eventDate, eventTime, isRecurring, recurrenceInfo, maxParticipants,
      websiteUrl, autoInviteReason, autoInviteRegion, autoInviteBrand,
    } = req.body as Record<string, string | boolean | number | undefined>;

    if (websiteUrl && !/^https?:\/\/.+/.test(websiteUrl as string)) {
      return res.status(400).json({ message: "URL sito web non valido" });
    }

    const updates: Partial<InsertEvent> = { updatedAt: new Date() };
    if (title !== undefined) updates.title = (title as string).trim();
    if (description !== undefined) updates.description = description ? (description as string).trim() : null;
    if (eventType !== undefined) updates.eventType = eventType as string;
    if (locationName !== undefined) updates.locationName = locationName ? (locationName as string).trim() : null;
    if (latitude !== undefined) updates.latitude = latitude != null ? parseFloat(String(latitude)) : null;
    if (longitude !== undefined) updates.longitude = longitude != null ? parseFloat(String(longitude)) : null;
    if (eventDate !== undefined) updates.eventDate = new Date(eventDate as string);
    if (eventTime !== undefined) updates.eventTime = eventTime ? (eventTime as string).trim() : null;
    if (isRecurring !== undefined) updates.isRecurring = Boolean(isRecurring);
    if (recurrenceInfo !== undefined) updates.recurrenceInfo = recurrenceInfo ? (recurrenceInfo as string).trim() : null;
    if (maxParticipants !== undefined) updates.maxParticipants = maxParticipants ? parseInt(String(maxParticipants)) : null;
    if (websiteUrl !== undefined) updates.websiteUrl = websiteUrl ? (websiteUrl as string).trim() : null;
    if (autoInviteReason !== undefined) updates.autoInviteReason = autoInviteReason ? (autoInviteReason as string).trim() : null;
    if (autoInviteRegion !== undefined) updates.autoInviteRegion = autoInviteRegion ? (autoInviteRegion as string).trim() : null;
    if (autoInviteBrand !== undefined) updates.autoInviteBrand = autoInviteBrand ? (autoInviteBrand as string).trim() : null;

    const [updated] = await db.update(events).set(updates).where(eq(events.id, id)).returning();
    return res.json(updated);
  } catch (err) {
    console.error("[events] PUT /:id error:", err);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

// DELETE /api/events/:id — elimina evento
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const { id } = req.params;
    const [existing] = await db.select().from(events).where(eq(events.id, id));
    if (!existing) return res.status(404).json({ message: "Evento non trovato" });

    const isPrivileged = await isAdminOrModUser(userId);
    const isOwner = existing.creatorId === userId;

    if (!isOwner && !isPrivileged) {
      return res.status(403).json({ message: "Non autorizzato" });
    }

    // Creator can only delete their own pending events; admin/mod can always delete
    if (isOwner && !isPrivileged && existing.status !== "pending") {
      return res.status(403).json({ message: "Puoi eliminare solo gli eventi in attesa di approvazione" });
    }

    // Cleanup images from object storage
    const imgs = await db.select().from(eventImages).where(eq(eventImages.eventId, id));
    await Promise.all(imgs.map(async (img) => {
      const filename = img.imageUrl.replace("/api/events/images/", "");
      try { await deleteObject(`public/events/${filename}`); } catch {}
    }));

    await db.delete(events).where(eq(events.id, id));
    return res.json({ message: "Evento eliminato" });
  } catch (err) {
    console.error("[events] DELETE /:id error:", err);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

// POST /api/events/:id/join — partecipa
router.post("/:id/join", async (req: Request, res: Response) => {
  try {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const { id } = req.params;
    const { status: participationStatus = "going" } = req.body as { status?: string };

    if (!["going", "interested"].includes(participationStatus)) {
      return res.status(400).json({ message: "Status non valido (going | interested)" });
    }

    const [evt] = await db.select().from(events).where(eq(events.id, id));
    if (!evt) return res.status(404).json({ message: "Evento non trovato" });
    if (evt.status !== "approved") return res.status(400).json({ message: "Evento non ancora approvato" });

    if (evt.maxParticipants && participationStatus === "going") {
      const [cnt] = await db.select({ count: count() })
        .from(eventParticipants)
        .where(and(eq(eventParticipants.eventId, id), eq(eventParticipants.participationStatus, "going")));
      if (Number(cnt?.count ?? 0) >= evt.maxParticipants) {
        return res.status(400).json({ message: "Evento al completo" });
      }
    }

    const existing = await db.select().from(eventParticipants)
      .where(and(eq(eventParticipants.eventId, id), eq(eventParticipants.userId, userId)));

    if (existing.length > 0) {
      await db.update(eventParticipants)
        .set({ participationStatus })
        .where(and(eq(eventParticipants.eventId, id), eq(eventParticipants.userId, userId)));
    } else {
      await db.insert(eventParticipants).values({ eventId: id, userId, participationStatus });
    }

    return res.json({ message: "Partecipazione registrata", participationStatus });
  } catch (err) {
    console.error("[events] POST /:id/join error:", err);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

// DELETE /api/events/:id/join — lascia evento
router.delete("/:id/join", async (req: Request, res: Response) => {
  try {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const { id } = req.params;
    await db.delete(eventParticipants)
      .where(and(eq(eventParticipants.eventId, id), eq(eventParticipants.userId, userId)));

    return res.json({ message: "Partecipazione rimossa" });
  } catch (err) {
    console.error("[events] DELETE /:id/join error:", err);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

// POST /api/events/:id/images — upload locandina
router.post("/:id/images", eventUpload.single("image"), async (req: Request, res: Response) => {
  try {
    const userId = requireAuth(req, res);
    if (!userId) return;

    if (!req.file) return res.status(400).json({ message: "Nessuna immagine fornita" });

    const { id } = req.params;
    const [evt] = await db.select().from(events).where(eq(events.id, id));
    if (!evt) return res.status(404).json({ message: "Evento non trovato" });

    const isPrivileged = await isAdminOrModUser(userId);
    if (evt.creatorId !== userId && !isPrivileged) {
      return res.status(403).json({ message: "Non autorizzato" });
    }

    const [imgCount] = await db.select({ count: count() })
      .from(eventImages).where(eq(eventImages.eventId, id));
    if (Number(imgCount?.count ?? 0) >= 5) {
      return res.status(400).json({ message: "Massimo 5 immagini per evento" });
    }

    const imageUrl = await uploadEventImage(req.file.buffer, req.file.originalname, req.file.mimetype);
    const sortOrder = Number(imgCount?.count ?? 0);

    const [newImg] = await db.insert(eventImages).values({ eventId: id, imageUrl, sortOrder }).returning();
    return res.status(201).json(newImg);
  } catch (err) {
    console.error("[events] POST /:id/images error:", err);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

// DELETE /api/events/:id/images/:imageId — elimina immagine
router.delete("/:id/images/:imageId", async (req: Request, res: Response) => {
  try {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const { id, imageId } = req.params;
    const [evt] = await db.select().from(events).where(eq(events.id, id));
    if (!evt) return res.status(404).json({ message: "Evento non trovato" });

    const isPrivileged = await isAdminOrModUser(userId);
    if (evt.creatorId !== userId && !isPrivileged) {
      return res.status(403).json({ message: "Non autorizzato" });
    }

    // Verify the image belongs to this specific event (prevent IDOR)
    const [img] = await db.select().from(eventImages)
      .where(and(eq(eventImages.id, imageId), eq(eventImages.eventId, id)));
    if (!img) return res.status(404).json({ message: "Immagine non trovata" });

    const filename = img.imageUrl.replace("/api/events/images/", "");
    try { await deleteObject(`public/events/${filename}`); } catch {}

    await db.delete(eventImages).where(and(eq(eventImages.id, imageId), eq(eventImages.eventId, id)));
    return res.json({ message: "Immagine eliminata" });
  } catch (err) {
    console.error("[events] DELETE /:id/images/:imageId error:", err);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

// ── ADMIN / MODERATOR ACTIONS ─────────────────────────────────────────────────

// POST /api/events/:id/approve — approva evento
router.post("/:id/approve", async (req: Request, res: Response) => {
  try {
    const userId = await requireAdminOrMod(req, res);
    if (!userId) return;

    const { id } = req.params;
    const [evt] = await db.select().from(events).where(eq(events.id, id));
    if (!evt) return res.status(404).json({ message: "Evento non trovato" });
    if (evt.status === "approved") return res.status(400).json({ message: "Evento già approvato" });

    await db.update(events).set({
      status: "approved",
      approvedBy: userId,
      approvedAt: new Date(),
      rejectionReason: null,
      updatedAt: new Date(),
    }).where(eq(events.id, id));

    // Notifica al creatore
    await storage.createNotification({
      userId: evt.creatorId,
      title: "Evento approvato!",
      body: `Il tuo evento "${evt.title}" è stato approvato ed è ora visibile a tutti.`,
      notificationType: "event_approved",
      referenceType: "event",
      referenceId: id,
    });

    // Inviti automatici ai club (se autoInviteReason valorizzato)
    if (evt.autoInviteReason) {
      await sendClubInvites(evt, id);
    }

    return res.json({ message: "Evento approvato" });
  } catch (err) {
    console.error("[events] POST /:id/approve error:", err);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

// POST /api/events/:id/reject — rifiuta evento
router.post("/:id/reject", async (req: Request, res: Response) => {
  try {
    const userId = await requireAdminOrMod(req, res);
    if (!userId) return;

    const { id } = req.params;
    const { reason } = req.body as { reason?: string };

    if (!reason?.trim()) {
      return res.status(400).json({ message: "Il motivo del rifiuto è obbligatorio" });
    }

    const [evt] = await db.select().from(events).where(eq(events.id, id));
    if (!evt) return res.status(404).json({ message: "Evento non trovato" });

    await db.update(events).set({
      status: "rejected",
      rejectionReason: reason?.trim() || null,
      updatedAt: new Date(),
    }).where(eq(events.id, id));

    await storage.createNotification({
      userId: evt.creatorId,
      title: "Evento non approvato",
      body: reason?.trim()
        ? `Il tuo evento "${evt.title}" non è stato approvato: ${reason.trim()}`
        : `Il tuo evento "${evt.title}" non è stato approvato dai moderatori.`,
      notificationType: "event_rejected",
      referenceType: "event",
      referenceId: id,
    });

    return res.json({ message: "Evento rifiutato" });
  } catch (err) {
    console.error("[events] POST /:id/reject error:", err);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

// ── AUTO-INVITE HELPERS ───────────────────────────────────────────────────────

async function sendClubInvitesByIds(evt: Event, eventId: string, clubIds: string[], senderId: string): Promise<void> {
  if (!clubIds.length) return;
  try {
    const clubs = await db
      .select({ id: motoClubs.id, name: motoClubs.name, conversationId: motoClubs.conversationId })
      .from(motoClubs)
      .where(and(inArray(motoClubs.id, clubIds), eq(motoClubs.isApproved, true)));

    for (const club of clubs) {
      try {
        await db.insert(eventClubInvites).values({ eventId, clubId: club.id }).onConflictDoNothing();

        const members = await db.select({ userId: motoClubMembers.userId })
          .from(motoClubMembers)
          .where(and(eq(motoClubMembers.clubId, club.id), eq(motoClubMembers.status, "active")));

        // Messaggio nella chat del club
        if (club.conversationId) {
          try {
            await storage.createMessage({
              conversationId: club.conversationId,
              senderId,
              messageType: "text",
              content: `📅 Il vostro club è stato invitato all'evento "${evt.title}"! Controllatelo nella sezione Events.`,
            });
          } catch {}
        }

        // Notifiche ai singoli membri
        await allLimited(members.map((member) => async () => {
          if (member.userId === evt.creatorId) return;
          try {
            await storage.createNotification({
              userId: member.userId,
              title: "Evento per il tuo club!",
              body: `Il tuo club "${club.name}" è stato invitato all'evento "${evt.title}".`,
              notificationType: "event_invite",
              referenceType: "event",
              referenceId: eventId,
            });
          } catch {}
        }));
      } catch {}
    }
  } catch (err) {
    console.error("[events] sendClubInvitesByIds error:", err);
  }
}

async function sendClubInvites(evt: Event, approvedEventId: string): Promise<void> {
  try {
    const conditions: ReturnType<typeof ilike>[] = [];
    if (evt.autoInviteRegion) {
      conditions.push(ilike(motoClubs.region, `%${evt.autoInviteRegion}%`));
    }
    if (evt.autoInviteBrand) {
      conditions.push(ilike(motoClubs.brandName, `%${evt.autoInviteBrand}%`));
    }

    const clubs = conditions.length > 0
      ? await db.select({ id: motoClubs.id, name: motoClubs.name, conversationId: motoClubs.conversationId })
          .from(motoClubs)
          .where(and(...conditions))
      : await db.select({ id: motoClubs.id, name: motoClubs.name, conversationId: motoClubs.conversationId }).from(motoClubs);

    for (const club of clubs) {
      try {
        await db.insert(eventClubInvites).values({ eventId: approvedEventId, clubId: club.id })
          .onConflictDoNothing();

        const members = await db.select({ userId: motoClubMembers.userId })
          .from(motoClubMembers)
          .where(eq(motoClubMembers.clubId, club.id));

        await allLimited(members.map((member) => async () => {
          if (member.userId === evt.creatorId) return;
          try {
            await storage.createNotification({
              userId: member.userId,
              title: "Evento per il tuo club!",
              body: `Il tuo club "${club.name}" è stato invitato all'evento "${evt.title}". ${evt.autoInviteReason ?? ""}`.trim(),
              notificationType: "event_invite",
              referenceType: "event",
              referenceId: approvedEventId,
            });
          } catch {}
        }));
      } catch {}
    }
  } catch (err) {
    console.error("[events] sendClubInvites error:", err);
  }
}

router.post("/:id/invite-user", async (req: Request, res: Response) => {
  try {
    const requesterId = requireAuth(req, res);
    if (!requesterId) return;
    const eventId = req.params.id;
    const { userId: targetUserId } = req.body as { userId?: string };
    if (!targetUserId) return res.status(400).json({ message: "userId obbligatorio" });

    const [event] = await db.select({
      id: events.id,
      title: events.title,
      organizerId: events.organizerId,
      status: events.status,
      eventDate: events.eventDate,
    }).from(events).where(eq(events.id, eventId)).limit(1);
    if (!event) return res.status(404).json({ message: "Evento non trovato" });

    if (event.status !== "approved") {
      return res.status(403).json({ message: "Solo gli eventi approvati accettano inviti" });
    }
    const todayStr = new Date().toISOString().substring(0, 10);
    if (!event.eventDate || String(event.eventDate).substring(0, 10) < todayStr) {
      return res.status(403).json({ message: "Non puoi invitare a un evento già passato" });
    }

    const requester = await storage.getUser(requesterId);
    if (!requester) return res.status(404).json({ message: "Utente non trovato" });

    const isOrganizerOrAdmin =
      event.organizerId === requesterId ||
      requester.role === "admin" ||
      requester.role === "moderator";
    if (!isOrganizerOrAdmin) {
      return res.status(403).json({ message: "Solo l'organizzatore o un admin può invitare utenti" });
    }

    const targetUser = await storage.getUser(targetUserId);
    if (!targetUser) return res.status(404).json({ message: "Utente destinatario non trovato" });

    const isBlocked = await storage.hasBlockedUser(targetUserId, requesterId);
    if (isBlocked) return res.status(403).json({ message: "Non puoi contattare questo utente" });

    const [existing] = await db.select({ id: eventParticipants.id })
      .from(eventParticipants)
      .where(and(eq(eventParticipants.eventId, eventId), eq(eventParticipants.userId, targetUserId)))
      .limit(1);
    if (existing) {
      return res.status(409).json({ message: "L'utente partecipa già a questo evento" });
    }

    await storage.createNotification({
      userId: targetUserId,
      title: "Invito a un raduno!",
      body: `${requester.nickname} ti ha invitato al raduno: "${event.title}"`,
      notificationType: "event_invite",
      referenceType: "event",
      referenceId: eventId,
    });

    return res.json({ success: true });
  } catch (e) {
    console.error("[POST /events/:id/invite-user]", e);
    return res.status(500).json({ message: "Errore interno" });
  }
});

export default router;
