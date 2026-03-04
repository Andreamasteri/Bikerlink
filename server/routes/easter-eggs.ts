import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { storage } from "../storage";

export const easterEggsRouter = Router();

easterEggsRouter.get("/nearby", requireAuth, async (req, res) => {
  try {
    const { lat, lng } = req.query;
    if (!lat || !lng) {
      return res.status(400).json({ message: "Posizione obbligatoria" });
    }

    const userLat = Number(lat);
    const userLng = Number(lng);
    const eggs = await storage.getActiveEasterEggs();
    const userId = (req as any).user.id;
    const collected = await storage.getUserCollectedEasterEggs(userId);
    const collectedIds = new Set(collected.map(c => c.collected.easterEggId));

    const nearby = eggs
      .filter(egg => {
        const distance = haversineMeters(userLat, userLng, egg.lat, egg.lng);
        return distance <= (egg.radius * 3);
      })
      .map(egg => ({
        ...egg,
        isCollected: collectedIds.has(egg.id),
        distance: Math.round(haversineMeters(userLat, userLng, egg.lat, egg.lng)),
      }));

    res.json({ easterEggs: nearby });
  } catch (err) {
    res.status(500).json({ message: "Errore nel caricamento easter eggs" });
  }
});

easterEggsRouter.post("/:id/collect", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const eggId = req.params.id;
    const lat = req.body?.lat ?? (req.query.lat ? Number(req.query.lat) : undefined);
    const lng = req.body?.lng ?? (req.query.lng ? Number(req.query.lng) : undefined);

    const egg = await storage.getEasterEgg(eggId);
    if (!egg) return res.status(404).json({ message: "Easter egg non trovato" });
    if (!egg.isActive) return res.status(400).json({ message: "Easter egg non attivo" });

    if (lat !== undefined && lng !== undefined) {
      const distance = haversineMeters(lat, lng, egg.lat, egg.lng);
      if (distance > egg.radius) {
        return res.status(400).json({ message: "Sei troppo lontano per raccogliere questo easter egg" });
      }
    }

    const collected = await storage.collectEasterEgg(eggId, user.id);
    if (!collected) {
      return res.status(409).json({ message: "Hai già collezionato questo easter egg" });
    }

    await storage.createNotification({
      userId: user.id,
      title: "Easter Egg Collezionato!",
      body: `Complimenti! Hai collezionato "${egg.name}"!`,
      type: "easter_egg",
      relatedId: eggId,
    });

    res.json({
      collected,
      easterEgg: egg,
      message: `Complimenti! Hai collezionato "${egg.name}"!`,
    });
  } catch (err: any) {
    console.error("Errore raccolta easter egg:", err?.message || err);
    res.status(500).json({ message: "Errore nella raccolta easter egg" });
  }
});

easterEggsRouter.get("/collection", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const collection = await storage.getUserCollectedEasterEggs(user.id);
    res.json({
      collection: collection.map(c => ({
        ...c.collected,
        easterEgg: c.easterEgg,
      })),
    });
  } catch (err) {
    res.status(500).json({ message: "Errore nel caricamento collezione" });
  }
});

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
