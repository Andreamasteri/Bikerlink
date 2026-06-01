import { Router, type Request, type Response } from "express";
import { sendError } from "../../lib/api-response";
import { safeModLog } from "../../lib/safe-mod-log";

const router = Router();

// Task #2694 — Self-check del flusso campagne (probe + AI report).
router.post("/self-check", async (req: Request, res: Response) => {
  try {
    const { runCampaignsSelfCheck } = await import("../../ai/watchdog/campaigns-self-check");
    const withAi = req.body?.withAi !== false;
    const result = await runCampaignsSelfCheck({ triggeredBy: "manual", withAi });
    await safeModLog({
      moderatorId: req.session.userId!,
      action: "campaigns_self_check",
      targetType: "system",
      targetId: "campaigns",
      details: `Self-check: ${result.overall} (${result.checks.length} passi, ${result.durationMs}ms)`,
    });
    return res.json(result);
  } catch (error) {
    console.error("Self-check campagne error:", error);
    return sendError(res, 500, (error as Error)?.message ?? "Errore self-check");
  }
});

router.get("/self-check/last", async (_req: Request, res: Response) => {
  try {
    const { getLastSelfCheck } = await import("../../ai/watchdog/campaigns-self-check");
    return res.json({ result: getLastSelfCheck() });
  } catch (error) {
    return sendError(res, 500, (error as Error)?.message ?? "Errore lettura self-check");
  }
});

export default router;
