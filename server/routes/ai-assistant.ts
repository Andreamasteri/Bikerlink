// Task #2698 — Endpoint AI Assistant utente (NON admin). Sessione richiesta.
// - GET  /api/ai/assistant/config?platform=ios|android — config piattaforma
// - POST /api/ai/assistant/message — SSE streaming risposta dell'agente
// - POST /api/ai/assistant/action/:id — esegue azione whitelisted (validazione)
// - GET  /api/ai/assistant/history — turni memoria conversazionale (Task #3017)
// - DELETE /api/ai/assistant/history — cancella memoria conversazionale (Task #3017)
// - GET  /api/users/me/assistant-prefs — prefs utente
// - PATCH /api/users/me/assistant-prefs — aggiorna prefs utente
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { getTrustedClientIp } from "../lib/abuse-rate-limit";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { sendError } from "../lib/api-response";
import { users as usersTable } from "@shared/db";
import {
  loadAssistantConfig,
  resolveClientPlatform,
  type AssistantPlatform,
} from "../ai/assistant/config";
import { runAssistantAgent, extractActions } from "../ai/assistant/agent";
import { hasAnyAiProvider, AI_NO_PROVIDER_MESSAGE } from "../ai/moderation/provider";
import {
  ASSISTANT_ACTIONS,
  isWhitelistedAction,
  validateActionParams,
  type AssistantActionId,
} from "../ai/assistant/actions";
import { ASSISTANT_KNOWLEDGE, type KnowledgeEntry } from "../ai/assistant/knowledge";
import { logAssistantEvent } from "../ai/assistant/telemetry";

const router = Router();

// ── Auth: qualsiasi utente loggato (incluso admin/moderator) ──────────────
async function requireUser(req: Request, res: Response, next: () => void): Promise<void> {
  const userId = (req.session as { userId?: string })?.userId;
  if (!userId) { sendError(res, 401, "Non autenticato"); return; }
  try {
    const user = await storage.getUser(userId);
    if (!user) { sendError(res, 401, "Sessione non valida"); return; }
    (req as Request & { sessionUser?: typeof user }).sessionUser = user;
    next();
  } catch (e) {
    console.error("[ai-assistant/auth]", e);
    sendError(res, 500, "Errore autenticazione");
  }
}

// ── Rate limits ───────────────────────────────────────────────────────────
const messageLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.session as { userId?: string })?.userId ?? ipKeyGenerator(getTrustedClientIp(req) ?? ""),
  handler: (_req, res) => {
    sendError(res, 429, "Troppi messaggi all'AI Assistant — riprova tra un po'.");
  },
});

const actionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.session as { userId?: string })?.userId ?? ipKeyGenerator(getTrustedClientIp(req) ?? ""),
  handler: (_req, res) => {
    sendError(res, 429, "Troppe azioni all'AI Assistant — riprova tra un po'.");
  },
});

// ── Helpers ───────────────────────────────────────────────────────────────
function parsePlatform(raw: unknown): AssistantPlatform {
  return resolveClientPlatform(typeof raw === "string" ? raw : undefined);
}

async function loadCustomFaqs(_keys: string[]): Promise<KnowledgeEntry[]> {
  // Le chiavi i18n editabili runtime sono tradotte client-side; per il prompt
  // server-side qui non risolvo (per evitare dipendenze su un i18n server).
  // Le FAQ statiche di seed in ASSISTANT_KNOWLEDGE coprono il caso base.
  return [];
}

// ── GET /config ───────────────────────────────────────────────────────────
router.get("/ai/assistant/config", requireUser, async (req: Request, res: Response) => {
  try {
    const platform = parsePlatform(req.query.platform);
    const config = await loadAssistantConfig(platform);
    res.json({ platform, config, knowledge: ASSISTANT_KNOWLEDGE });
  } catch (e) {
    console.error("[ai-assistant/config]", e);
    sendError(res, 500, "Errore lettura config");
  }
});

