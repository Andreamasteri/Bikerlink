import { Router } from "express";
import { requireAuth, requireModerator } from "../middleware/auth";
import { storage } from "../storage";

export const moderatorRouter = Router();

moderatorRouter.get("/photos", requireAuth, requireModerator, async (req, res) => {
  try {
    const photos = await storage.getContestPhotosForModeration();
    res.json({
      photos: photos.map(p => ({
        ...p.entry,
        user: { ...p.user, passwordHash: undefined },
        reportCount: p.reportCount,
      })),
    });
  } catch (err) {
    res.status(500).json({ message: "Errore nel caricamento foto" });
  }
});

moderatorRouter.delete("/photos/:id", requireAuth, requireModerator, async (req, res) => {
  try {
    const moderator = (req as any).user;
    await storage.removeContestPhoto(req.params.id);

    await storage.createModeratorLog({
      moderatorId: moderator.id,
      action: "remove_photo",
      targetType: "photo",
      targetId: req.params.id,
      details: req.body.reason || "Foto rimossa dal moderatore",
    });

    res.json({ message: "Foto rimossa" });
  } catch (err) {
    res.status(500).json({ message: "Errore nella rimozione foto" });
  }
});

moderatorRouter.post("/photos/:id/warn", requireAuth, requireModerator, async (req, res) => {
  try {
    const moderator = (req as any).user;
    const { reason } = req.body;

    await storage.createModeratorLog({
      moderatorId: moderator.id,
      action: "warn_user",
      targetType: "photo",
      targetId: req.params.id,
      details: reason || "Avvertimento per foto inappropriata",
    });

    res.json({ message: "Avvertimento inviato" });
  } catch (err) {
    res.status(500).json({ message: "Errore nell'invio avvertimento" });
  }
});
