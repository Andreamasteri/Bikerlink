/**
 * discovery.next.ts — file successore di discovery.ts
 *
 * Contiene handler spostati da discovery.ts per tenere il file principale
 * sotto la soglia di 450 righe.
 *
 * Convenzione di utilizzo:
 *   - Aggiungere qui SOLO codice nuovo (non spostare codice esistente da discovery.ts).
 *   - Esportare dal file e importare in discovery.ts (o nel router principale) quanto necessario.
 */

import { sendError } from "../../lib/api-response";
import { Router, type Request, type Response } from "express";
import { storage } from "../../storage";
import { onlineTracker } from "../../online-tracker";
import { fuzzedCoordsForViewer } from "../users";

import { requireAuth } from "../../lib/auth-middleware";

const router = Router();

router.get("/search", requireAuth, async (req: Request, res: Response) => {
  try {
    const requesterId = req.session.userId!;
    const q = (req.query.q as string || "").trim();
    if (q.length < 2) {
      return res.json([]);
    }

    const [blockedIds, mapFilterSetting] = await Promise.all([
      storage.getBlockedUserIds(requesterId),
      storage.getAppSetting("map_visibility_filter"),
    ]);
    const blockedSet = new Set(blockedIds);
    const mapVisibilityFilter = (mapFilterSetting?.value as "all" | "online_only" | "available_only") || "all";
    const onlineIdSet = mapVisibilityFilter !== "all" ? new Set(onlineTracker.getOnlineUserIds()) : null;
    const availableIdSet = mapVisibilityFilter === "available_only"
      ? new Set([...onlineTracker.getAvailableBikerIds(), ...onlineTracker.getAvailableZavorrinaIds()])
      : null;

    const results = await storage.searchUsers(q);
    const safeResults = results
      .filter((item) => !blockedSet.has(item.user.id))
      .filter((item) => {
        if (mapVisibilityFilter === "online_only") return onlineIdSet!.has(item.user.id);
        if (mapVisibilityFilter === "available_only") return availableIdSet!.has(item.user.id);
        return true;
      })
      .map((item) => {
        const isOnlineSearch = onlineIdSet ? onlineIdSet.has(item.user.id) : onlineTracker.isOnline(item.user.id);
        return {
          id: item.user.id,
          nickname: item.user.nickname,
          userType: item.user.userType,
          sex: item.user.sex,
          birthYear: item.user.birthYear,
          region: item.user.region,
          country: item.user.country,
          avatarUrl: item.user.avatarUrl,
          ...(() => {
            if (item.profile?.hideFromMap || item.user.ghostMode) return { latitude: null, longitude: null };
            const fc = fuzzedCoordsForViewer(item.profile?.latitude, item.profile?.longitude, item.profile, item.user.id === requesterId);
            return { latitude: fc.latitude, longitude: fc.longitude };
          })(),
          isAvailable: (item.profile?.isAvailable || false) && isOnlineSearch,
          bio: item.profile?.bio || null,
        };
      });
    return res.json(safeResults);
  } catch (error) {
    console.error("Search users error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

export default router;
