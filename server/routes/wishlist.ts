import { Router, type Request, type Response } from "express";
import path from "path";
import fs from "fs";
import { storage } from "../storage";
import { createClubInvitesForMoto } from "./motoclubs";
import { sendMatchPushNotifications } from "../push-notifications";

const router = Router();

const uploadsDir = path.join(process.cwd(), "uploads", "wishlist");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

function requireAuth(req: Request, res: Response, next: () => void) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Non autenticato" });
  }
  next();
}

router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const user = await storage.getUser(userId);
    if (!user || user.userType !== "zavorrina") {
      return res.status(403).json({ message: "Solo le zavorrine possono accedere alla wishlist" });
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
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.put("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const { description } = req.body;
    const wishlist = await storage.createOrUpdateWishlist(userId, description || "");
    return res.json(wishlist);
  } catch (error) {
    console.error("Update wishlist error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
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
      return res.status(400).json({ message: "Massimo 3 foto permesse" });
    }

    const { imageBase64, filename } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ message: "Nessuna immagine fornita" });
    }

    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const ext = (filename || "photo.jpg").split(".").pop() || "jpg";
    const uniqueName = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${ext}`;
    const filePath = path.join(uploadsDir, uniqueName);
    fs.writeFileSync(filePath, Buffer.from(base64Data, "base64"));

    const photoUrl = `/uploads/wishlist/${uniqueName}`;
    const photo = await storage.addWishlistPhoto({
      wishlistId: wishlist.id,
      photoUrl,
      sortOrder: count,
    });

    return res.status(201).json(photo);
  } catch (error) {
    console.error("Upload wishlist photo error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.delete("/photos/:photoId", requireAuth, async (req: Request, res: Response) => {
  try {
    const photoId = req.params.photoId as string;
    await storage.deleteWishlistPhoto(photoId);
    return res.json({ message: "Foto eliminata" });
  } catch (error) {
    console.error("Delete wishlist photo error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
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
      return res.status(400).json({ message: "Massimo 5 moto nella wishlist" });
    }

    const { brand, model, ridingStyle, motorcycleType } = req.body;
    if (!brand && !model && !motorcycleType) {
      return res.status(400).json({ message: "Specifica marca e modello oppure tipo moto" });
    }

    const moto = await storage.addWishlistMoto({
      wishlistId: wishlist.id,
      brand: brand || null,
      model: model || null,
      motorcycleType: motorcycleType || null,
      ridingStyle: ridingStyle || null,
    });

    let matches: any[] = [];
    if (ridingStyle) {
      const bikerMotos = await storage.findMatchingBikerMotos(brand || "", model || "", ridingStyle, motorcycleType || "");
      for (const bikerMoto of bikerMotos) {
        if (bikerMoto.userId === userId) continue;
        await storage.createMatch({
          bikerId: bikerMoto.userId,
          zavarrinaId: userId,
          bikerMotorcycleId: bikerMoto.id,
          wishlistMotoId: moto.id,
          status: "new",
        });
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
        sendMatchPushNotifications([bikerMoto.userId, userId]);
        matches.push({ bikerNickname: bikerUser?.nickname, brand, model, ridingStyle });
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
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.put("/motos/:motoId", requireAuth, async (req: Request, res: Response) => {
  try {
    const motoId = req.params.motoId as string;
    const userId = req.session.userId as string;

    const existingMoto = await storage.getWishlistMoto(motoId);
    if (!existingMoto) {
      return res.status(404).json({ message: "Moto non trovata" });
    }

    const userWishlist = await storage.getWishlist(userId);
    if (!userWishlist || existingMoto.wishlistId !== userWishlist.id) {
      return res.status(403).json({ message: "Non autorizzato" });
    }

    const { brand, model, ridingStyle, motorcycleType } = req.body;
    const moto = await storage.updateWishlistMoto(motoId, { brand, model, ridingStyle, motorcycleType });
    return res.json(moto);
  } catch (error) {
    console.error("Update wishlist moto error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.delete("/motos/:motoId", requireAuth, async (req: Request, res: Response) => {
  try {
    const motoId = req.params.motoId as string;
    const userId = req.session.userId as string;

    const existingMoto = await storage.getWishlistMoto(motoId);
    if (!existingMoto) {
      return res.status(404).json({ message: "Moto non trovata" });
    }

    const userWishlist = await storage.getWishlist(userId);
    if (!userWishlist || existingMoto.wishlistId !== userWishlist.id) {
      return res.status(403).json({ message: "Non autorizzato" });
    }

    await storage.deleteWishlistMoto(motoId);
    return res.json({ message: "Moto eliminata dalla wishlist" });
  } catch (error) {
    console.error("Delete wishlist moto error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

export default router;
