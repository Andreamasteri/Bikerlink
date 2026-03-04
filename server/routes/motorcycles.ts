import { Router, type Request, type Response } from "express";
import path from "path";
import fs from "fs";
import { storage } from "../storage";

const router = Router();

const uploadsDir = path.join(process.cwd(), "uploads", "motorcycles");
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
    const motorcycles = await storage.getUserMotorcycles(userId);
    const result = await Promise.all(motorcycles.map(async (m) => {
      const photos = await storage.getMotorcyclePhotos(m.id);
      return { ...m, photos };
    }));
    return res.json(result);
  } catch (error) {
    console.error("Get motorcycles error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.post("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;

    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(404).json({ message: "Utente non trovato" });
    }

    if (user.userType !== "biker" && user.userType !== "coppia") {
      return res.status(403).json({ message: "Solo biker e coppie possono aggiungere moto" });
    }

    const { brand, model, year, displacement, motorcycleType, ridingStyle, photoUrl } = req.body;

    if (!brand || !model) {
      return res.status(400).json({ message: "Marca e modello sono obbligatori" });
    }

    const motorcycle = await storage.createUserMotorcycle({
      userId,
      brand,
      model,
      year: year || null,
      displacement: displacement || null,
      motorcycleType: motorcycleType || null,
      ridingStyle: ridingStyle || null,
      photoUrl: photoUrl || null,
    });

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
          referenceType: "match",
          referenceId: wm.id,
        });
        await storage.createNotification({
          userId: wm.userId,
          title: "Here Comes Your Chance!!",
          body: `Un biker ha la moto che cerchi: ${brand} ${model}!`,
          notificationType: "match",
          referenceType: "match",
          referenceId: motorcycle.id,
        });
        matches.push({ zavarrinaNickname: zavarrinaUser?.nickname, brand, model, ridingStyle });
      }
    }

    return res.status(201).json({ motorcycle, matches });
  } catch (error) {
    console.error("Create motorcycle error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.put("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const motoId = req.params.id as string;

    const existing = await storage.getUserMotorcycle(motoId);
    if (!existing) {
      return res.status(404).json({ message: "Moto non trovata" });
    }

    if (existing.userId !== userId) {
      return res.status(403).json({ message: "Non autorizzato" });
    }

    const allowedFields = ["brand", "model", "year", "displacement", "motorcycleType", "ridingStyle", "photoUrl"];
    const updateData: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    }

    const motorcycle = await storage.updateUserMotorcycle(motoId, updateData as any);
    return res.json(motorcycle);
  } catch (error) {
    console.error("Update motorcycle error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.delete("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const motoId = req.params.id as string;

    const existing = await storage.getUserMotorcycle(motoId);
    if (!existing) {
      return res.status(404).json({ message: "Moto non trovata" });
    }

    if (existing.userId !== userId) {
      return res.status(403).json({ message: "Non autorizzato" });
    }

    await storage.deleteUserMotorcycle(motoId);

    return res.json({ message: "Moto eliminata" });
  } catch (error) {
    console.error("Delete motorcycle error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/:id/photos", requireAuth, async (req: Request, res: Response) => {
  try {
    const motoId = req.params.id as string;
    const photos = await storage.getMotorcyclePhotos(motoId);
    return res.json(photos);
  } catch (error) {
    console.error("Get motorcycle photos error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.post("/:id/photos", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const motoId = req.params.id as string;

    const existing = await storage.getUserMotorcycle(motoId);
    if (!existing || existing.userId !== userId) {
      return res.status(403).json({ message: "Non autorizzato" });
    }

    const count = await storage.getMotorcyclePhotoCount(motoId);
    if (count >= 3) {
      return res.status(400).json({ message: "Massimo 3 foto per moto" });
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

    const photoUrl = `/uploads/motorcycles/${uniqueName}`;
    const photo = await storage.addMotorcyclePhoto({
      motorcycleId: motoId,
      photoUrl,
      sortOrder: count,
    });

    return res.status(201).json(photo);
  } catch (error) {
    console.error("Upload motorcycle photo error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.delete("/:id/photos/:photoId", requireAuth, async (req: Request, res: Response) => {
  try {
    const photoId = req.params.photoId as string;
    await storage.deleteMotorcyclePhoto(photoId);
    return res.json({ message: "Foto eliminata" });
  } catch (error) {
    console.error("Delete motorcycle photo error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

export default router;
