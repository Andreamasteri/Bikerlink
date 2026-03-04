import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { storage } from "../storage";

export const workshopsRouter = Router();

workshopsRouter.get("/", requireAuth, async (req, res) => {
  try {
    const workshops = await storage.getApprovedWorkshops();
    res.json({ workshops });
  } catch (err) {
    res.status(500).json({ message: "Errore nel caricamento officine" });
  }
});

workshopsRouter.get("/:id", requireAuth, async (req, res) => {
  try {
    const ws = await storage.getWorkshop(req.params.id);
    if (!ws) return res.status(404).json({ message: "Officina non trovata" });
    res.json({ workshop: ws });
  } catch (err) {
    res.status(500).json({ message: "Errore nel caricamento officina" });
  }
});

workshopsRouter.post("/register", requireAuth, async (req, res) => {
  try {
    const { name, address, lat, lng, phone, whatsappNumber, openingHours, type, qrCode } = req.body;

    if (!name || !address || !lat || !lng || !type) {
      return res.status(400).json({ message: "Dati obbligatori mancanti" });
    }

    const ws = await storage.createWorkshop({
      name,
      address,
      lat,
      lng,
      phone,
      whatsappNumber,
      openingHours,
      type,
      qrCode,
    } as any);

    res.status(201).json({ workshop: ws, message: "Richiesta inviata. In attesa di approvazione." });
  } catch (err) {
    res.status(500).json({ message: "Errore nella registrazione officina" });
  }
});

workshopsRouter.post("/:id/contact", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const { contactType } = req.body;
    await storage.logWorkshopContact(req.params.id, user.id, contactType || "view");
    res.json({ message: "Contatto registrato" });
  } catch (err) {
    res.status(500).json({ message: "Errore nella registrazione contatto" });
  }
});
