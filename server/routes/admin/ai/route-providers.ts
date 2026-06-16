/**
 * Admin — Route AI Providers
 *
 * GET  /api/admin/ai/route-providers              → stato di ciascun provider + chain attiva
 * GET  /api/admin/ai/route-providers/config       → chain salvata in DB (senza env override)
 * POST /api/admin/ai/route-providers/config       → aggiorna chain in DB
 * POST /api/admin/ai/route-providers/test         → live-ping di un provider specifico
 *
 * Auth: _requireAdmin (già applicato dal router padre in admin.ts).
 */

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { generateText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { sendError } from "../../../lib/api-response";
import { getProviderStats7Days } from "../../../ai/route-provider-stats";
import {
  getRouteProviderStatusList,
  setRouteProviderChain,
  ALL_ROUTE_PROVIDERS,
  DEFAULT_ROUTE_CHAIN,
  type RouteProviderId,
} from "../../../ai/route-provider-config";
import { storage } from "../../../storage";
import { callOllamaChat, isOllamaConfigured } from "../../../lib/ollama-client";
import { getGroqModel, isGroqConfigured } from "../../../lib/groq-client";
import { getOpenAiRouteModel, isOpenAiRouteConfigured } from "../../../lib/openai-route-client";
import { sanitizeError } from "./test-ollama";

const router = Router();

const DB_KEY = "ai_route_provider_chain";

// ── GET /ai/route-providers ──────────────────────────────────────────────────
router.get("/route-providers", async (_req: Request, res: Response) => {
  try {
    const data = await getRouteProviderStatusList();
    res.json(data);
  } catch (err) {
    console.error("[admin/ai/route-providers] GET error:", err);
    sendError(res, 500, (err as Error).message);
  }
});

// ── GET /ai/route-providers/config ───────────────────────────────────────────
router.get("/route-providers/config", async (_req: Request, res: Response) => {
  try {
    const row = await storage.getAppSetting(DB_KEY);
    const saved: RouteProviderId[] =
      row?.valueJson && Array.isArray(row.valueJson)
        ? (row.valueJson as string[]).filter((id): id is RouteProviderId =>
            ALL_ROUTE_PROVIDERS.includes(id as RouteProviderId),
          )
        : [];

    const envOverride = process.env.ROUTE_AI_PROVIDERS ?? null;
    res.json({
      chain: saved.length > 0 ? saved : DEFAULT_ROUTE_CHAIN,
      dbChain: saved,
      envOverride: envOverride && envOverride !== "auto" ? envOverride : null,
      default: DEFAULT_ROUTE_CHAIN,
    });
  } catch (err) {
    console.error("[admin/ai/route-providers/config] GET error:", err);
    sendError(res, 500, (err as Error).message);
  }
});

// ── POST /ai/route-providers/test ────────────────────────────────────────────
const TestBody = z.object({
  provider: z.enum(["ollama", "groq", "gemini", "openai"]),
});

router.post("/route-providers/test", async (req: Request, res: Response) => {
  const parsed = TestBody.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, parsed.error.issues[0].message);
    return;
  }

  const { provider } = parsed.data;
  const start = Date.now();

  try {
    if (provider === "ollama") {
      if (!isOllamaConfigured) {
        res.json({ success: false, ok: false, latency_ms: 0, error: "OLLAMA_URL non configurata." });
        return;
      }
      const reply = await callOllamaChat(
        "Rispondi solo con la parola: PONG",
        undefined,
        { temperature: 0, maxRetries: 0 },
      );
      res.json({ success: true, ok: true, latency_ms: Date.now() - start, reply: typeof reply === "string" ? reply.trim().slice(0, 120) : null });
      return;
    }

    if (provider === "groq") {
      if (!isGroqConfigured) {
        res.json({ success: false, ok: false, latency_ms: 0, error: "GROQ_API_KEY non configurata." });
        return;
      }
      const model = getGroqModel();
      const { text } = await generateText({ model, prompt: "Reply with only the word: PONG", maxRetries: 0 });
      res.json({ success: true, ok: true, latency_ms: Date.now() - start, reply: text.trim().slice(0, 120) });
      return;
    }

    if (provider === "gemini") {
      const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? "";
      if (!apiKey) {
        res.json({ success: false, ok: false, latency_ms: 0, error: "GEMINI_API_KEY (o GOOGLE_API_KEY) non configurata." });
        return;
      }
      const model = createGoogleGenerativeAI({ apiKey })("gemini-2.0-flash");
      const { text } = await generateText({ model, prompt: "Reply with only the word: PONG", maxRetries: 0 });
      res.json({ success: true, ok: true, latency_ms: Date.now() - start, reply: text.trim().slice(0, 120) });
      return;
    }

    if (provider === "openai") {
      if (!isOpenAiRouteConfigured) {
        res.json({ success: false, ok: false, latency_ms: 0, error: "OPENAI_API_KEY non configurata." });
        return;
      }
      const model = getOpenAiRouteModel();
      const { text } = await generateText({ model, prompt: "Reply with only the word: PONG", maxRetries: 0 });
      res.json({ success: true, ok: true, latency_ms: Date.now() - start, reply: text.trim().slice(0, 120) });
      return;
    }
  } catch (err: unknown) {
    const latency_ms = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[admin/ai/route-providers/test] ${provider} errore:`, msg);
    // Sempre 200 con ok:false — così il client può leggere latency_ms + error senza
    // dover gestire eccezioni dalla fetch (apiRequest lancia su status >= 400).
    res.json({ success: false, ok: false, latency_ms, error: sanitizeError(msg) });
    return;
  }
});

// ── GET /ai/route-providers/stats ─────────────────────────────────────────────
router.get("/route-providers/stats", async (_req: Request, res: Response) => {
  try {
    const stats = await getProviderStats7Days();
    res.json({ stats });
  } catch (err) {
    console.error("[admin/ai/route-providers/stats] GET error:", err);
    sendError(res, 500, (err as Error).message);
  }
});

// ── POST /ai/route-providers/config ──────────────────────────────────────────
const ConfigBody = z.object({
  chain: z.array(z.enum(["ollama", "groq", "gemini", "openai"])).min(1),
});

router.post("/route-providers/config", async (req: Request, res: Response) => {
  const parsed = ConfigBody.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, parsed.error.issues[0].message);
    return;
  }

  try {
    await setRouteProviderChain(parsed.data.chain);
    const data = await getRouteProviderStatusList();
    res.json({ success: true, ok: true, ...data });
  } catch (err) {
    console.error("[admin/ai/route-providers/config] POST error:", err);
    sendError(res, 500, (err as Error).message);
  }
});

export default router;
