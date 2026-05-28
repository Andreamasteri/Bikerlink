import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { sendError, sendSuccess } from "../lib/api-response";
import { db } from "../db";
import { abEvents } from "@shared/db";
import { getTrustedClientIp } from "../lib/abuse-rate-limit";

const router = Router();

export const ANALYTICS_EXPERIMENT_KEY = "analytics";
const ANALYTICS_VARIANT = "default";

const trackEventSchema = z.object({
  name: z.string().min(1).max(60),
  payload: z.record(z.string(), z.unknown()).optional(),
});

const ipHitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 120;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = ipHitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    ipHitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  if (entry.count >= RATE_LIMIT_MAX) return true;
  entry.count++;
  return false;
}

router.post("/events", async (req: Request, res: Response) => {
  try {
    const ip = getTrustedClientIp(req) ?? "unknown";
    if (isRateLimited(ip)) {
      return sendError(res, 429, "Troppe richieste");
    }

    const parsed = trackEventSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return sendError(res, 400, parsed.error.issues[0]?.message ?? "Payload non valido");
    }

    const { name, payload } = parsed.data;
    const userId = req.session?.userId ?? null;

    await db.insert(abEvents).values({
      experimentKey: ANALYTICS_EXPERIMENT_KEY,
      variant: ANALYTICS_VARIANT,
      userId,
      eventName: name,
      payload: payload ?? null,
    });

    return sendSuccess(res);
  } catch (err) {
    console.error("[analytics/events] insert failed:", err);
    return sendError(res, 500, "Errore interno");
  }
});

export default router;
