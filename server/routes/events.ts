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
} from "@shared/schema";
import {
  eq,
  and,
  desc,
  asc,
  sql,
  count,
  or,
  ilike,
  gte,
  lte,
  inArray,
} from "drizzle-orm";
import { uploadBuffer, deleteObject } from "../objectStorage";

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

// ── QUERY HELPERS ─────────────────────────────────────────────────────────────

async function enrichEvent(evt: any, requestingUserId: string | null) {
  const [images, participants] = await Promise.all([
    db.select().from(eventImages).where(eq(eventImages.eventId, evt.id)).orderBy(asc(eventImages.sortOrder)),
    db.select({
      id: eventParticipants.id,
      userId: eventParticipants.userId,
      participationStatus: eventParticipants.participationStatus,
      joinedAt: eventParticipants.joinedAt,
      nickname: users.nickname,
      photoUrl: users.profilePhotoUrl,
    })
      .from(eventParticipants)
      .leftJoin(users, eq(users.id, eventParticipants.userId))
      .where(eq(eventParticipants.eventId, evt.id))
      .orderBy(asc(eventParticipants.joinedAt)),
  ]);

  const goingCount = participants.filter(p => p.participationStatus === "going").length;
  const interestedCount = participants.filter(p => p.participationStatus === "interested").length;

  const userParticipation = requestingUserId
    ? (participants.find(p => p.userId === requestingUserId)?.participationStatus ?? null)
    : null;

  return {
    ...evt,
    images: images.map(img => ({ id: img.id, imageUrl: img.imageUrl, sortOrder: img.sortOrder })),
    participantCount: goingCount,
    interestedCount,
    userParticipation,
    participants: participants.slice(0, 10).map(p => ({
      userId: p.userId,
      nickname: p.nickname,
      photoUrl: p.photoUrl,
      participationStatus: p.participationStatus,
    })),
  };
}

// ── SERVE IMAGES ─────────────────────────────────────────────────────────────

router.get("/images/:filename", async (req: Request, res: Response) => {
  try {
    const { downloadBuffer } = await import("../objectStorage");
    const buf = await downloadBuffer(`public/events/${req.params.filename}`);
    const ext = path.extname(req.params.filename).toLowerCase();
    const mime = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
    res.setHeader("Content-Type", mime);
    res.setHeader("Cache-Control", "public, max-age=86400");
    return res.send(buf);
  } catch {
    return res.status(404).json({ message: "Immagine non trovata" });
  }
});

// ── PUBLIC ROUTES (authenticated) ────────────────────────────────────────────