// ── POST /message — SSE streaming ─────────────────────────────────────────
const MessageBody = z.object({
  message: z.string().min(1).max(2000),
  platform: z.enum(["android", "ios", "web"]).optional(),
  history: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().min(1).max(4000),
  })).max(10).optional(),
});

router.post("/ai/assistant/message", requireUser, messageLimiter, async (req: Request, res: Response) => {
  const parsed = MessageBody.safeParse(req.body);
  if (!parsed.success) { sendError(res, 400, parsed.error.issues[0].message); return; }
  const user = (req as Request & { sessionUser?: { id: string; role?: string | null; assistantPrefs?: { disabled?: boolean } | null } }).sessionUser!;

  if (user.assistantPrefs?.disabled) {
    sendError(res, 403, "Assistente disattivato dalle tue preferenze");
    return;
  }

  const rawPlatform = parsed.data.platform ?? "android";
  const platformForConfig = parsePlatform(rawPlatform);
  const config = await loadAssistantConfig(platformForConfig);
  if (!config.enabled) {
    sendError(res, 403, "Assistente disattivato dall'amministratore");
    return;
  }

  // Task #2825 — Nessun provider AI configurato: rispondi 503 con il nome delle
  // variabili mancanti così il client può mostrare il banner "Funzione AI non attivata".
  if (!hasAnyAiProvider()) {
    sendError(res, 503, AI_NO_PROVIDER_MESSAGE);
    return;
  }

  const allowedActions = Object.entries(config.actions)
    .filter(([, on]) => on)
    .map(([id]) => id);
  const customFaqs = await loadCustomFaqs(config.customFaqKeys);

  // SSE
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();
  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };
  const abort = new AbortController();
  req.on("close", () => abort.abort());

  await logAssistantEvent({
    eventType: "message_sent",
    platform: rawPlatform,
    userRole: user.role ?? null,
    userId: user.id,
    payload: { messageLen: parsed.data.message.length },
  });

  try {
    const result = await runAssistantAgent({
      message: parsed.data.message,
      platform: rawPlatform as "android" | "ios" | "web",
      allowedActions,
      customFaqs,
      history: parsed.data.history ?? [],
      signal: abort.signal,
      onTextDelta: (delta) => send("delta", { text: delta }),
    });

    const { cleanText, actions } = extractActions(result.text);
    // Filtra azioni: devono essere whitelisted globalmente E abilitate dall'admin.
    const safeActions = actions.filter((a) =>
      isWhitelistedAction(a.actionId) && allowedActions.includes(a.actionId),
    );
    for (const a of safeActions) {
      const def = ASSISTANT_ACTIONS[a.actionId as AssistantActionId];
      send("action", {
        actionId: a.actionId,
        params: a.params,
        confirmKey: def.confirmKey,
      });
      await logAssistantEvent({
        eventType: "action_proposed",
        platform: rawPlatform,
        userRole: user.role ?? null,
        userId: user.id,
        payload: { actionId: a.actionId },
      });
    }
    send("done", {
      text: cleanText,
      provider: result.provider,
      model: result.model,
      costUsd: result.costUsd,
      degraded: result.degraded,
      actionsCount: safeActions.length,
    });
    res.end();
  } catch (err) {
    console.error("[ai-assistant/message]", err);
    try { send("error", { code: 500, message: (err as Error).message }); } catch { /* */ }
    res.end();
  }
});

// ── Task #3097 — Esecutore azioni server-side ────────────────────────────────

type ServerActionResult =
  | { ok: true; data: unknown }
  | { ok: false; httpStatus: number; error: string };

