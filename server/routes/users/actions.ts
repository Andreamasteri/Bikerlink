import { Router, type Request, type Response, type NextFunction } from "express";
import multer, { MulterError } from "multer";
import path from "path";
import fs from "fs";
import { storage } from "../../storage";
import { userPhotos } from "@shared/db";
import { userReportSchema } from "@shared/validators";
import { db } from "../../db";
import { eq } from "drizzle-orm";
import { uploadBuffer, downloadBuffer, deleteObject, BUCKET_PROFILE_PIC } from "../../objectStorage";
import { reportRateLimiter, getTrustedClientIp } from "../../lib/abuse-rate-limit";
import { sendSuccess, sendError } from "../../lib/api-response";
import { isProtectedUser } from "../../constants";
import type { InsertReport } from "@shared/db";

import { requireAuth } from "../../lib/auth-middleware";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/heic",
      "image/heif",
      "image/avif",
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Tipo di file non supportato. Usa JPEG, PNG, WebP, HEIC/HEIF o AVIF."));
    }
  },
});

router.post("/me/photos", requireAuth, async (req: Request, res: Response) => {
  const multerError = await new Promise<MulterError | Error | null>((resolve) => {
    upload.single("photo")(req, res, ((err?: unknown) => {
      if (err instanceof MulterError || err instanceof Error) resolve(err);
      else resolve(null);
    }) as NextFunction);
  });

  if (multerError) {
    if (multerError instanceof MulterError && multerError.code === "LIMIT_FILE_SIZE") {
      return sendError(res, 400, "Foto troppo grande. Dimensione massima consentita: 5 MB.");
    }
    return sendError(res, 400, multerError.message || "Formato file non supportato.");
  }

  try {
    const userId = req.session.userId!;

    const user = await storage.getUser(userId);
    if (!user) {
      return sendError(res, 404, "Utente non trovato");
    }

    // Sostituzione in un'unica operazione: il client invia replacePhotoId
    // invece di fare una DELETE separata seguita da una POST (doppio round-trip).
    const replacePhotoId =
      typeof req.body?.replacePhotoId === "string" && req.body.replacePhotoId
        ? req.body.replacePhotoId
        : null;

    const oldPhoto = replacePhotoId
      ? await storage.getUserPhoto(replacePhotoId)
      : null;
    if (replacePhotoId) {
      if (!oldPhoto || oldPhoto.userId !== userId) {
        return sendError(res, 404, "Foto da sostituire non trovata");
      }
    }

    const count = await storage.getUserPhotoCount(userId);
    // In sostituzione il conteggio resta invariato (cancella una, aggiunge una).
    if (!replacePhotoId && count >= 3) {
      return sendError(res, 400, "Massimo 3 foto consentite");
    }

    if (!req.file) {
      return sendError(res, 400, "Nessuna foto caricata");
    }

    const { compressToWebP } = await import("../../utils/image-processing");
    const webpBuffer = await compressToWebP(req.file.buffer);
    const filename = Date.now().toString() + "-" + Math.random().toString(36).substr(2, 9) + ".webp";
    const objectPath = `${BUCKET_PROFILE_PIC}${filename}`;

    await uploadBuffer(objectPath, webpBuffer, "image/webp");

    const photoUrl = `/api/users/photos/${filename}`;
    // Mantiene lo stesso slot in sostituzione; altrimenti accoda in fondo.
    const sortOrder = oldPhoto ? oldPhoto.sortOrder : count;

    const photo = await storage.createUserPhoto({
      userId,
      photoUrl,
      sortOrder,
      isApproved: true,
    });

    // Rimuove la vecchia foto (oggetto + record) dopo aver salvato la nuova.
    if (oldPhoto) {
      const oldUrl = oldPhoto.photoUrl;
      if (oldUrl.startsWith("/api/users/photos/")) {
        const oldFilename = oldUrl.replace("/api/users/photos/", "");
        // Try new ProfilePic/ path first, then legacy public/photos/
        try {
          await deleteObject(`${BUCKET_PROFILE_PIC}${oldFilename}`);
        } catch {
          try {
            await deleteObject(`public/photos/${oldFilename}`);
          } catch (err) {
            console.warn(`[users] Failed to delete replaced photo object for ${oldFilename}:`, err);
          }
        }
      } else if (oldUrl.startsWith("/uploads/photos/")) {
        try {
          const filePath = path.join(process.cwd(), oldUrl);
          if (fs.existsSync(filePath)) { fs.unlinkSync(filePath); }
        } catch (err) {
          console.warn(`[users] Failed to delete replaced local photo file ${oldUrl}:`, err);
        }
      }
      await storage.deleteUserPhoto(replacePhotoId);
    }

    return res.status(201).json(photo);
  } catch (error) {
    console.error("Upload photo error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.get("/photos/:filename", async (req: Request, res: Response) => {
  try {
    if (!req.session.userId) {
      return sendError(res, 401, "Non autenticato");
    }
    const requesterId = req.session.userId;
    const filename = req.params.filename as string;
    const photoUrl = `/api/users/photos/${filename}`;

    const [photoRow] = await db
      .select({ userId: userPhotos.userId, isApproved: userPhotos.isApproved })
      .from(userPhotos)
      .where(eq(userPhotos.photoUrl, photoUrl))
      .limit(1);

    if (!photoRow) {
      return sendError(res, 404, "Foto non trovata");
    }

    const isOwner = photoRow.userId === requesterId;
    if (!isOwner) {
      if (!photoRow.isApproved) {
        return sendError(res, 404, "Foto non trovata");
      }
      const blocked = await storage.hasBlockedUser(photoRow.userId, requesterId);
      if (blocked) {
        return sendError(res, 403, "Non puoi visualizzare questa foto");
      }
    }

    // Try new ProfilePic/ path first, fall back to legacy public/photos/
    let buffer: Buffer;
    try {
      buffer = await downloadBuffer(`${BUCKET_PROFILE_PIC}${filename}`);
    } catch {
      buffer = await downloadBuffer(`public/photos/${filename}`);
    }
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes: Record<string, string> = {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".webp": "image/webp",
    };
    const contentType = mimeTypes[ext] ?? "image/jpeg";
    res.set("Content-Type", contentType);
    res.set("Cache-Control", "private, max-age=3600");
    return res.send(buffer);
  } catch {
    return sendError(res, 404, "Foto non trovata");
  }
});

router.delete("/me/photos/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const photoId = req.params.id as string;

    const photo = await storage.getUserPhoto(photoId);
    if (!photo) {
      return sendError(res, 404, "Foto non trovata");
    }

    if (photo.userId !== userId) {
      return sendError(res, 403, "Non autorizzato");
    }

    const photoUrl = photo.photoUrl;
    if (photoUrl.startsWith("/api/users/photos/")) {
      const filename = photoUrl.replace("/api/users/photos/", "");
      // Try new ProfilePic/ path first, then legacy public/photos/
      try {
        await deleteObject(`${BUCKET_PROFILE_PIC}${filename}`);
      } catch {
        try { await deleteObject(`public/photos/${filename}`); } catch (err) {
          console.warn(`[users] Failed to delete photo object for ${filename}:`, err);
        }
      }
    } else if (photoUrl.startsWith("/uploads/photos/")) {
      try {
        const filePath = path.join(process.cwd(), photoUrl);
        if (fs.existsSync(filePath)) { fs.unlinkSync(filePath); }
      } catch (err) {
        console.warn(`[users] Failed to delete local photo file ${photoUrl}:`, err);
      }
    }

    await storage.deleteUserPhoto(photoId);

    return sendSuccess(res, undefined, "Foto eliminata");
  } catch (error) {
    console.error("Delete photo error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.get("/blocked", requireAuth, async (req: Request, res: Response) => {
  try {
    const blockerId = req.session.userId!;
    const blockedIds = await storage.getBlockedUsersByBlocker(blockerId);
    return res.json(blockedIds);
  } catch (error) {
    console.error("Get blocked users error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.post("/:id/report", requireAuth, async (req: Request, res: Response) => {
  // Task #2530 — legacy endpoint: delega al nuovo flusso categorizzato in
  // server/routes/reports.ts riusando il servizio reporting. Lasciato attivo per
  // backward compat con client più vecchi che non conoscono `POST /api/reports`.
  try {
    const reporterId = req.session.userId!;
    const reportedUserId = req.params.id as string;
    const parsedRep = userReportSchema.safeParse(req.body);
    if (!parsedRep.success) return sendError(res, 400, parsedRep.error.issues[0].message);
    const { reason, description, category, context, contextId } = parsedRep.data;

    const ip = getTrustedClientIp(req) ?? "";
    if (reportRateLimiter.isOverLimit(reporterId, ip)) {
      return sendError(res, 429, "Hai inviato troppe segnalazioni. Riprova tra un'ora.");
    }

    if (reporterId === reportedUserId) {
      return sendError(res, 400, "Non puoi segnalare te stesso");
    }

    const targetUser = await storage.getUser(reportedUserId);
    if (!targetUser) return sendError(res, 404, "Utente non trovato");

    const { computeTrustScore, evaluateAutoActions, hookFeedbackLoop } =
      await import("../../services/reportingService");
    const { categoryToSeverity } = await import("@shared/db");
    const { sendModeratorReportPush } = await import("../../push-notifications");

    const cat = category;
    const severity = cat ? categoryToSeverity(cat) : "low";
    const trustScore = await computeTrustScore(reporterId);
    const affectedFeedbackLoop = cat
      ? await hookFeedbackLoop({
          reporterId,
          reportedUserId,
          category: cat,
          context: context ?? "profile",
          contextId: contextId ?? null,
        })
      : false;

    const reportData: InsertReport = {
      reporterId,
      reportedUserId,
      reason,
      description: (description && typeof description === "string") ? description : null,
      status: "pending",
      category: cat ?? null,
      context: context ?? "profile",
      contextId: contextId ?? null,
      reportedUserRole: targetUser.userType,
      severity,
      affectedFeedbackLoop,
      reporterTrustScore: trustScore,
    };
    const report = await storage.createReport(reportData);

    evaluateAutoActions(reportedUserId)
      .then(async (out) => {
        if (out.notified || severity === "high" || severity === "critical") {
          await sendModeratorReportPush({
            reportedNickname: targetUser.nickname ?? "Utente",
            category: cat ?? reason,
            severity,
            reportedUserId,
            reportId: report.id,
          });
        }
      })
      .catch((err) => console.warn("[Reports legacy] evaluateAutoActions failed:", err));

    return sendSuccess(res, undefined, "Segnalazione inviata con successo");
  } catch (error) {
    console.error("Report user error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.post("/:id/block", requireAuth, async (req: Request, res: Response) => {
  try {
    const blockerId = req.session.userId!;
    const blockedId = req.params.id as string;

    if (blockerId === blockedId) {
      return sendError(res, 400, "Non puoi bloccare te stesso");
    }

    const targetUser = await storage.getUser(blockedId);
    if (!targetUser) {
      return sendError(res, 404, "Utente non trovato");
    }

    if (isProtectedUser(targetUser.nickname)) {
      return sendError(res, 403, "Utente di sistema non modificabile");
    }

    const alreadyBlocked = await storage.isBlocked(blockerId, blockedId);
    if (alreadyBlocked) {
      return sendError(res, 409, "Utente già bloccato");
    }

    await storage.blockUser(blockerId, blockedId);
    await storage.deleteBikerBikerMatchesBetween(blockerId, blockedId);
    return sendSuccess(res, undefined, "Utente bloccato con successo");
  } catch (error) {
    console.error("Block user error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.delete("/:id/block", requireAuth, async (req: Request, res: Response) => {
  try {
    const blockerId = req.session.userId!;
    const blockedId = req.params.id as string;

    if (blockerId === blockedId) {
      return sendError(res, 400, "Non puoi sbloccare te stesso");
    }

    const success = await storage.unblockUser(blockerId, blockedId);
    if (!success) {
      return sendError(res, 404, "Blocco non trovato");
    }

    return sendSuccess(res, undefined, "Utente sbloccato con successo");
  } catch (error) {
    console.error("Unblock user error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

export default router;
