/**
 * Task #3191 — Espone le decisioni recenti dell'AI Routing Engine Selector
 * (reason + confidence) per il pannello admin. Sola lettura, dati in-memory.
 */
import { Router, type Request, type Response } from "express";
import { getAiDecisions } from "../../../routing/ai-decision-log";

const router = Router();

router.get("/ai-decisions", (req: Request, res: Response) => {
  const raw = Number((req.query.limit as string) ?? "50");
  const limit = Number.isFinite(raw) ? raw : 50;
  return res.json({ decisions: getAiDecisions(limit) });
});

export default router;
