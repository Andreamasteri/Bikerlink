import { Router, type Request, type Response } from "express";
import { storage } from "../storage";
import { downloadBuffer } from "../objectStorage";
import path from "path";
import fs from "fs";

const router = Router();

router.get("/images/:filename", async (req: Request, res: Response) => {
  const filename = req.params.filename;
  if (!filename || filename.includes("..") || filename.includes("/")) {
    return res.status(400).json({ message: "Nome file non valido" });
  }
  const localPath = path.resolve(process.cwd(), "uploads", "ads", filename);
  if (fs.existsSync(localPath)) {
    return res.sendFile(localPath);
  }
  try {
    const imageBuffer = await downloadBuffer(`public/ads/${filename}`);
    const ext = path.extname(filename).toLowerCase();
    const mimeMap: Record<string, string> = {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".webp": "image/webp",
      ".gif": "image/gif",
    };
    res.setHeader("Content-Type", mimeMap[ext] || "application/octet-stream");
    res.setHeader("Cache-Control", "public, max-age=31536000");
    return res.send(imageBuffer);
  } catch (error) {
    console.error("Ad image serve error:", error);
    res.setHeader("Cache-Control", "no-store");
    return res.status(404).json({ message: "Immagine non trovata" });
  }
});

router.get("/active", async (req: Request, res: Response) => {
  try {
    const adsSetting = await storage.getAppSetting("ads_enabled");
    if (adsSetting?.value === "false") {
      return res.json([]);
    }

    const campaigns = await storage.getActiveCampaigns();

    const now = new Date();
    const activeCampaigns = campaigns.filter((c) => {
      if (c.startDate && new Date(c.startDate) > now) return false;
      if (c.endDate && new Date(c.endDate) < now) return false;
      return true;
    });

    for (const campaign of activeCampaigns) {
      await storage.incrementCampaignImpressions(campaign.id);
    }

    return res.json(activeCampaigns);
  } catch (error) {
    console.error("Get active ads error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/my-ads", async (req: Request, res: Response) => {
  try {
    const adsSetting = await storage.getAppSetting("ads_enabled");
    if (adsSetting?.value === "false") {
      return res.json([]);
    }

    const userId = req.session?.userId;
    if (!userId) {
      return res.status(401).json({ message: "Non autenticato" });
    }
    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(404).json({ message: "Utente non trovato" });
    }
    const userType = user.userType || "biker";
    const campaigns = await storage.getActiveAdsByUserType(userType);

    const now = new Date();
    const activeCampaigns = campaigns.filter((c) => {
      if (c.startDate && new Date(c.startDate) > now) return false;
      if (c.endDate && new Date(c.endDate) < now) return false;
      const p = c.placement || "all";
      return p === "all" || p === "home";
    });

    return res.json(activeCampaigns);
  } catch (error) {
    console.error("Get my ads error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/placement/:placement", async (req: Request, res: Response) => {
  try {
    const adsSetting = await storage.getAppSetting("ads_enabled");
    if (adsSetting?.value === "false") {
      return res.json([]);
    }

    const { placement } = req.params;
    const userId = req.session?.userId;
    let userType = "biker";
    if (userId) {
      const user = await storage.getUser(userId);
      if (user) userType = user.userType || "biker";
    }

    const campaigns = await storage.getActiveAdsByUserType(userType);

    const now = new Date();
    const activeCampaigns = campaigns.filter((c) => {
      if (c.startDate && new Date(c.startDate) > now) return false;
      if (c.endDate && new Date(c.endDate) < now) return false;
      const cp = c.placement || "all";
      return cp === placement || cp === "all";
    });

    return res.json(activeCampaigns);
  } catch (error) {
    console.error("Get placement ads error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

/**
 * GET /api/ads/guide-zip
 * Scarica il file ZIP della guida utente BikerLink da object storage.
 * Endpoint pubblico — nessuna autenticazione richiesta.
 */
router.get("/guide-zip", async (_req: Request, res: Response) => {
  try {
    const zipBuffer = await downloadBuffer("public/guide/bikerlink-guida.zip");
    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="bikerlink-guida.zip"'
    );
    res.setHeader("Cache-Control", "public, max-age=86400");
    return res.send(zipBuffer);
  } catch (error) {
    console.error("Guide ZIP serve error:", error);
    return res.status(404).json({ message: "File guida non disponibile" });
  }
});

router.post("/:id/click", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.session?.userId ?? null;

    await storage.createAdClick({
      campaignId: id as string,
      userId,
    });

    return res.json({ message: "Click registrato" });
  } catch (error) {
    console.error("Ad click error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

export default router;
