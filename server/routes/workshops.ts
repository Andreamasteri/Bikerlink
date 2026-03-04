import { Router, type Request, type Response } from "express";
import { storage } from "../storage";

const router = Router();

router.get("/", async (req: Request, res: Response) => {
  try {
    const workshops = await storage.getWorkshops(true);
    return res.json(workshops);
  } catch (error) {
    console.error("Get workshops error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/:id", async (req: Request<{ id: string }>, res: Response) => {
  try {
    const workshop = await storage.getWorkshop(req.params.id);
    if (!workshop) {
      return res.status(404).json({ message: "Officina non trovata" });
    }
    return res.json(workshop);
  } catch (error) {
    console.error("Get workshop error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.post("/:id/contact", async (req: Request<{ id: string }>, res: Response) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Non autenticato" });
    }

    const workshopId = req.params.id;
    const workshop = await storage.getWorkshop(workshopId);
    if (!workshop) {
      return res.status(404).json({ message: "Officina non trovata" });
    }

    const { contactType } = req.body;
    if (!contactType || !["phone", "whatsapp", "email", "website"].includes(contactType)) {
      return res.status(400).json({ message: "Tipo di contatto non valido" });
    }

    const contact = await storage.createWorkshopContact({
      workshopId,
      userId: req.session.userId,
      contactType,
    });

    return res.status(201).json(contact);
  } catch (error) {
    console.error("Workshop contact error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

export default router;
