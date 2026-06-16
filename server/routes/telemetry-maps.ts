// Task #2686 — Endpoint client per ricevere eventi telemetria mappe.
// POST /api/telemetry/maps  (body: { events: [...] })
// - rate limit per IP (60 req/min)
// - body cap a 64KB
// - validazione zod, max 50 eventi per batch
// - kill-switch: ai_watchdog_maps_telemetry_enabled
import express, { Router, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { sendSuccess, sendError } from "../lib/api-response";
import { MAPS_EVENT_TYPES, recordMapsTelemetryBatch } from "../ai/watchdog/maps-telemetry-store";
import { isMapsFlagEnabled } from "../ai/watchdog/maps-kill-switch";
import { logger } from "../lib/logger";

const log = logger.child({ scope: "maps-watchdog", layer: "ingest" });
const router = Router();

const mapsTelemetryJson = express.json({ limit: "64kb" });
const mapsTelemetryLimiter = rateLimit({
  windowMs: 60_000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({ received: true });
  },
});

const eventSchema = z.object({
  event: z.enum(MAPS_EVENT_TYPES as unknown as [string, ...string[]]),
  renderer: z.string().max(30).optional().nullable(),
  component: z.string().max(60).optional().nullable(),
  engine: z.string().max(30).optional().nullable(),
  durationMs: z.number().int().nonnegative().max(600_000).optional().nullable(),
  errorMessage: z.string().max(500).optional().nullable(),
  platform: z.enum(["ios", "android", "web"]).optional().nullable(),
  appVersion: z.string().max(30).optional().nullable(),
  details: z.record(z.string(), z.unknown()).optional().nullable(),
});

const batchSchema = z.object({
  events: z.array(eventSchema).min(1).max(50),
});

router.post("/maps", mapsTelemetryLimiter, mapsTelemetryJson, async (req: Request, res: Response) => {
  if (!(await isMapsFlagEnabled("telemetry"))) {
    // Risposta 200 silenziosa per non far retry alla coda offline.
    return sendSuccess(res, { received: true, ingested: 0, disabled: true });
  }
  const parsed = batchSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, 400, parsed.error.issues[0]?.message ?? "Invalid payload");
  }
  const userId = (req.session as { userId?: string } | undefined)?.userId ?? null;
  try {
    const out = await recordMapsTelemetryBatch(
      parsed.data.events.map((e) => ({
        userId,
        event: e.event as typeof MAPS_EVENT_TYPES[number],
        renderer: e.renderer ?? null,
        component: e.component ?? null,
        engine: e.engine ?? null,
        durationMs: e.durationMs ?? null,
        errorMessage: e.errorMessage ?? null,
        platform: e.platform ?? null,
        appVersion: e.appVersion ?? null,
        details: e.details ?? null,
      })),
    );
    return sendSuccess(res, { received: true, ingested: out.inserted });
  } catch (err) {
    log.warn({ err: (err as Error).message }, "ingest error");
    return sendError(res, 500, "telemetry ingest failed");
  }
});

// Esposto al client per kill-switch lato emitter (vedi hooks/useMapTelemetry.ts).
// Cache TTL 5 min lato client — qui rispondiamo subito senza side-effects.
router.get("/maps/flag", async (_req: Request, res: Response) => {
  const enabled = await isMapsFlagEnabled("telemetry");
  return sendSuccess(res, { enabled });
});

export default router;
