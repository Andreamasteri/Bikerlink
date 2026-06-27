// Task #2698 — Endpoint admin per config AI Assistant utente + telemetria.
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { sendError } from "../../lib/api-response";
import {
  loadAssistantConfig,
  saveAssistantConfig,
  resolveClientPlatform,
  PROACTIVE_RULES,
  type AssistantPlatform,
} from "../../ai/assistant/config";
import { ASSISTANT_ACTIONS } from "../../ai/assistant/actions";
import { getTelemetrySummary, getAdminActionHistory } from "../../ai/assistant/telemetry";
import { getMemoryStats, runMemoryPruner } from "../../ai/assistant/memory-pruner";

const router = Router();

function parsePlatform(raw: unknown): AssistantPlatform {
  return resolveClientPlatform(typeof raw === "string" ? raw : undefined);
}

router.get("/ai/assistant/meta", (_req: Request, res: Response) => {
  res.json({
    actions: Object.values(ASSISTANT_ACTIONS).map((a) => ({
      id: a.id,
      description: a.description,
      confirmKey: a.confirmKey,
    })),
    proactiveRules: PROACTIVE_RULES,
  });
});

router.get("/ai/assistant/config", async (req: Request, res: Response) => {
  try {
    const platform = parsePlatform(req.query.platform);
    const config = await loadAssistantConfig(platform);
    res.json({ platform, config });
  } catch (e) {
    console.error("[admin/ai-assistant/config GET]", e);
    sendError(res, 500, "Errore lettura config");
  }
});

const ConfigBody = z.object({
  enabled: z.boolean(),
  modes: z.object({
    fab: z.boolean(),
    selective: z.boolean(),
    onboarding: z.boolean(),
  }),
  actions: z.record(z.string(), z.boolean()),
  proactive: z.record(z.string(), z.boolean()),
  customFaqKeys: z.array(z.string().min(1).max(100)).max(50),
});

router.put("/ai/assistant/config", async (req: Request, res: Response) => {
  try {
    const platform = parsePlatform(req.query.platform ?? req.body?.platform);
    const parsed = ConfigBody.safeParse(req.body);
    if (!parsed.success) { sendError(res, 400, parsed.error.issues[0].message); return; }
    // Sanitize: keep only known action/rule keys.
    const sanitizedActions: Record<string, boolean> = {};
    for (const k of Object.keys(ASSISTANT_ACTIONS)) {
      sanitizedActions[k] = !!parsed.data.actions[k];
    }
    const sanitizedProactive: Record<string, boolean> = {};
    for (const k of PROACTIVE_RULES) {
      sanitizedProactive[k] = !!parsed.data.proactive[k];
    }
    const saved = await saveAssistantConfig(platform, {
      enabled: parsed.data.enabled,
      modes: parsed.data.modes,
      actions: sanitizedActions as never,
      proactive: sanitizedProactive as never,
      customFaqKeys: parsed.data.customFaqKeys,
    });
    res.json({ platform, config: saved });
  } catch (e) {
    console.error("[admin/ai-assistant/config PUT]", e);
    sendError(res, 500, "Errore salvataggio config");
  }
});

router.get("/ai/assistant/telemetry", async (req: Request, res: Response) => {
  try {
    const platform = parsePlatform(req.query.platform);
    const windowHours = Math.min(168, Math.max(1, parseInt(String(req.query.windowHours ?? "24"), 10) || 24));
    const summary = await getTelemetrySummary({ platform, windowHours });
    res.json({ platform, ...summary });
  } catch (e) {
    console.error("[admin/ai-assistant/telemetry]", e);
    sendError(res, 500, "Errore lettura telemetria");
  }
});

// Task #4927 — Storico azioni admin eseguite dall'assistente (ultimi 50 eventi action_*).
router.get("/ai/assistant/action-history", async (req: Request, res: Response) => {
  try {
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "50"), 10) || 50));
    const rows = await getAdminActionHistory(limit);
    res.json({ rows });
  } catch (e) {
    console.error("[admin/ai-assistant/action-history]", e);
    sendError(res, 500, "Errore lettura storico azioni");
  }
});

// Task #3099 — Conversation memory stats + manual prune trigger.

router.get("/ai/assistant/memory/stats", async (_req: Request, res: Response) => {
  try {
    const stats = await getMemoryStats();
    res.json(stats);
  } catch (e) {
    console.error("[admin/ai-assistant/memory/stats]", e);
    sendError(res, 500, "Errore lettura statistiche memoria");
  }
});

router.post("/ai/assistant/memory/prune", async (_req: Request, res: Response) => {
  try {
    const result = await runMemoryPruner();
    res.json({ ok: true, ...result });
  } catch (e) {
    console.error("[admin/ai-assistant/memory/prune]", e);
    sendError(res, 500, "Errore pruning memoria");
  }
});

export default router;
