import { Router, type Request, type Response } from "express";
import path from "path";
import multer from "multer";
import { storage } from "../storage";
import { uploadBuffer, downloadBuffer, deleteObject, BUCKET_CONTEST } from "../objectStorage";
import { allLimited } from "../lib/concurrency";
import { db } from "../db";
import { photoContestEntries } from "@shared/db";
import { eq } from "drizzle-orm";
import { sendSuccess, sendError } from "../lib/api-response";

import { requireUserId } from "../lib/auth-middleware";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    // Accetta tutti i formati immagine (JPEG, PNG, WebP, HEIC/HEIF, AVIF, ecc.)
    // L'output viene comunque convertito in WebP da compressToWebP()
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Solo immagini consentite"));
    }
  },
});

function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

const MAX_FALLBACK_SIZE = 5 * 1024 * 1024; // 5 MB

router.post("/entries", upload.single("photo"), async (req: Request, res: Response) => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  const caption = req.body.caption || null;
  const performanceData = req.body.performanceData || null;

  let photoUrl: string | null = null;

  if (req.file) {
    // --- Step 1: compression ---
    let uploadBuf: Buffer;
    let uploadMime: string;
    let fileExt: string;

    try {
      const { compressToWebP } = await import("../utils/image-processing");
      uploadBuf = await compressToWebP(req.file.buffer);
      uploadMime = "image/webp";
      fileExt = "webp";
      console.log(`[contest] Compressione WebP riuscita — ${req.file.originalname} → ${uploadBuf.length} bytes`);
    } catch (compressionError) {
      console.warn(`[contest] Compressione WebP fallita per "${req.file.originalname}":`, compressionError);

      if (req.file.buffer.length > MAX_FALLBACK_SIZE) {
        return sendError(
          res,
          400,
          `Foto troppo grande (max 5 MB quando il formato non è supportato). Riprova con un JPEG o PNG.`
        );
      }

      // Fallback: upload del buffer originale
      uploadBuf = req.file.buffer;
      uploadMime = req.file.mimetype;
      const rawExt = req.file.originalname.split(".").pop()?.toLowerCase() ?? "jpg";
      fileExt = rawExt;
      console.log(`[contest] Fallback: upload formato originale (${uploadMime}, ${uploadBuf.length} bytes)`);
    }

    // --- Step 2: object storage upload ---
    const filename = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${fileExt}`;
    const objectPath = `${BUCKET_CONTEST}${filename}`;

    try {
      await uploadBuffer(objectPath, uploadBuf, uploadMime);
      console.log(`[contest] Upload su object storage riuscito: ${objectPath}`);
    } catch (storageError) {
      console.error(`[contest] Upload su object storage fallito per ${objectPath}:`, storageError);
      return sendError(res, 503, "Servizio storage temporaneamente non disponibile. Riprova tra qualche secondo.");
    }

    photoUrl = `/api/contest/photos/${filename}`;
  } else if (req.body.photoUrl) {
    photoUrl = req.body.photoUrl;
  }

  if (!photoUrl && !performanceData) {
    return sendError(res, 400, "Foto o dati performance obbligatori");
  }

  // --- Step 3: DB insert ---
  try {
    const now = new Date();
    const weekNumber = getWeekNumber(now);
    const year = now.getFullYear();

    const entry = await storage.createPhotoContestEntry({
      userId,
      photoUrl,
      caption,
      performanceData: performanceData ? (typeof performanceData === "string" ? performanceData : JSON.stringify(performanceData)) : null,
      weekNumber,
      year,
      isApproved: true,
    });

    console.log(`[contest] Entry creata con successo: ${entry.id} (utente ${userId})`);
    return res.status(201).json(entry);
  } catch (dbError) {
    console.error(`[contest] Errore DB durante creazione entry (utente ${userId}):`, dbError);
    return sendError(res, 500, "Errore nel salvataggio della foto. Riprova.");
  }
});

router.get("/entries", async (req: Request, res: Response) => {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const now = new Date();
    const weekNumber = parseInt(req.query.week as string) || getWeekNumber(now);
    const year = parseInt(req.query.year as string) || now.getFullYear();

    const entries = await storage.getPhotoContestEntries(weekNumber, year);

    const today = now.toISOString().split("T")[0];
    const dailyCount = await storage.getDailyVoteCount(userId, today);
    const votesUsed = dailyCount?.count ?? 0;

    const entriesWithVoteInfo = await allLimited(
      entries.map((entry) => async () => {
        const existingVote = await storage.getPhotoVote(entry.id, userId);
        return {
          ...entry,
          hasVoted: !!existingVote,
          isOwn: entry.userId === userId,
        };
      })
    );

    return res.json({
      entries: entriesWithVoteInfo,
      weekNumber,
      year,
      votesUsed,
      maxVotesPerDay: 10,
    });
  } catch (error) {
    console.error("Contest entries error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.post("/entries/:id/vote", async (req: Request, res: Response) => {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const entryId = req.params.id as string;

    const entry = await storage.getPhotoContestEntry(entryId);

    if (!entry || !entry.isApproved) {
      return sendError(res, 404, "Foto non trovata");
    }

    // Only allow voting on entries from the current week or the immediately preceding week
    const now = new Date();
    const currentWeek = getWeekNumber(now);
    const currentYear = now.getFullYear();
    const prevWeekDate = new Date(now.getTime() - 7 * 86400000);
    const prevWeek = getWeekNumber(prevWeekDate);
    const prevYear = prevWeekDate.getFullYear();
    const inCurrentWindow =
      (entry.weekNumber === currentWeek && entry.year === currentYear) ||
      (entry.weekNumber === prevWeek && entry.year === prevYear);
    if (!inCurrentWindow) {
      return sendError(res, 404, "Foto non trovata");
    }

    if (entry.userId === userId) {
      return sendError(res, 400, "Non puoi votare la tua foto");
    }
    const existingVote = await storage.getPhotoVote(entryId, userId);
    if (existingVote) {
      return sendError(res, 400, "Hai già votato questa foto");
    }

    const today = new Date().toISOString().split("T")[0] as string;
    const dailyCount = await storage.getDailyVoteCount(userId, today);
    if (dailyCount && dailyCount.count >= 10) {
      return sendError(res, 400, "Hai raggiunto il limite di 10 voti giornalieri");
    }

    await storage.createPhotoVote({ entryId, userId });
    await storage.incrementEntryVotes(entryId);
    await storage.upsertDailyVoteCount(userId, today);

    return sendSuccess(res, undefined, "Voto registrato");
  } catch (error) {
    console.error("Contest vote error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.delete("/entries/:id", async (req: Request, res: Response) => {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const id = req.params.id as string;

    const entry = await storage.getPhotoContestEntry(id);
    if (!entry) {
      return sendError(res, 404, "Foto non trovata");
    }

    if (entry.userId !== userId) {
      return sendError(res, 403, "Non puoi eliminare questa foto");
    }

    await storage.deletePhotoContestEntry(id);
    // Also remove the image from object storage so the URL cannot be accessed after deletion
    if (entry.photoUrl) {
      const photoFilename = entry.photoUrl.split("/").pop();
      if (photoFilename) {
        // Try new PhotoContest/ path first, then legacy public/contest/
        await deleteObject(`${BUCKET_CONTEST}${photoFilename}`).catch(() =>
          deleteObject(`public/contest/${photoFilename}`).catch(() => {})
        );
      }
    }
    return sendSuccess(res, undefined, "Foto eliminata");
  } catch (error) {
    console.error("Contest delete entry error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.get("/photos/:filename", async (req: Request, res: Response) => {
  try {
    // Require authentication — URLs must not be accessible to logged-out third parties
    const userId = requireUserId(req, res);
    if (!userId) return;

    const filename = req.params.filename as string;
    // Basic filename sanity check to prevent path traversal
    if (!filename || filename.includes("/") || filename.includes("..")) {
      return res.status(400).end();
    }

    // Check that the entry still exists in the DB and is approved.
    // Covers: user-deleted entries (DB row gone) and moderator-rejected entries (isApproved=false).
    const photoUrl = `/api/contest/photos/${filename}`;
    const [entry] = await db
      .select({ id: photoContestEntries.id, isApproved: photoContestEntries.isApproved })
      .from(photoContestEntries)
      .where(eq(photoContestEntries.photoUrl, photoUrl))
      .limit(1);

    // Fail-closed: nega tutto ciò che non è esplicitamente approvato.
    // Se in futuro lo schema permettesse isApproved nullable o pending,
    // vogliamo comunque non servire la foto.
    if (!entry || entry.isApproved !== true) {
      return sendError(res, 404, "Foto non trovata");
    }

    // Try new PhotoContest/ path first, fall back to legacy public/contest/
    let buffer: Buffer;
    try {
      buffer = await downloadBuffer(`${BUCKET_CONTEST}${filename}`);
    } catch {
      buffer = await downloadBuffer(`public/contest/${filename}`);
    }
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes: Record<string, string> = {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".webp": "image/webp",
      ".heic": "image/heic",
      ".heif": "image/heif",
      ".avif": "image/avif",
      ".gif": "image/gif",
    };
    const contentType = mimeTypes[ext] ?? "image/jpeg";
    res.set("Content-Type", contentType);
    res.set("Cache-Control", "private, no-store");
    return res.send(buffer);
  } catch {
    return sendError(res, 404, "Foto non trovata");
  }
});

router.get("/winners", async (req: Request, res: Response) => {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const winners = await storage.getPhotoWinners();
    return res.json(winners);
  } catch (error) {
    console.error("Contest winners error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

export default router;
