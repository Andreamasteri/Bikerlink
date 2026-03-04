import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { storage } from "../storage";

export const adsRouter = Router();

adsRouter.get("/", requireAuth, async (req, res) => {
  try {
    const { displayMode } = req.query;
    const ads = await storage.getActiveAds(displayMode as string);

    for (const ad of ads) {
      await storage.incrementAdImpression(ad.id);
    }

    res.json({ ads });
  } catch (err) {
    res.status(500).json({ message: "Errore nel caricamento annunci" });
  }
});

adsRouter.post("/:id/click", requireAuth, async (req, res) => {
  try {
    await storage.incrementAdClick(req.params.id);
    res.json({ message: "Click registrato" });
  } catch (err) {
    res.status(500).json({ message: "Errore nella registrazione click" });
  }
});
