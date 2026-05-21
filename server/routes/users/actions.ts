import { Router, type Request, type Response, type NextFunction } from "express";
import multer, { MulterError } from "multer";
import path from "path";
import fs from "fs";
import { storage } from "../../storage";
import { userPhotos, userReportSchema } from "@shared/schema";
import { db } from "../../db";
import { eq } from "drizzle-orm";
import { uploadBuffer, downloadBuffer, deleteObject } from "../../objectStorage";
import { reportRateLimiter, getTrustedClientIp } from "../../lib/abuse-rate-limit";
import { isProtectedUser } from "../../constants";
import type { InsertReport } from "@shared/schema";

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
      return res.status(400).json({ message: "Foto troppo grande. Dimensione massima consentita: 5 MB." });
    }
    return res.status(400).json({ message: multerError.message || "Formato file non supportato." });
  }

  try {
    const userId = req.session.userId!;

    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(404).json({ message: "Utente non trovato" });
    }

    const count = await storage.getUserPhotoCount(userId);
    if (count >= 3) {
      return res.status(400).json({ message: "Massimo 3 foto consentite" });
    }

    if (!req.file) {
      return res.status(400).json({ message: "Nessuna foto caricata" });
    }

    const { compressToWebP } = await import("../../utils/image-processing");
    const webpBuffer = await compressToWebP(req.file.buffer);
    const filename = Date.now().toString() + "-" + Math.random().toString(36).substr(2, 9) + ".webp";
    const objectPath = `public/photos/${filename}`;

    await uploadBuffer(objectPath, webpBuffer, "image/webp");

    const photoUrl = `/api/users/photos/${filename}`;
    const sortOrder = await storage.getUserPhotoCount(userId);

    const photo = await storage.createUserPhoto({
      userId,
      photoUrl,
      sortOrder,
      isApproved: true,
    });

    return res.status(201).json(photo);
  } catch (error) {
    console.error("Upload photo error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/photos/:filename", async (req: Request, res: Response) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Non autenticato" });
    }
    const requesterId = req.session.userId;
    const filename = req.params.filename;
    const photoUrl = `/api/users/photos/${filename}`;

    const [photoRow] = await db
      .select({ userId: userPhotos.userId, isApproved: userPhotos.isApproved })
      .from(userPhotos)
      .where(eq(userPhotos.photoUrl, photoUrl))
      .limit(1);

    if (!photoRow) {
      return res.status(404).json({ message: "Foto non trovata" });
    }

    const isOwner = photoRow.userId === requesterId;
    if (!isOwner) {
      if (!photoRow.isApproved) {
        return res.status(404).json({ message: "Foto non trovata" });
      }
      const blocked = await storage.hasBlockedUser(photoRow.userId, requesterId);
      if (blocked) {
        return res.status(403).json({ message: "Non puoi visualizzare questa foto" });
      }
    }

    const objectPath = `public/photos/${filename}`;
    const buffer = await downloadBuffer(objectPath);
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
    return res.status(404).json({ message: "Foto non trovata" });
  }
});

router.delete("/me/photos/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const photoId = req.params.id as string;

    const photo = await storage.getUserPhoto(photoId);
    if (!photo) {
      return res.status(404).json({ message: "Foto non trovata" });
    }

    if (photo.userId !== userId) {
      return res.status(403).json({ message: "Non autorizzato" });
    }

    const photoUrl = photo.photoUrl;
    if (photoUrl.startsWith("/api/users/photos/")) {
      const filename = photoUrl.replace("/api/users/photos/", "");
      try { await deleteObject(`public/photos/${filename}`); } catch {}
    } else if (photoUrl.startsWith("/uploads/photos/")) {
      try {
        const filePath = path.join(process.cwd(), photoUrl);
        if (fs.existsSync(filePath)) { fs.unlinkSync(filePath); }
      } catch {}
    }

    await storage.deleteUserPhoto(photoId);

    return res.json({ message: "Foto eliminata" });
  } catch (error) {
    console.error("Delete photo error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/blocked", requireAuth, async (req: Request, res: Response) => {
  try {
    const blockerId = req.session.userId!;
    const blockedIds = await storage.getBlockedUsersByBlocker(blockerId);
    return res.json(blockedIds);
  } catch (error) {
    console.error("Get blocked users error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.post("/:id/report", requireAuth, async (req: Request, res: Response) => {
  try {
    const reporterId = req.session.userId!;
    const reportedUserId = req.params.id as string;
    const parsedRep = userReportSchema.safeParse(req.body);
    if (!parsedRep.success) return res.status(400).json({ message: parsedRep.error.issues[0].message });
    const { reason, description } = parsedRep.data;

    const ip = getTrustedClientIp(req) ?? "";
    if (reportRateLimiter.isOverLimit(reporterId, ip)) {
      return res.status(429).json({ message: "Hai inviato troppe segnalazioni. Riprova tra un'ora." });
    }

    if (reporterId === reportedUserId) {
      return res.status(400).json({ message: "Non puoi segnalare te stesso" });
    }

    const validReasons = [
      "Spam",
      "Comportamento inappropriato",
      "Profilo falso/bot",
      "Molestia",
      "Contenuto offensivo",
      "Altro",
    ];
    if (!reason || !validReasons.includes(reason)) {
      return res.status(400).json({ message: "Motivo non valido" });
    }

    if (description && typeof description === "string" && description.length > 500) {
      return res.status(400).json({ message: "La descrizione non può superare 500 caratteri" });
    }

    const targetUser = await storage.getUser(reportedUserId);
    if (!targetUser) {
      return res.status(404).json({ message: "Utente non trovato" });
    }

    const reportData: InsertReport = {
      reporterId,
      reportedUserId,
      reason,
      description: (description && typeof description === "string") ? description : null,
      status: "pending",
    };
    await storage.createReport(reportData);

    return res.json({ message: "Segnalazione inviata con successo" });
  } catch (error) {
    console.error("Report user error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.post("/:id/block", requireAuth, async (req: Request, res: Response) => {
  try {
    const blockerId = req.session.userId!;
    const blockedId = req.params.id as string;

    if (blockerId === blockedId) {
      return res.status(400).json({ message: "Non puoi bloccare te stesso" });
    }

    const targetUser = await storage.getUser(blockedId);
    if (!targetUser) {
      return res.status(404).json({ message: "Utente non trovato" });
    }

    if (isProtectedUser(targetUser.nickname)) {
      return res.status(403).json({ message: "Utente di sistema non modificabile" });
    }

    const alreadyBlocked = await storage.isBlocked(blockerId, blockedId);
    if (alreadyBlocked) {
      return res.status(409).json({ message: "Utente già bloccato" });
    }

    await storage.blockUser(blockerId, blockedId);
    await storage.deleteBikerBikerMatchesBetween(blockerId, blockedId);
    return res.json({ message: "Utente bloccato con successo" });
  } catch (error) {
    console.error("Block user error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.delete("/:id/block", requireAuth, async (req: Request, res: Response) => {
  try {
    const blockerId = req.session.userId!;
    const blockedId = req.params.id as string;

    if (blockerId === blockedId) {
      return res.status(400).json({ message: "Non puoi sbloccare te stesso" });
    }

    const success = await storage.unblockUser(blockerId, blockedId);
    if (!success) {
      return res.status(404).json({ message: "Blocco non trovato" });
    }

    return res.json({ message: "Utente sbloccato con successo" });
  } catch (error) {
    console.error("Unblock user error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

export default router;
