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
import { getTelemetrySummary } from "../../ai/assistant/telemetry";

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

export default router;
