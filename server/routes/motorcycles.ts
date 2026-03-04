import { Router, type Request, type Response } from "express";
import { storage } from "../storage";

const router = Router();

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
    return res.json(motorcycles);
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

    return res.status(201).json(motorcycle);
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

export default router;
