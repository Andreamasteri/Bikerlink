import { Router, type Request, type Response } from "express";
import { storage } from "../storage";

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
    if (profile) {
      await storage.updateUserProfile(req.session.userId, {
        easterEggsCollected: (profile.easterEggsCollected || 0) + 1,
      });
    }

    return res.status(201).json({
      collected,
      message: `Complimenti! Hai raccolto "${egg.name}" e guadagnato ${egg.points} punti!`,
      points: egg.points,
    });
  } catch (error) {
    console.error("Collect easter egg error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}

export default router;
