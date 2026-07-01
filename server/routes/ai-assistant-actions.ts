// Estratto da ai-assistant.ts (limite 600 righe) — esecutore azioni + endpoint
// action/:id, admin-action/:id e notification-reply (Bowie Terminal, Task #5222).
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { sendError } from "../lib/api-response";
import { loadAssistantConfig } from "../ai/assistant/config";
import { runAssistantAgent, extractActions } from "../ai/assistant/agent";
import { classifyRoutingIntent, type AiPersonaId } from "../ai/assistant/roster";
import { hasAnyAiProvider, AI_NO_PROVIDER_MESSAGE } from "../ai/moderation/provider";
import { filterSensitiveOutput } from "../ai/assistant/security-filter";
import { logAiCall } from "../lib/ai-logger";
import { sendBowieReplyPush } from "../push-notifications";
import {
  ASSISTANT_ACTIONS,
  isWhitelistedAction,
  validateActionParams,
  type AssistantActionId,
} from "../ai/assistant/actions";
import { logAssistantEvent } from "../ai/assistant/telemetry";
import {
  isWhitelistedAdminAction,
  validateAdminActionParams,
  executeAdminAction,
  type AdminAssistantActionId,
} from "../ai/assistant/admin-actions";
import { requireUser, actionLimiter, parsePlatform } from "./ai-assistant-helpers";

const router = Router();

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

// ── Task #4922 — POST /admin-action/:id — esegue azione admin (server-side) ──
// Permission-check (role === admin) + validazione params + audit log.
const AdminActionBody = z.object({
  params: z.unknown().optional(),
  confirmed: z.literal(true),
});

router.post("/ai/assistant/admin-action/:id", requireUser, actionLimiter, async (req: Request, res: Response) => {
  const user = (req as Request & { sessionUser?: { id: string; role?: string | null } }).sessionUser!;
  if (user.role !== "admin") { sendError(res, 403, "Accesso riservato agli amministratori"); return; }

  const id = String(req.params.id ?? "");
  if (!isWhitelistedAdminAction(id)) { sendError(res, 400, "Azione admin non in whitelist"); return; }

  const parsed = AdminActionBody.safeParse(req.body ?? {});
  if (!parsed.success) { sendError(res, 400, parsed.error.issues[0].message); return; }

  const v = validateAdminActionParams(id as AdminAssistantActionId, parsed.data.params);
  if (!v.ok) { sendError(res, 400, v.error); return; }

  let result;
  try {
    result = await executeAdminAction(id as AdminAssistantActionId, v.params);
  } catch (err) {
    console.error("[ai-assistant/admin-action]", err);
    await logAssistantEvent({
      eventType: "action_rejected",
      platform: "admin",
      userRole: user.role ?? null,
      userId: user.id,
      payload: { actionId: id, params: v.params, error: (err as Error).message },
    });
    sendError(res, 500, "Errore esecuzione azione admin");
    return;
  }

  await logAssistantEvent({
    eventType: result.ok ? "action_executed" : "action_rejected",
    platform: "admin",
    userRole: user.role ?? null,
    userId: user.id,
    payload: { actionId: id, params: v.params, ok: result.ok },
  });

  if (!result.ok) { sendError(res, result.httpStatus, result.error); return; }
  res.json({ ok: true, actionId: id, summary: result.summary, data: result.data });
});

// ── Task #5222 — POST /notification-reply (Bowie Terminal) ───────────────────
// Risposta NON in streaming pensata per la quick-reply dalla notifica Android
// persistente. Bearer → cookie bridge fa già da auth (requireUser). La risposta
// viene generata, filtrata (security) e rispedita come push notification.
// Anti-abuso leggero: 1 richiesta concorrente per utente + cooldown 10s.
const notificationReplyInFlight = new Set<string>();
const notificationReplyCooldown = new Map<string, number>();
const NOTIFICATION_REPLY_COOLDOWN_MS = 10_000;

