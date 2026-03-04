import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { storage } from "../storage";

export const proximityRouter = Router();

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

proximityRouter.post("/check", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const { latitude, longitude } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({ message: "Coordinate mancanti" });
    }

    await storage.closeExpiredSessions(15);

    const usersWithLocation = await storage.getUsersWithRecentLocation(30);

    const nearbyUsers = usersWithLocation.filter((u) => {
      if (u.user.id === user.id) return false;
      if (!u.profile.lastLatitude || !u.profile.lastLongitude) return false;
      const dist = haversineMeters(
        latitude,
        longitude,
        Number(u.profile.lastLatitude),
        Number(u.profile.lastLongitude)
      );
      return dist <= 100;
    });

    let pairsRegistered = 0;
    let sessionsCreated = 0;

    for (const nearby of nearbyUsers) {
      const existingSession = await storage.findActiveSession(user.id, nearby.user.id);

      if (existingSession) {
        await storage.updateProximitySessionLastSeen(existingSession.id);

        const durationMs = Date.now() - new Date(existingSession.startedAt).getTime();
        const durationMinutes = Math.floor(durationMs / 60000);

        if (durationMinutes >= 60) {
          await storage.upsertProximityPair(user.id, nearby.user.id, durationMinutes);
          await storage.closeProximitySession(existingSession.id);
          pairsRegistered++;
        }
      } else {
        await storage.createProximitySession(user.id, nearby.user.id);
        sessionsCreated++;
      }
    }

    res.json({
      message: "Prossimità controllata",
      nearbyCount: nearbyUsers.length,
      sessionsCreated,
      pairsRegistered,
    });
  } catch (err) {
    console.error("Proximity check error:", err);
    res.status(500).json({ message: "Errore nel controllo prossimità" });
  }
});
