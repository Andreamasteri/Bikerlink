import { Router, type Request, type Response } from "express";
import { storage } from "../storage";
import { haversineDistance } from "../geo";

const router = Router();

router.get("/nearby", async (req: Request, res: Response) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Non autenticato" });
    }

    const lat = parseFloat(req.query.lat as string);
    const lng = parseFloat(req.query.lng as string);

    if (isNaN(lat) || isNaN(lng)) {
      return res.status(400).json({ message: "Coordinate non valide" });
    }

    const allEggs = await storage.getEasterEggs(true);
    const collectedEggs = await storage.getCollectedEasterEggs(req.session.userId);
    const collectedIds = new Set(collectedEggs.map((c) => c.easterEggId));

    const nearbyEggs = allEggs
      .map((egg) => {
        const distance = haversineDistance(lat, lng, egg.latitude, egg.longitude);
        return { ...egg, distance, collected: collectedIds.has(egg.id) };
      })
      .filter((egg) => egg.distance <= (egg.radius / 1000))
      .sort((a, b) => a.distance - b.distance);

    return res.json(nearbyEggs);
  } catch (error) {
    console.error("Get nearby easter eggs error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/collected", async (req: Request, res: Response) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Non autenticato" });
    }

    const collected = await storage.getCollectedEasterEggs(req.session.userId);
    return res.json(collected);
  } catch (error) {
    console.error("Get collected easter eggs error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.post("/:id/collect", async (req: Request<{ id: string }>, res: Response) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Non autenticato" });
    }

    const eggId = req.params.id;
    const egg = await storage.getEasterEgg(eggId);
    if (!egg) {
      return res.status(404).json({ message: "Easter egg non trovato" });
    }

    if (!egg.isActive) {
      return res.status(400).json({ message: "Easter egg non attivo" });
    }

    const alreadyCollected = await storage.hasCollectedEasterEgg(eggId, req.session.userId);
    if (alreadyCollected) {
      return res.status(409).json({ message: "Easter egg già raccolto" });
    }

    const collected = await storage.collectEasterEgg({
      easterEggId: eggId,
      userId: req.session.userId,
    });

    const profile = await storage.getUserProfile(req.session.userId);
    const newCount = (profile?.easterEggsCollected || 0) + 1;
    if (profile) {
      await storage.updateUserProfile(req.session.userId, {
        easterEggsCollected: newCount,
      });
    }

    const prizeUnlocked = newCount === 10;
    return res.status(201).json({
      collected,
      message: prizeUnlocked
        ? `Hai sbloccato un premio! Hai raccolto 10 Easter Egg!`
        : `Complimenti! Hai raccolto un premio! Continua così!`,
      points: egg.points,
      prizeUnlocked,
      totalCollected: newCount,
    });
  } catch (error) {
    console.error("Collect easter egg error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});


export default router;