async function executeServerAction(
  id: AssistantActionId,
  userId: string,
  params: unknown,
): Promise<ServerActionResult> {
  if (id === "add-waypoint-to-route") {
    const p = params as { routeId: string; waypointName: string; lat?: number; lng?: number };

    const route = await storage.getPlannedRoute(p.routeId);
    if (!route) return { ok: false, httpStatus: 404, error: "Percorso non trovato" };
    if (route.userId !== userId) return { ok: false, httpStatus: 403, error: "Non autorizzato" };

    let lat = p.lat;
    let lng = p.lng;

    if (lat == null || lng == null || !isFinite(lat) || !isFinite(lng)) {
      try {
        const { geocode } = await import("../lib/nominatim-client");
        const results = await geocode(p.waypointName);
        if (!results.length) {
          return { ok: false, httpStatus: 404, error: `Luogo non trovato: ${p.waypointName}` };
        }
        lat = results[0].lat;
        lng = results[0].lng;
      } catch {
        return { ok: false, httpStatus: 502, error: "Geocoding non disponibile, riprova tra poco" };
      }
    }

    const existing = Array.isArray(route.waypoints) ? route.waypoints : [];
    const newWaypoints = [
      ...existing,
      { lat, lng, name: p.waypointName } as { lat: number; lng: number; name?: string },
    ];

    const updated = await storage.updatePlannedRoute(p.routeId, { waypoints: newWaypoints });
    if (!updated) return { ok: false, httpStatus: 500, error: "Errore salvataggio waypoint" };

    console.info(`[ai-action] add-waypoint-to-route: route=${p.routeId} waypoint="${p.waypointName}" (${lat},${lng}) user=${userId}`);
    return {
      ok: true,
      data: {
        routeId: p.routeId,
        waypointName: p.waypointName,
        lat,
        lng,
        updatedWaypointsCount: newWaypoints.length,
      },
    };
  }

  return { ok: false, httpStatus: 400, error: "Azione server non implementata" };
}

// ── POST /action/:id — valida + logga (esecuzione client-side) ────────────
const ActionBody = z.object({
  params: z.unknown().optional(),
  confirmed: z.literal(true),
  platform: z.enum(["android", "ios", "web"]).optional(),
});

router.post("/ai/assistant/action/:id", requireUser, actionLimiter, async (req: Request, res: Response) => {
  const id = String(req.params.id ?? "");
  if (!isWhitelistedAction(id)) { sendError(res, 400, "Azione non in whitelist"); return; }
  const parsed = ActionBody.safeParse(req.body ?? {});
  if (!parsed.success) { sendError(res, 400, parsed.error.issues[0].message); return; }

  const user = (req as Request & { sessionUser?: { id: string; role?: string | null } }).sessionUser!;
  const rawPlatform = parsed.data.platform ?? "android";
  const platformForConfig = parsePlatform(rawPlatform);
  const config = await loadAssistantConfig(platformForConfig);
  if (!config.enabled) { sendError(res, 403, "Assistente disattivato"); return; }
  if (!config.actions[id as AssistantActionId]) {
    sendError(res, 403, "Azione disabilitata dall'admin per questa piattaforma");
    return;
  }

  const v = validateActionParams(id, parsed.data.params);
  if (!v.ok) { sendError(res, 400, v.error); return; }

  await logAssistantEvent({
    eventType: "action_executed",
    platform: rawPlatform,
    userRole: user.role ?? null,
    userId: user.id,
    payload: { actionId: id, params: v.params },
  });

  // Task #3097 — azioni server-side: il server esegue la modifica, il client riceve il risultato.
  const def = ASSISTANT_ACTIONS[id as AssistantActionId];
  if (def.kind === "server") {
    const result = await executeServerAction(id as AssistantActionId, user.id, v.params);
    if (!result.ok) {
      sendError(res, result.httpStatus, result.error);
      return;
    }
    res.json({ ok: true, actionId: id, params: v.params, result: result.data });
    return;
  }

  res.json({ ok: true, actionId: id, params: v.params });
});

// ── User prefs ────────────────────────────────────────────────────────────
router.get("/users/me/assistant-prefs", requireUser, async (req: Request, res: Response) => {
  const userId = (req.session as { userId?: string }).userId as string;
  const [row] = await db.select({ assistantPrefs: usersTable.assistantPrefs })
    .from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  res.json({ prefs: row?.assistantPrefs ?? {} });
});

const PrefsPatch = z.object({
  disabled: z.boolean().optional(),
  proactiveDisabled: z.boolean().optional(),
  onboardingDisabled: z.boolean().optional(),
});

