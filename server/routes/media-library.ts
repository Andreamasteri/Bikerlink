import { Router, type Request, type Response, type NextFunction } from "express";
import multer from "multer";
import { db } from "../db";
import { mediaLibrary } from "@shared/db";
import { eq, asc } from "drizzle-orm";
import { storage as appStorage } from "../storage";
import { sendSuccess, sendError } from "../lib/api-response";

async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const sess = req.session as { userId?: string };
  if (!sess?.userId) return sendError(res, 401, "Non autenticato");
  const user = await appStorage.getUser(sess.userId);
  if (!user || user.role !== "admin") return sendError(res, 403, "Accesso non autorizzato");
  next();
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

const VALID_TYPES = ["pdf", "video"] as const;
const SAFE_MEDIA_KEY_RE = /^public\/media\/[a-zA-Z0-9_\-]+\.[a-zA-Z0-9]{2,5}$/;

function validateType(type: string): boolean {
  return VALID_TYPES.includes(type as (typeof VALID_TYPES)[number]);
}

// ── Public router: GET /api/media and GET /api/media/file/:filename ─────────
export const publicMediaRouter = Router();

publicMediaRouter.get("/", async (_req: Request, res: Response) => {
  try {
    const items = await db
      .select()
      .from(mediaLibrary)
      .orderBy(asc(mediaLibrary.sortOrder), asc(mediaLibrary.createdAt));
    return res.json(items);
  } catch (err) {
    console.error("[media] GET / error:", err);
    return sendError(res, 500, "Errore interno del server");
  }
});

publicMediaRouter.get("/file/:filename", async (req: Request, res: Response) => {
  try {
    const { downloadBuffer } = await import("../objectStorage");
    const filename = decodeURIComponent(req.params.filename as string);

    if (
      !SAFE_MEDIA_KEY_RE.test(filename) ||
      filename.includes("..") ||
      filename.includes("\0")
    ) {
      return sendError(res, 400, "Chiave file non valida");
    }

    const buffer = await downloadBuffer(filename);
    const ext = filename.split(".").pop()?.toLowerCase() || "";
    const mimeTypes: Record<string, string> = {
      pdf: "application/pdf",
      mp4: "video/mp4",
      webm: "video/webm",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
    };
    res.setHeader("Content-Type", mimeTypes[ext] || "application/octet-stream");
    res.setHeader("Cache-Control", "public, max-age=86400");
    return res.send(buffer);
  } catch (err) {
    console.error("[media] file serve error:", err);
    return sendError(res, 404, "File non trovato");
  }
});

// ── Admin router: all mutating routes under /api/admin/media ────────────────
export const adminMediaRouter = Router();

adminMediaRouter.use(requireAdmin);

adminMediaRouter.post("/", async (req: Request, res: Response) => {
  try {
    const { type, titleIt, titleEn, url, thumbnailUrl, sortOrder } = req.body;
    if (!type || !titleIt || !titleEn || !url) {
      return sendError(res, 400, "type, titleIt, titleEn, url sono obbligatori");
    }
    if (!validateType(type)) {
      return sendError(res, 400, "type deve essere 'pdf' o 'video'");
    }
    if (typeof url !== "string" || !url.startsWith("http") && !url.startsWith("/")) {
      return sendError(res, 400, "url non valido");
    }
    const [item] = await db.insert(mediaLibrary).values({
      type,
      titleIt,
      titleEn,
      url,
      thumbnailUrl: thumbnailUrl || null,
      sortOrder: sortOrder != null ? Number(sortOrder) : 0,
    }).returning();
    return res.status(201).json(item);
  } catch (err) {
    console.error("[media] POST / error:", err);
    return sendError(res, 500, "Errore interno del server");
  }
});

adminMediaRouter.put("/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { type, titleIt, titleEn, url, thumbnailUrl, sortOrder } = req.body;
    if (type !== undefined && !validateType(type)) {
      return sendError(res, 400, "type deve essere 'pdf' o 'video'");
    }
    const updates: Partial<typeof mediaLibrary.$inferInsert> = {};
    if (type !== undefined) updates.type = type;
    if (titleIt !== undefined) updates.titleIt = titleIt;
    if (titleEn !== undefined) updates.titleEn = titleEn;
    if (url !== undefined) updates.url = url;
    if (thumbnailUrl !== undefined) updates.thumbnailUrl = thumbnailUrl || null;
    if (sortOrder !== undefined) updates.sortOrder = Number(sortOrder);
    const [item] = await db.update(mediaLibrary).set(updates).where(eq(mediaLibrary.id, id)).returning();
    if (!item) return sendError(res, 404, "Elemento non trovato");
    return res.json(item);
  } catch (err) {
    console.error("[media] PUT /:id error:", err);
    return sendError(res, 500, "Errore interno del server");
  }
});

adminMediaRouter.delete("/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const [deleted] = await db.delete(mediaLibrary).where(eq(mediaLibrary.id, id)).returning();
    if (!deleted) return sendError(res, 404, "Elemento non trovato");
    return sendSuccess(res, undefined, "Eliminato");
  } catch (err) {
    console.error("[media] DELETE /:id error:", err);
    return sendError(res, 500, "Errore interno del server");
  }
});

adminMediaRouter.post("/upload", upload.single("file"), async (req: Request, res: Response) => {
  try {
    if (!req.file) return sendError(res, 400, "Nessun file caricato");
    const { uploadBuffer } = await import("../objectStorage");
    const ext = req.file.originalname.split(".").pop()?.toLowerCase() || "bin";
    const safeExt = ["pdf", "mp4", "webm", "jpg", "jpeg", "png"].includes(ext) ? ext : "bin";
    const filename = `public/media/${Date.now()}-${Math.random().toString(36).slice(2)}.${safeExt}`;
    await uploadBuffer(filename, req.file.buffer, req.file.mimetype);

    const domain = process.env.EXPO_PUBLIC_DOMAIN?.trim() || "";
    const publicUrl = domain
      ? `https://${domain}/api/media/file/${encodeURIComponent(filename)}`
      : `/api/media/file/${encodeURIComponent(filename)}`;

    return res.json({ url: publicUrl, filename });
  } catch (err) {
    console.error("[media] upload error:", err);
    return sendError(res, 500, "Errore upload");
  }
});

export default publicMediaRouter;