const NotificationReplyBody = z.object({
  message: z.string().min(1).max(2000),
  platform: z.enum(["android", "ios"]).optional(),
  // Task #5228 — client di origine per l'attribuzione nel monitor Bowie Standalone.
  source: z.enum(["main_app", "bowie_terminal"]).optional(),
});

router.post("/ai/assistant/notification-reply", requireUser, async (req: Request, res: Response) => {
  const parsed = NotificationReplyBody.safeParse(req.body ?? {});
  if (!parsed.success) { sendError(res, 400, parsed.error.issues[0].message); return; }
  const user = (req as Request & { sessionUser?: { id: string; role?: string | null } }).sessionUser!;

  const now = Date.now();
  const until = notificationReplyCooldown.get(user.id) ?? 0;
  if (now < until) {
    sendError(res, 429, "Aspetta qualche secondo prima di un'altra richiesta.");
    return;
  }
  if (notificationReplyInFlight.has(user.id)) {
    sendError(res, 429, "Una richiesta è già in corso.");
    return;
  }

  const rawPlatform = parsed.data.platform ?? "android";

  // Persona: Bowie è l'entry point; un intento di percorso passa a Horus.
  // (Ares è solo lato admin/pannello, non da quick-reply notifica.)
  const persona: AiPersonaId = classifyRoutingIntent(parsed.data.message) ? "horus" : "bowie";

  if (!hasAnyAiProvider()) {
    sendError(res, 503, AI_NO_PROVIDER_MESSAGE);
    return;
  }

  notificationReplyInFlight.add(user.id);
  notificationReplyCooldown.set(user.id, now + NOTIFICATION_REPLY_COOLDOWN_MS);

  // Risponde subito al client (la generazione + push avvengono in background):
  // la quick-reply dalla notifica non attende l'inferenza, riceve la risposta
  // come nuova push notification.
  res.json({ ok: true, accepted: true, persona });

  try {
    const result = await runAssistantAgent({
      message: parsed.data.message,
      platform: rawPlatform as "android" | "ios",
      allowedActions: [],
      customFaqs: [],
      history: [],
      userId: user.id,
      persona,
      // Task #5228 — attribuzione client di origine.
      sourceApp: parsed.data.source ?? "main_app",
    });

    // Buffer completo → filtro one-shot (non c'è streaming, nessun leak parziale).
    const { cleanText } = extractActions(result.text);
    const filtered = filterSensitiveOutput(cleanText);
    if (filtered.blocked) {
      console.warn(`[ai-assistant/notification-reply] output bloccato (persona=${result.persona}, user=${user.id})`);
      logAiCall({
        userId: user.id,
        provider: result.provider,
        modelId: result.model,
        tokensIn: 0,
        tokensOut: 0,
        costUsd: 0,
        securityBlocked: true,
        persona: result.persona.id,
        sourceApp: parsed.data.source ?? "main_app",
        error: "security_blocked: notification-reply output filter",
      });
    }

    // Task #5228 — traccia l'esito della consegna push come riga dedicata
    // (notification_status delivered/failed). Righe SOLO di consegna: token 0 e
    // notificationStatus valorizzato, così il monitor non le conta come turni.
    const delivered = await sendBowieReplyPush(user.id, {
      body: filtered.text,
      persona: result.persona,
    });
    logAiCall({
      userId: user.id,
      provider: result.provider,
      modelId: result.model,
      tokensIn: 0,
      tokensOut: 0,
      costUsd: 0,
      persona: result.persona.id,
      sourceApp: parsed.data.source ?? "main_app",
      notificationStatus: delivered > 0 ? "delivered" : "failed",
    });
  } catch (err) {
    console.error("[ai-assistant/notification-reply]", err);
    try {
      await sendBowieReplyPush(user.id, {
        body: "Qualcosa è andato storto, riprova dall'app.",
      });
    } catch { /* push best-effort */ }
  } finally {
    notificationReplyInFlight.delete(user.id);
  }
});

export default router;
