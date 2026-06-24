import { sendError } from "../lib/api-response";
import { requireAuth } from "../lib/auth-middleware";
import { Router, type Request, type Response } from "express";
import { storage } from "../storage";
import { businessClickSchema } from "@shared/db";

const router = Router();

// Cooldown anti-abuso: stesso utente+business+azione non conta più volte ravvicinate.
const CLICK_COOLDOWN_MS = 30_000;
const recentClicks = new Map<string, number>();

function isOnCooldown(key: string, now: number): boolean {
  const last = recentClicks.get(key);
  if (last !== undefined && now - last < CLICK_COOLDOWN_MS) return true;
  recentClicks.set(key, now);
  // Pulizia opportunistica delle voci scadute per non far crescere la mappa.
  if (recentClicks.size > 5000) {
    for (const [k, t] of recentClicks) {
      if (now - t >= CLICK_COOLDOWN_MS) recentClicks.delete(k);
    }
  }
  return false;
}

// Solo i business approvati E attivi sono visibili al rider (marker mappa).
router.get("/", async (_req: Request, res: Response) => {
  try {
    const businesses = await storage.getVisibleBusinesses();
    return res.json(businesses);
  } catch (error) {
    console.error("Get businesses error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.get("/:id", async (req: Request<{ id: string }>, res: Response) => {
  try {
    const business = await storage.getBusiness(req.params.id);
    if (!business || !business.isApproved || !business.isActive) {
      return sendError(res, 404, "Business non trovato");
    }
    return res.json(business);
  } catch (error) {
    console.error("Get business error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

// Traccia un'azione del profilo come click (segnale di conversione).
// Richiede autenticazione: i click sono un segnale di conversione, niente conteggi anonimi.
router.post("/:id/click", requireAuth, async (req: Request<{ id: string }>, res: Response) => {
  try {
    const userId = req.session.userId as string;
    const business = await storage.getBusiness(req.params.id);
    if (!business || !business.isApproved || !business.isActive) {
      return sendError(res, 404, "Business non trovato");
    }
    const parsed = businessClickSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 400, "Azione non valida");
    }
    // Cooldown per evitare doppi conteggi/abuso sullo stesso utente+business+azione.
    if (isOnCooldown(`${userId}:${business.id}:${parsed.data.actionType}`, Date.now())) {
      return res.status(202).json({ ok: true, deduped: true });
    }
    await storage.createBusinessClick({
      businessId: business.id,
      userId,
      actionType: parsed.data.actionType,
    });
    return res.status(201).json({ ok: true });
  } catch (error) {
    console.error("Business click error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

export default router;
