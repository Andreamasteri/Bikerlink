import { sendError } from "../lib/api-response";
import { Router, type Request, type Response } from "express";
import { storage } from "../storage";

const router = Router();

router.get("/", async (req: Request, res: Response) => {
  try {
    const workshops = await storage.getWorkshops(true);
    return res.json(workshops);
  } catch (error) {
    console.error("Get workshops error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.get("/:id", async (req: Request<{ id: string }>, res: Response) => {
  try {
    const workshop = await storage.getWorkshop(req.params.id);
    if (!workshop) {
      return sendError(res, 404, "Officina non trovata");
    }
    return res.json(workshop);
  } catch (error) {
    console.error("Get workshop error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.post("/:id/contact", async (req: Request<{ id: string }>, res: Response) => {
  try {
    if (!req.session.userId) {
      return sendError(res, 401, "Non autenticato");
    }

    const workshopId = req.params.id;
    const workshop = await storage.getWorkshop(workshopId);
    if (!workshop) {
      return sendError(res, 404, "Officina non trovata");
    }

    const { contactType } = req.body;
    if (!contactType || !["phone", "whatsapp", "email", "website"].includes(contactType)) {
      return sendError(res, 400, "Tipo di contatto non valido");
    }

    const contact = await storage.createWorkshopContact({
      workshopId,
      userId: req.session.userId,
      contactType,
    });

    return res.status(201).json(contact);
  } catch (error) {
    console.error("Workshop contact error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

export default router;
