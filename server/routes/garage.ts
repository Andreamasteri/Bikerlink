import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { storage } from "../storage";

export const garageRouter = Router();

garageRouter.get("/", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const motorcycles = await storage.getUserMotorcycles(user.id);
    res.json({ motorcycles });
  } catch (err) {
    res.status(500).json({ message: "Errore nel caricamento garage" });
  }
});

garageRouter.post("/", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    if (user.userType === "zavorrina") {
      return res.status(403).json({ message: "Solo biker e coppie possono aggiungere moto" });
    }
    const { name, motorcycleType, ridingStyle, isDefault } = req.body;
    if (!name || !motorcycleType || !ridingStyle) {
      return res.status(400).json({ message: "Nome, tipo moto e stile guida obbligatori" });
    }
    const moto = await storage.addMotorcycle(user.id, { name, motorcycleType, ridingStyle, isDefault });
    res.status(201).json({ motorcycle: moto });
  } catch (err) {
    res.status(500).json({ message: "Errore nell'aggiunta moto" });
  }
});

garageRouter.put("/:id", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const { name, motorcycleType, ridingStyle, isDefault } = req.body;
    const moto = await storage.updateMotorcycle(req.params.id, user.id, { name, motorcycleType, ridingStyle, isDefault });
    if (!moto) return res.status(404).json({ message: "Moto non trovata" });
    res.json({ motorcycle: moto });
  } catch (err) {
    res.status(500).json({ message: "Errore nell'aggiornamento moto" });
  }
});

garageRouter.delete("/:id", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    await storage.deleteMotorcycle(req.params.id, user.id);
    res.json({ message: "Moto eliminata" });
  } catch (err) {
    res.status(500).json({ message: "Errore nell'eliminazione moto" });
  }
});
