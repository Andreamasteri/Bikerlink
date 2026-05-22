import { Router, type Request, type Response } from "express";
import path from "path";
import fs from "fs";
import { and, ne, eq } from "drizzle-orm";
import { db } from "../db";
import { userMotorcycles } from "@shared/db";
import { createMotorcycleSchema, updateMotorcycleSchema, uploadPhotoSchema } from "@shared/validators";
import { storage } from "../storage";
import { createClubInvitesForMoto } from "./motoclubs";
import { sendMatchPushNotifications } from "../push-notifications";
import { sendSuccess, sendError } from "../lib/api-response";

import { requireAuth } from "../lib/auth-middleware";

const router = Router();

const uploadsDir = path.join(process.cwd(), "uploads", "motorcycles");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const motorcycles = await storage.getUserMotorcycles(userId);
    const result = await Promise.all(motorcycles.map(async (m) => {
      const photos = await storage.getMotorcyclePhotos(m.id);
      return { ...m, photos };
    }));
    return res.json(result);
  } catch (error) {
    console.error("Get motorcycles error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.post("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;

    const user = await storage.getUser(userId);
    if (!user) {
      return sendError(res, 404, "Utente non trovato");
    }

    if (user.userType !== "biker" && user.userType !== "coppia" && user.userType !== "admin") {
      return sendError(res, 403, "Solo biker, coppie e admin possono aggiungere moto");
    }

    const parsed = createMotorcycleSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 400, parsed.error.issues[0].message);
    }
    const { brand, model, year, displacement, motorcycleType, ridingStyle, photoUrl, isForSale, saleDescription, isDefault, motoDescription } = parsed.data;

    const isDefaultBool = isDefault === true;

    const motorcycle = await storage.createUserMotorcycle({
      userId,
      brand,
      model,
      year: year ?? null,
      displacement: displacement ?? null,
      motorcycleType: motorcycleType ?? null,
      ridingStyle: ridingStyle ?? null,
      photoUrl: photoUrl ?? null,
      isDefault: isDefaultBool,
      isForSale: isForSale ?? false,
      saleDescription: saleDescription ?? null,
      motoDescription: motoDescription ?? null,
    });

    if (isDefaultBool) {
      await db
        .update(userMotorcycles)
        .set({ isDefault: false })
        .where(and(eq(userMotorcycles.userId, userId), ne(userMotorcycles.id, motorcycle.id)));
    }

    let matches: any[] = [];
    if (ridingStyle) {
      const wishlistMotos = await storage.findMatchingWishlistMotos(brand || "", model || "", ridingStyle, motorcycleType || "");
      for (const wm of wishlistMotos) {
        if (wm.userId === userId) continue;
        await storage.createMatch({
          bikerId: userId,
          zavarrinaId: wm.userId,
          bikerMotorcycleId: motorcycle.id,
          wishlistMotoId: wm.id,
          status: "new",
        });
        const zavarrinaUser = await storage.getUser(wm.userId);
        await storage.createNotification({
          userId,
          title: "Here Comes Your Chance!!",
          body: `Una zavorrina cerca proprio la tua moto: ${brand} ${model}! (${zavarrinaUser?.nickname || "Zavorrina"})`,
          notificationType: "match",
          referenceType: "user",
          referenceId: wm.userId,
        });
        await storage.createNotification({
          userId: wm.userId,
          title: "Here Comes Your Chance!!",
          body: `Un biker ha la moto che cerchi: ${brand} ${model}!`,
          notificationType: "match",
          referenceType: "user",
          referenceId: userId,
        });
        sendMatchPushNotifications([userId, wm.userId]);
        matches.push({ zavarrinaNickname: zavarrinaUser?.nickname, brand, model, ridingStyle });
      }
    }

    if (brand) {
      createClubInvitesForMoto(userId, brand, model || "").catch((e) => console.error("[auto-join brand error]", e));
    }

    return res.status(201).json({ motorcycle, matches });
  } catch (error) {
    console.error("Create motorcycle error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.put("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const motoId = req.params.id as string;

    const existing = await storage.getUserMotorcycle(motoId);
    if (!existing) {
      return sendError(res, 404, "Moto non trovata");
    }

    if (existing.userId !== userId) {
      return sendError(res, 403, "Non autorizzato");
    }

    const parsedUpdate = updateMotorcycleSchema.safeParse(req.body);
    if (!parsedUpdate.success) {
      return sendError(res, 400, parsedUpdate.error.issues[0].message);
    }
    const b = parsedUpdate.data;
    const updateData: Record<string, unknown> = {};
    if (b.brand !== undefined) updateData.brand = b.brand;
    if (b.model !== undefined) updateData.model = b.model;
    if (b.year !== undefined) updateData.year = b.year;
    if (b.displacement !== undefined) updateData.displacement = b.displacement;
    if (b.motorcycleType !== undefined) updateData.motorcycleType = b.motorcycleType;
    if (b.ridingStyle !== undefined) updateData.ridingStyle = b.ridingStyle;
    if (b.photoUrl !== undefined) updateData.photoUrl = b.photoUrl;
    if (b.isForSale !== undefined) updateData.isForSale = b.isForSale;
    if (b.saleDescription !== undefined) updateData.saleDescription = b.saleDescription;
    if (b.isDefault !== undefined) updateData.isDefault = b.isDefault;
    if (b.motoDescription !== undefined) updateData.motoDescription = b.motoDescription;

    if (updateData.isDefault === true) {
      await db
        .update(userMotorcycles)
        .set({ isDefault: false })
        .where(and(eq(userMotorcycles.userId, userId), ne(userMotorcycles.id, motoId)));
    }

    const motorcycle = await storage.updateUserMotorcycle(motoId, updateData as any);
    return res.json(motorcycle);
  } catch (error) {
    console.error("Update motorcycle error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.delete("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const motoId = req.params.id as string;

    const existing = await storage.getUserMotorcycle(motoId);
    if (!existing) {
      return sendError(res, 404, "Moto non trovata");
    }

    if (existing.userId !== userId) {
      return sendError(res, 403, "Non autorizzato");
    }

    await storage.deleteUserMotorcycle(motoId);

    return sendSuccess(res, undefined, "Moto eliminata");
  } catch (error) {
    console.error("Delete motorcycle error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.get("/:id/photos", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const motoId = req.params.id as string;

    // SECURITY (Task #1080): solo il proprietario della moto puo' elencare le
    // foto del suo garage. La logica precedente esponeva l'intero record-set
    // a qualsiasi utente autenticato che indovinasse / leggesse l'ID della
    // moto (recuperabile via /api/users/:id/public.motorcycles), permettendo
    // enumerazione di URL pubblici stabili e dell'ID-foto necessario per la
    // cancellazione (vedi DELETE qui sotto). 404 anziche' 403 per evitare
    // di confermare l'esistenza di moto altrui.
    const moto = await storage.getUserMotorcycle(motoId);
    if (!moto || moto.userId !== userId) {
      return sendError(res, 404, "Moto non trovata");
    }

    const photos = await storage.getMotorcyclePhotos(motoId);
    return res.json(photos);
  } catch (error) {
    console.error("Get motorcycle photos error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.post("/:id/photos", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const motoId = req.params.id as string;

    const existing = await storage.getUserMotorcycle(motoId);
    if (!existing || existing.userId !== userId) {
      return sendError(res, 403, "Non autorizzato");
    }

    const count = await storage.getMotorcyclePhotoCount(motoId);
    if (count >= 3) {
      return sendError(res, 400, "Massimo 3 foto per moto");
    }

    const parsedPhoto = uploadPhotoSchema.safeParse(req.body);
    if (!parsedPhoto.success) {
      return sendError(res, 400, parsedPhoto.error.issues[0].message);
    }
    const { imageBase64 } = parsedPhoto.data;

    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const rawBuffer = Buffer.from(base64Data, "base64");
    const { compressToWebP } = await import("../utils/image-processing");
    const webpBuffer = await compressToWebP(rawBuffer);
    const uniqueName = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}.webp`;
    const filePath = path.join(uploadsDir, uniqueName);
    fs.writeFileSync(filePath, webpBuffer);

    const photoUrl = `/uploads/motorcycles/${uniqueName}`;
    const photo = await storage.addMotorcyclePhoto({
      motorcycleId: motoId,
      photoUrl,
      sortOrder: count,
    });

    return res.status(201).json(photo);
  } catch (error) {
    console.error("Upload motorcycle photo error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.delete("/:id/photos/:photoId", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const motoId = req.params.id as string;
    const photoId = req.params.photoId as string;

    // SECURITY (Task #1080): verifica integrita' / ownership prima della
    // delete. La logica precedente accettava solo `requireAuth` e cancellava
    // qualunque photoId, anche di moto altrui — vandalismo cross-utente.
    // Defense in depth: 1) la foto deve esistere, 2) deve appartenere alla
    // moto in :id (impedisce mismatch URL-vs-photo), 3) la moto deve essere
    // di proprieta' del richiedente.
    const photo = await storage.getMotorcyclePhoto(photoId);
    if (!photo || photo.motorcycleId !== motoId) {
      return sendError(res, 404, "Foto non trovata");
    }
    const moto = await storage.getUserMotorcycle(motoId);
    if (!moto || moto.userId !== userId) {
      return sendError(res, 404, "Foto non trovata");
    }

    await storage.deleteMotorcyclePhoto(photoId);
    return sendSuccess(res, undefined, "Foto eliminata");
  } catch (error) {
    console.error("Delete motorcycle photo error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

export default router;
