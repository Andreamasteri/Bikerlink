import { Router, type Request, type Response } from "express";
import { storage } from "../storage";

const router = Router();

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
      return true;
    });

    return res.json(activeCampaigns);
  } catch (error) {
    console.error("Get my ads error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
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
