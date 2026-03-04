import { Router, type Request, type Response } from "express";
import { storage } from "../storage";

const router = Router();

function requireAuth(req: Request, res: Response): string | null {
  if (!req.session.userId) {
    res.status(401).json({ message: "Non autenticato" });
    return null;
  }
  return req.session.userId;
}

async function requireModerator(req: Request, res: Response): Promise<string | null> {
  const userId = requireAuth(req, res);
  if (!userId) return null;

  const user = await storage.getUser(userId);
  if (!user || (user.role !== "admin" && user.role !== "moderator")) {
    res.status(403).json({ message: "Accesso non autorizzato" });
    return null;
  }
  return userId;
}

router.get("/photos", async (req: Request, res: Response) => {
  try {
    const userId = await requireModerator(req, res);
    if (!userId) return;

    const userPhotos = await storage.getUnapprovedUserPhotos();
    const contestEntries = await storage.getUnapprovedContestEntries();

    const photos = [
      ...userPhotos.map((p) => ({
        id: p.id,
        type: "user_photo" as const,
        photoUrl: p.photoUrl,
        userId: p.userId,
        createdAt: p.createdAt,
        isApproved: p.isApproved,
      })),
      ...contestEntries.map((e) => ({
        id: e.id,
        type: "contest_entry" as const,
        photoUrl: e.photoUrl,
        userId: e.userId,
        caption: e.caption,
        createdAt: e.createdAt,
        isApproved: e.isApproved,
      })),
    ].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    return res.json(photos);
  } catch (error) {
    console.error("Get moderator photos error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.put("/photos/:id/approve", async (req: Request, res: Response) => {
  try {
    const moderatorId = await requireModerator(req, res);
    if (!moderatorId) return;

    const id = req.params.id as string;
    const photoType = (req.body.type as string) || "user_photo";

    let result;
    if (photoType === "contest_entry") {
      result = await storage.updateContestEntryApproval(id, true);
    } else {
      result = await storage.updateUserPhotoApproval(id, true);
    }

    if (!result) {
      return res.status(404).json({ message: "Foto non trovata" });
    }

    await storage.createModeratorLog({
      moderatorId,
      action: "approve_photo",
      targetType: photoType,
      targetId: id,
      details: "Foto approvata",
    });

    return res.json(result);
  } catch (error) {
    console.error("Approve photo error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.put("/photos/:id/reject", async (req: Request, res: Response) => {
  try {
    const moderatorId = await requireModerator(req, res);
    if (!moderatorId) return;

    const id = req.params.id as string;
    const photoType = (req.body.type as string) || "user_photo";
    const reason = req.body.reason as string | undefined;

    if (photoType === "contest_entry") {
      const entry = await storage.getPhotoContestEntry(id);
      if (!entry) {
        return res.status(404).json({ message: "Foto non trovata" });
      }
      await storage.updateContestEntryApproval(id, false);
    } else {
      const photo = await storage.getUserPhoto(id);
      if (!photo) {
        return res.status(404).json({ message: "Foto non trovata" });
      }
      await storage.deleteUserPhoto(id);
    }

    await storage.createModeratorLog({
      moderatorId,
      action: "reject_photo",
      targetType: photoType,
      targetId: id,
      details: reason ? `Foto rifiutata: ${reason}` : "Foto rifiutata",
    });

    return res.json({ message: "Foto rifiutata" });
  } catch (error) {
    console.error("Reject photo error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/logs", async (req: Request, res: Response) => {
  try {
    const userId = await requireModerator(req, res);
    if (!userId) return;

    const logs = await storage.getModeratorLogs();
    return res.json(logs);
  } catch (error) {
    console.error("Get moderator logs error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

export default router;