// GET /api/events — lista eventi approvati
router.get("/", async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId ?? null;
    const { type, from, to, page = "1", limit = "20" } = req.query as Record<string, string>;

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit) || 20));
    const offset = (pageNum - 1) * limitNum;

    const conditions: any[] = [eq(events.status, "approved")];

    if (type && type !== "tutti") {
      conditions.push(eq(events.eventType, type));
    }
    if (from) {
      conditions.push(gte(events.eventDate, new Date(from)));
    }
    if (to) {
      conditions.push(lte(events.eventDate, new Date(to)));
    }

    const [rows, totalRows] = await Promise.all([
      db.select({
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
        .orderBy(asc(events.eventDate))
        .limit(limitNum)
        .offset(offset),

      db.select({ count: count() }).from(events).where(and(...conditions)),
    ]);

    const enriched = await Promise.all(rows.map(r => enrichEvent(r, userId)));

    return res.json({
      events: enriched,
      total: Number(totalRows[0]?.count ?? 0),
      page: pageNum,
      limit: limitNum,
    });
  } catch (err) {
    console.error("[events] GET / error:", err);
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
      websiteUrl, autoInviteReason, autoInviteRegion, autoInviteBrand,
    } = req.body;

    if (!title?.trim()) {
      return res.status(400).json({ message: "Il titolo è obbligatorio" });
    }
    if (!eventDate) {
      return res.status(400).json({ message: "La data è obbligatoria" });
    }

    if (websiteUrl && !/^https?:\/\/.+/.test(websiteUrl)) {
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

    const [newEvent] = await db.insert(events).values({
      title: title.trim(),
      description: description?.trim() || null,
      eventType: eventType || "raduno",
      creatorId: userId,
      locationName: locationName?.trim() || null,
      latitude: latitude ? parseFloat(latitude) : null,
      longitude: longitude ? parseFloat(longitude) : null,
      eventDate: new Date(eventDate),
      eventTime: eventTime?.trim() || null,
      isRecurring: Boolean(isRecurring),
      recurrenceInfo: recurrenceInfo?.trim() || null,
      maxParticipants: maxParticipants ? parseInt(maxParticipants) : null,
      websiteUrl: websiteUrl?.trim() || null,
      autoInviteReason: autoInviteReason?.trim() || null,
      autoInviteRegion: autoInviteRegion?.trim() || null,
      autoInviteBrand: autoInviteBrand?.trim() || null,
      status: "pending",
    }).returning();

    return res.status(201).json({ event: newEvent, message: "Evento creato! È in attesa di approvazione dai moderatori." });
  } catch (err) {
    console.error("[events] POST / error:", err);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

// GET /api/events/my — eventi dell'utente (inclusi pending/rejected)
router.get("/my", async (req: Request, res: Response) => {
  try {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const rows = await db.select({
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
      status: events.status,
      rejectionReason: events.rejectionReason,
      createdAt: events.createdAt,
      updatedAt: events.updatedAt,
    })
      .from(events)
      .leftJoin(users, eq(users.id, events.creatorId))
      .where(eq(events.creatorId, userId))
      .orderBy(desc(events.createdAt));

    const enriched = await Promise.all(rows.map(r => enrichEvent(r, userId)));
    return res.json(enriched);
  } catch (err) {
    console.error("[events] GET /my error:", err);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

// GET /api/events/map — eventi con coordinate per la mappa (solo approvati, solo futuri)
router.get("/map", async (req: Request, res: Response) => {
  try {
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

// GET /api/events/admin/pending — admin/mod: lista pending
router.get("/admin/pending", async (req: Request, res: Response) => {
  try {
    const userId = await requireAdminOrMod(req, res);
    if (!userId) return;

    const rows = await db.select({
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
      createdAt: events.createdAt,
    })
      .from(events)
      .leftJoin(users, eq(users.id, events.creatorId))
      .where(eq(events.status, "pending"))
      .orderBy(asc(events.createdAt));

    const enriched = await Promise.all(rows.map(r => enrichEvent(r, userId)));
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

    const conditions: any[] = [];
    if (filterStatus) conditions.push(eq(events.status, filterStatus));

    const rows = await db.select({
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
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(events.createdAt))
      .limit(limitNum)
      .offset(offset);

    const [totalRows] = await db.select({ count: count() }).from(events)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    return res.json({ events: rows, total: Number(totalRows?.count ?? 0), page: pageNum, limit: limitNum });
  } catch (err) {
    console.error("[events] GET /admin/all error:", err);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

// GET /api/events/:id — dettaglio evento
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId ?? null;
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

    // Solo il creatore o admin/mod possono vedere eventi non approvati
    if (row.status !== "approved" && row.status !== "pending") {
      if (userId !== row.creatorId) {
        const currentUser = userId ? await storage.getUser(userId) : null;
        if (!currentUser || (currentUser.role !== "admin" && currentUser.role !== "moderator")) {
          return res.status(404).json({ message: "Evento non trovato" });
        }
      }
    }

    const enriched = await enrichEvent(row, userId);
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

    const currentUser = await storage.getUser(userId);
    const isAdminOrMod = currentUser && (currentUser.role === "admin" || currentUser.role === "moderator");
    if (existing.creatorId !== userId && !isAdminOrMod) {
      return res.status(403).json({ message: "Non autorizzato" });
    }

    const {
      title, description, eventType, locationName, latitude, longitude,
      eventDate, eventTime, isRecurring, recurrenceInfo, maxParticipants,
      websiteUrl, autoInviteReason, autoInviteRegion, autoInviteBrand,
    } = req.body;

    if (websiteUrl && !/^https?:\/\/.+/.test(websiteUrl)) {
      return res.status(400).json({ message: "URL sito web non valido" });
    }

    const updates: Partial<typeof events.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (title !== undefined) updates.title = title.trim();
    if (description !== undefined) updates.description = description?.trim() || null;
    if (eventType !== undefined) updates.eventType = eventType;
    if (locationName !== undefined) updates.locationName = locationName?.trim() || null;
    if (latitude !== undefined) updates.latitude = latitude ? parseFloat(latitude) : null;
    if (longitude !== undefined) updates.longitude = longitude ? parseFloat(longitude) : null;
    if (eventDate !== undefined) updates.eventDate = new Date(eventDate);
    if (eventTime !== undefined) updates.eventTime = eventTime?.trim() || null;
    if (isRecurring !== undefined) updates.isRecurring = Boolean(isRecurring);
    if (recurrenceInfo !== undefined) updates.recurrenceInfo = recurrenceInfo?.trim() || null;
    if (maxParticipants !== undefined) updates.maxParticipants = maxParticipants ? parseInt(maxParticipants) : null;
    if (websiteUrl !== undefined) updates.websiteUrl = websiteUrl?.trim() || null;
    if (autoInviteReason !== undefined) updates.autoInviteReason = autoInviteReason?.trim() || null;
    if (autoInviteRegion !== undefined) updates.autoInviteRegion = autoInviteRegion?.trim() || null;
    if (autoInviteBrand !== undefined) updates.autoInviteBrand = autoInviteBrand?.trim() || null;

    // Se modificato dal creatore e era rejected, torna in pending
    if (existing.creatorId === userId && existing.status === "rejected") {
      updates.status = "pending";
      updates.rejectionReason = null;
    }

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

    const currentUser = await storage.getUser(userId);
    const isAdminOrMod = currentUser && (currentUser.role === "admin" || currentUser.role === "moderator");

    if (existing.creatorId !== userId && !isAdminOrMod) {
      return res.status(403).json({ message: "Non autorizzato" });
    }

    // Elimina immagini dall'object storage
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
    const { status: participationStatus = "going" } = req.body;

    if (!["going", "interested"].includes(participationStatus)) {
      return res.status(400).json({ message: "Status non valido (going | interested)" });
    }

    const [evt] = await db.select().from(events).where(eq(events.id, id));
    if (!evt) return res.status(404).json({ message: "Evento non trovato" });
    if (evt.status !== "approved") return res.status(400).json({ message: "Evento non ancora approvato" });

    if (evt.maxParticipants) {
      const [cnt] = await db.select({ count: count() })
        .from(eventParticipants)
        .where(and(eq(eventParticipants.eventId, id), eq(eventParticipants.participationStatus, "going")));
      if (Number(cnt?.count ?? 0) >= evt.maxParticipants && participationStatus === "going") {
        return res.status(400).json({ message: "Evento al completo" });
      }
    }

    // Upsert
    const existing = await db.select().from(eventParticipants)
      .where(and(eq(eventParticipants.eventId, id), eq(eventParticipants.userId, userId)));

    if (existing.length > 0) {
      await db.update(eventParticipants)
        .set({ participationStatus })
        .where(and(eq(eventParticipants.eventId, id), eq(eventParticipants.userId, userId)));
    } else {
      await db.insert(eventParticipants).values({
        eventId: id,
        userId,
        participationStatus,
      });
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

    const currentUser = await storage.getUser(userId);
    const isAdminOrMod = currentUser && (currentUser.role === "admin" || currentUser.role === "moderator");
    if (evt.creatorId !== userId && !isAdminOrMod) {
      return res.status(403).json({ message: "Non autorizzato" });
    }

    const [imgCount] = await db.select({ count: count() })
      .from(eventImages).where(eq(eventImages.eventId, id));
    if (Number(imgCount?.count ?? 0) >= 5) {
      return res.status(400).json({ message: "Massimo 5 immagini per evento" });
    }

    const imageUrl = await uploadEventImage(req.file.buffer, req.file.originalname, req.file.mimetype);
    const sortOrder = Number(imgCount?.count ?? 0);

    const [newImg] = await db.insert(eventImages).values({
      eventId: id,
      imageUrl,
      sortOrder,
    }).returning();

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

    const currentUser = await storage.getUser(userId);
    const isAdminOrMod = currentUser && (currentUser.role === "admin" || currentUser.role === "moderator");
    if (evt.creatorId !== userId && !isAdminOrMod) {
      return res.status(403).json({ message: "Non autorizzato" });
    }

    const [img] = await db.select().from(eventImages).where(eq(eventImages.id, imageId));
    if (!img) return res.status(404).json({ message: "Immagine non trovata" });

    const filename = img.imageUrl.replace("/api/events/images/", "");
    try { await deleteObject(`public/events/${filename}`); } catch {}

    await db.delete(eventImages).where(eq(eventImages.id, imageId));
    return res.json({ message: "Immagine eliminata" });
  } catch (err) {
    console.error("[events] DELETE /:id/images/:imageId error:", err);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

// ── ADMIN / MODERATOR ROUTES ──────────────────────────────────────────────────

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

    // Inviti automatici ai club
    if (evt.autoInviteReason) {
      await sendClubInvites(evt, userId);
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
    const { reason } = req.body;

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

// ── HELPERS ───────────────────────────────────────────────────────────────────

async function sendClubInvites(evt: typeof events.$inferSelect, approverUserId: string) {
  try {
    const conditions: any[] = [];
    if (evt.autoInviteRegion) {
      conditions.push(ilike(motoClubs.region, evt.autoInviteRegion));
    }
    if (evt.autoInviteBrand) {
      conditions.push(ilike(motoClubs.brandName, evt.autoInviteBrand));
    }

    if (conditions.length === 0) return;

    const clubs = await db.select({ id: motoClubs.id, name: motoClubs.name })
      .from(motoClubs)
      .where(and(
        ...conditions,
      ));

    if (clubs.length === 0) return;

    for (const club of clubs) {
      try {
        await db.insert(eventClubInvites).values({
          eventId: evt.id,
          clubId: club.id,
        }).onConflictDoNothing();

        // Notifica a tutti i membri del club
        const members = await db.select({ userId: motoClubMembers.userId })
          .from(motoClubMembers)
          .where(eq(motoClubMembers.clubId, club.id));

        await Promise.all(members.map(async (member) => {
          if (member.userId === evt.creatorId) return;
          try {
            await storage.createNotification({
              userId: member.userId,
              title: "Evento per il tuo club!",
              body: `Il tuo club "${club.name}" è stato invitato all'evento "${evt.title}". ${evt.autoInviteReason ?? ""}`.trim(),
              notificationType: "event_invite",
              referenceType: "event",
              referenceId: evt.id,
            });
          } catch {}
        }));
      } catch {}
    }
  } catch (err) {
    console.error("[events] sendClubInvites error:", err);
  }
}

export default router;
