import { Router, type Request, type Response } from "express";
import path from "path";
import fs from "fs";
import { storage } from "../storage";
import { createClubInvitesForMoto } from "./motoclubs";
import { classifyMatch } from "../matching/notifications/classify";
import { dispatchMatchNotification } from "../matching/notifications/dispatcher";
import { updateWishlistSchema, uploadPhotoSchema, addWishlistMotoSchema, updateWishlistMotoSchema } from "@shared/validators";
import { uploadBuffer, downloadBuffer, deleteObject, BUCKET_WISHLIST } from "../objectStorage";

import { requireAuth } from "../lib/auth-middleware";
import { sendSuccess, sendError } from "../lib/api-response";

const router = Router();

/** Max accepted base64-decoded image size (8 MB). */
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

// Legacy upload dir — only used as a read-only fallback for photos uploaded
// before the bucket migration.
const LEGACY_UPLOADS_DIR = path.join(process.cwd(), "uploads", "wishlist");

router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const user = await storage.getUser(userId);
    if (!user || user.userType !== "zavorrina") {
      return sendError(res, 403, "Solo le zavorrine possono accedere alla wishlist");
    }

    let wishlist = await storage.getWishlist(userId);
    if (!wishlist) {
      wishlist = await storage.createOrUpdateWishlist(userId, "");
    }

    const photos = await storage.getWishlistPhotos(wishlist.id);
    const motos = await storage.getWishlistMotos(wishlist.id);

    return res.json({ wishlist, photos, motos });
  } catch (error) {
    console.error("Get wishlist error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.put("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const parsed = updateWishlistSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 400, parsed.error.issues[0].message);
    }
    const { description } = parsed.data;
    const wishlist = await storage.createOrUpdateWishlist(userId, description ?? "");
    return res.json(wishlist);
  } catch (error) {
    console.error("Update wishlist error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.post("/photos", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    let wishlist = await storage.getWishlist(userId);
    if (!wishlist) {
      wishlist = await storage.createOrUpdateWishlist(userId, "");
    }

    const count = await storage.getWishlistPhotoCount(wishlist.id);
    if (count >= 3) {
      return sendError(res, 400, "Massimo 3 foto permesse");
    }

    const parsedPhoto = uploadPhotoSchema.safeParse(req.body);
    if (!parsedPhoto.success) {
      return sendError(res, 400, parsedPhoto.error.issues[0].message);
    }
    const { imageBase64 } = parsedPhoto.data;

    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const rawBuffer = Buffer.from(base64Data, "base64");

    if (rawBuffer.length > MAX_IMAGE_BYTES) {
      return sendError(res, 400, "Immagine troppo grande (max 8 MB)");
    }

    const { compressToWebP } = await import("../utils/image-processing");
    const webpBuffer = await compressToWebP(rawBuffer);

    const uniqueName = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}.webp`;
    await uploadBuffer(BUCKET_WISHLIST + uniqueName, webpBuffer, "image/webp");

    const photoUrl = `/api/wishlist/photos/${uniqueName}`;
    const photo = await storage.addWishlistPhoto({
      wishlistId: wishlist.id,
      photoUrl,
      sortOrder: count,
    });

    return res.status(201).json(photo);
  } catch (error) {
    console.error("Upload wishlist photo error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

/**
 * Serve a wishlist photo. Tries the bucket first; falls back to the legacy
 * local disk path for photos uploaded before the bucket migration.
 */
router.get("/photos/:filename", requireAuth, async (req: Request, res: Response) => {
  try {
    const filename = req.params.filename as string;
    if (!filename || filename.includes("/") || filename.includes("..")) {
      return res.status(400).end();
    }

    // 1. Try bucket
    try {
      const buffer = await downloadBuffer(BUCKET_WISHLIST + filename);
      res.set("Content-Type", "image/webp");
      res.set("Cache-Control", "private, max-age=3600");
      return res.send(buffer);
    } catch {
      // Not found in bucket — try legacy disk fallback below
    }

    // 2. Legacy disk fallback (pre-migration photos)
    const diskPath = path.join(LEGACY_UPLOADS_DIR, filename);
    if (fs.existsSync(diskPath)) {
      const buffer = fs.readFileSync(diskPath);
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
    }

    return sendError(res, 404, "Foto non trovata");
  } catch (error) {
    console.error("Serve wishlist photo error:", error);
    return sendError(res, 404, "Foto non trovata");
  }
});

router.delete("/photos/:photoId", requireAuth, async (req: Request, res: Response) => {
  try {
    const photoId = req.params.photoId as string;
    const userId = req.session.userId!;

    const photo = await storage.getWishlistPhoto(photoId);
    if (!photo) {
      return sendError(res, 404, "Foto non trovata");
    }

    const userWishlist = await storage.getWishlist(userId);
    if (!userWishlist || photo.wishlistId !== userWishlist.id) {
      return sendError(res, 403, "Non autorizzato");
    }

    const filename = path.basename(photo.photoUrl);

    // Delete from bucket (new path)
    if (photo.photoUrl.startsWith("/api/wishlist/photos/")) {
      try {
        await deleteObject(BUCKET_WISHLIST + filename);
      } catch (err) {
        console.warn(`[wishlist] Bucket delete failed for ${filename}:`, err);
      }
    }

    // Also attempt legacy disk cleanup (graceful — may not exist)
    const diskPath = path.join(LEGACY_UPLOADS_DIR, filename);
    if (fs.existsSync(diskPath)) {
      try { fs.unlinkSync(diskPath); } catch { /* no-op */ }
    }

    await storage.deleteWishlistPhoto(photoId);
    return sendSuccess(res, undefined, "Foto eliminata");
  } catch (error) {
    console.error("Delete wishlist photo error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.post("/motos", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    let wishlist = await storage.getWishlist(userId);
    if (!wishlist) {
      wishlist = await storage.createOrUpdateWishlist(userId, "");
    }

    const count = await storage.getWishlistMotoCount(wishlist.id);
    if (count >= 5) {
      return sendError(res, 400, "Massimo 5 moto nella wishlist");
    }

    const parsedMoto = addWishlistMotoSchema.safeParse(req.body);
    if (!parsedMoto.success) {
      return sendError(res, 400, parsedMoto.error.issues[0].message);
    }
    const { brand, model, ridingStyle, motorcycleType } = parsedMoto.data;

    const moto = await storage.addWishlistMoto({
      wishlistId: wishlist.id,
      brand: brand ?? null,
      model: model ?? null,
      motorcycleType: motorcycleType ?? null,
      ridingStyle: ridingStyle ?? null,
    });

    const matches: Array<{ bikerNickname: string | undefined; brand: string | null; model: string | null; ridingStyle: string }> = [];
    if (ridingStyle) {
      const bikerMotos = await storage.findMatchingBikerMotos(brand || "", model || "", ridingStyle, motorcycleType || "");
      for (const bikerMoto of bikerMotos) {
        if (bikerMoto.userId === userId) continue;
        if (!bikerMoto.userId) continue;
        const createdMatch = await storage.createMatch({
          bikerId: bikerMoto.userId,
          zavorrinaId: userId,
          bikerMotorcycleId: bikerMoto.id,
          wishlistMotoId: moto.id,
          status: "new",
        });
        if (!createdMatch) continue;
        const bikerUser = await storage.getUser(bikerMoto.userId);
        await storage.createNotification({
          userId: bikerMoto.userId,
          title: "Here Comes Your Chance!!",
          body: `Una zavorrina cerca proprio la tua moto: ${brand} ${model}!`,
          notificationType: "match",
          referenceType: "user",
          referenceId: userId,
        });
        await storage.createNotification({
          userId,
          title: "Here Comes Your Chance!!",
          body: `Un biker ha la moto che cerchi: ${brand} ${model}! (${bikerUser?.nickname || "Biker"})`,
          notificationType: "match",
          referenceType: "user",
          referenceId: bikerMoto.userId,
        });
        await dispatchMatchNotification({
          table: "biker_zavorrina_matches",
          matchId: createdMatch.id,
          userIds: [bikerMoto.userId, userId],
          priority: classifyMatch({}),
        });
        matches.push({ bikerNickname: bikerUser?.nickname, brand: brand ?? null, model: model ?? null, ridingStyle });
      }
    }

    if (brand) {
      const includeZavSetting = await storage.getAppSetting("motoclub_include_zav");
      if (includeZavSetting?.value !== "false") {
        createClubInvitesForMoto(userId, brand, model || "").catch(() => {});
      }
    }

    return res.status(201).json({ moto, matches });
  } catch (error) {
    console.error("Add wishlist moto error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.put("/motos/:motoId", requireAuth, async (req: Request, res: Response) => {
  try {
    const motoId = req.params.motoId as string;
    const userId = req.session.userId as string;

    const existingMoto = await storage.getWishlistMoto(motoId);
    if (!existingMoto) {
      return sendError(res, 404, "Moto non trovata");
    }

    const userWishlist = await storage.getWishlist(userId);
    if (!userWishlist || existingMoto.wishlistId !== userWishlist.id) {
      return sendError(res, 403, "Non autorizzato");
    }

    const parsedMotoUpdate = updateWishlistMotoSchema.safeParse(req.body);
    if (!parsedMotoUpdate.success) {
      return sendError(res, 400, parsedMotoUpdate.error.issues[0].message);
    }
    const { brand, model, ridingStyle, motorcycleType } = parsedMotoUpdate.data;
    const moto = await storage.updateWishlistMoto(motoId, { brand, model, ridingStyle, motorcycleType });
    return res.json(moto);
  } catch (error) {
    console.error("Update wishlist moto error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.delete("/motos/:motoId", requireAuth, async (req: Request, res: Response) => {
  try {
    const motoId = req.params.motoId as string;
    const userId = req.session.userId as string;

    const existingMoto = await storage.getWishlistMoto(motoId);
    if (!existingMoto) {
      return sendError(res, 404, "Moto non trovata");
    }

    const userWishlist = await storage.getWishlist(userId);
    if (!userWishlist || existingMoto.wishlistId !== userWishlist.id) {
      return sendError(res, 403, "Non autorizzato");
    }

    await storage.deleteWishlistMoto(motoId);
    return sendSuccess(res, undefined, "Moto eliminata dalla wishlist");
  } catch (error) {
    console.error("Delete wishlist moto error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

export default router;
