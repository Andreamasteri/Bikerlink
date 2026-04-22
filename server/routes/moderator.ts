import { Router, type Request, type Response } from "express";
import multer from "multer";
import path from "path";
import { storage } from "../storage";
import { uploadBuffer } from "../objectStorage";

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

async function uploadAdImage(buffer: Buffer, originalname: string, mimetype: string): Promise<string> {
  const uniqueSuffix = Date.now().toString() + "-" + Math.random().toString(36).substr(2, 9);
  const filename = uniqueSuffix + path.extname(originalname);
  const objectPath = `public/ads/${filename}`;
  await uploadBuffer(objectPath, buffer, mimetype);
  return `/api/ads/images/${filename}`;
}

const adUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Solo immagini"));
  },
});

router.get("/advertisements", async (req: Request, res: Response) => {
  try {
    const userId = await requireModerator(req, res);
    if (!userId) return;
    const campaigns = await storage.getAllCampaigns();
    return res.json(campaigns);
  } catch (error) {
    console.error("Moderator get campaigns error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.post("/advertisements", adUpload.single("image"), async (req: Request, res: Response) => {
  try {
    const moderatorId = await requireModerator(req, res);
    if (!moderatorId) return;
    const { name, sponsor, linkUrl, description, targetUserType, rotationDuration, rotationMode, sortOrder, startDate, endDate, placement } = req.body;
    if (!name) {
      return res.status(400).json({ message: "Nome campagna obbligatorio" });
    }
    const imageUrl = req.file ? await uploadAdImage(req.file.buffer, req.file.originalname, req.file.mimetype) : (req.body.imageUrl || null);
    const campaign = await storage.createAdCampaign({
      name,
      sponsor: sponsor || "Syneco Lubrificanti",
      imageUrl,
      linkUrl: linkUrl || null,
      displayMode: "banner",
      description: description || null,
      targetUserType: targetUserType || "biker",
      rotationDuration: rotationDuration ? parseInt(rotationDuration) : 10,
      rotationMode: rotationMode || "sequential",
      sortOrder: sortOrder ? parseInt(sortOrder) : 0,
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      placement: placement || "all",
    });
    await storage.createModeratorLog({
      moderatorId,
      action: "create_advertisement",
      targetType: "campaign",
      targetId: campaign.id,
      details: `Campagna creata dal moderatore: ${campaign.name} (${targetUserType || "biker"})`,
    });
    return res.status(201).json(campaign);
  } catch (error) {
    console.error("Moderator create campaign error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.put("/advertisements/:id", adUpload.single("image"), async (req: Request, res: Response) => {
  try {
    const moderatorId = await requireModerator(req, res);
    if (!moderatorId) return;
    const id = req.params.id as string;
    const updates: any = {};
    if (req.body.name !== undefined) updates.name = req.body.name;
    if (req.body.sponsor !== undefined) updates.sponsor = req.body.sponsor;
    if (req.body.linkUrl !== undefined) updates.linkUrl = req.body.linkUrl;
    if (req.body.description !== undefined) updates.description = req.body.description;
    if (req.body.isActive !== undefined) updates.isActive = req.body.isActive === true || req.body.isActive === "true";
    if (req.body.targetUserType !== undefined) updates.targetUserType = req.body.targetUserType;
    if (req.body.rotationDuration !== undefined) updates.rotationDuration = parseInt(req.body.rotationDuration);
    if (req.body.rotationMode !== undefined) updates.rotationMode = req.body.rotationMode;
    if (req.body.sortOrder !== undefined) updates.sortOrder = parseInt(req.body.sortOrder);
    if (req.body.placement !== undefined) updates.placement = req.body.placement;
    if (req.file) {
      updates.imageUrl = await uploadAdImage(req.file.buffer, req.file.originalname, req.file.mimetype);
      const existing = await storage.getAdCampaign(id);
      updates.imageVersion = ((existing?.imageVersion ?? 0) + 1);
    } else if (req.body.imageUrl !== undefined) {
      updates.imageUrl = req.body.imageUrl;
    }
    if (req.body.bumpImageVersion === true || req.body.bumpImageVersion === "true") {
      const existing = await storage.getAdCampaign(id);
      updates.imageVersion = ((existing?.imageVersion ?? 0) + 1);
    }
    const campaign = await storage.updateAdCampaign(id, updates);
    if (!campaign) {
      return res.status(404).json({ message: "Campagna non trovata" });
    }
    await storage.createModeratorLog({
      moderatorId,
      action: "update_advertisement",
      targetType: "campaign",
      targetId: id,
      details: `Campagna aggiornata dal moderatore: ${campaign.name}`,
    });
    return res.json(campaign);
  } catch (error) {
    console.error("Moderator update campaign error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.post("/log-profile-view", async (req: Request, res: Response) => {
  try {
    const moderatorId = await requireModerator(req, res);
    if (!moderatorId) return;
    const { targetUserId } = req.body;
    if (!targetUserId) {
      return res.status(400).json({ message: "targetUserId richiesto" });
    }
    await storage.createModeratorLog({
      moderatorId,
      action: "view_profile",
      targetType: "user",
      targetId: targetUserId,
      details: null,
    });
    return res.json({ ok: true });
  } catch (error) {
    console.error("Log profile view error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

export default router;