router.patch("/users/me/assistant-prefs", requireUser, async (req: Request, res: Response) => {
  const userId = (req.session as { userId?: string }).userId as string;
  const parsed = PrefsPatch.safeParse(req.body ?? {});
  if (!parsed.success) { sendError(res, 400, parsed.error.issues[0].message); return; }
  const [row] = await db.select({ assistantPrefs: usersTable.assistantPrefs })
    .from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  const current = (row?.assistantPrefs ?? {}) as Record<string, unknown>;
  const next = { ...current, ...parsed.data, updatedAt: new Date().toISOString() };
  await db.update(usersTable).set({ assistantPrefs: next, updatedAt: new Date() })
    .where(eq(usersTable.id, userId));
  const user = (req as Request & { sessionUser?: { role?: string | null } }).sessionUser;
  await logAssistantEvent({
    eventType: "opt_out_changed",
    platform: typeof req.body?.platform === "string" ? req.body.platform : "unknown",
    userRole: user?.role ?? null,
    userId,
    payload: parsed.data,
  });
  res.json({ prefs: next });
});

// ── GET /api/ai/assistant/history — ultimi N turni della memoria conversazionale ──
router.get("/ai/assistant/history", requireUser, async (req: Request, res: Response) => {
  const userId = (req as Request & { sessionUser?: { id: string } }).sessionUser!.id;
  const limitRaw = parseInt(String(req.query.limit ?? "20"), 10);
  const limit = Math.min(Math.max(isNaN(limitRaw) ? 20 : limitRaw, 1), 100);
  try {
    const { db } = await import("../db");
    const { aiConversationTurns } = await import("@shared/db");
    const { eq, desc } = await import("drizzle-orm");
    const rows = await db
      .select({
        id: aiConversationTurns.id,
        role: aiConversationTurns.role,
        content: aiConversationTurns.content,
        createdAt: aiConversationTurns.createdAt,
      })
      .from(aiConversationTurns)
      .where(eq(aiConversationTurns.userId, userId))
      .orderBy(desc(aiConversationTurns.createdAt))
      .limit(limit);
    return res.json({ turns: rows.reverse(), total: rows.length });
  } catch (err) {
    return sendError(res, 500, (err as Error).message);
  }
});

// ── DELETE /api/ai/assistant/history — cancella tutta la memoria conversazionale ──
router.delete("/ai/assistant/history", requireUser, async (req: Request, res: Response) => {
  const userId = (req as Request & { sessionUser?: { id: string } }).sessionUser!.id;
  try {
    const { db } = await import("../db");
    const { aiConversationTurns } = await import("@shared/db");
    const { eq } = await import("drizzle-orm");
    await db.delete(aiConversationTurns).where(eq(aiConversationTurns.userId, userId));
    return res.json({ ok: true, deleted: true });
  } catch (err) {
    return sendError(res, 500, (err as Error).message);
  }
});

// ── Client telemetry beacon (tip_shown/dismissed, onboarding, ecc.) ──────
const ClientTelemetryBody = z.object({
  eventType: z.enum([
    "tip_shown", "tip_dismissed", "tip_disabled_permanent",
    "onboarding_started", "onboarding_completed", "conversation_started",
  ]),
  platform: z.string().min(1).max(16),
  payload: z.record(z.string(), z.unknown()).optional(),
});

router.post("/ai/assistant/telemetry", requireUser, async (req: Request, res: Response) => {
  const parsed = ClientTelemetryBody.safeParse(req.body ?? {});
  if (!parsed.success) { sendError(res, 400, parsed.error.issues[0].message); return; }
  const user = (req as Request & { sessionUser?: { id: string; role?: string | null } }).sessionUser!;
  await logAssistantEvent({
    eventType: parsed.data.eventType,
    platform: parsed.data.platform,
    userRole: user.role ?? null,
    userId: user.id,
    payload: parsed.data.payload ?? {},
  });
  res.json({ ok: true });
});

export default router;
