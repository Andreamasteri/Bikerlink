// Helper condivisi tra i sotto-router di AI Assistant (splittati per il
// limite 600 righe — vedi ai-assistant.ts, ai-assistant-actions.ts,
// ai-assistant-prefs.ts).
import type { Request, Response } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { getTrustedClientIp } from "../lib/abuse-rate-limit";
import { storage } from "../storage";
import { sendError } from "../lib/api-response";
import { resolveClientPlatform, type AssistantPlatform } from "../ai/assistant/config";
import type { KnowledgeEntry } from "../ai/assistant/knowledge";

// ── Auth: qualsiasi utente loggato (incluso admin/moderator) ──────────────
export async function requireUser(req: Request, res: Response, next: () => void): Promise<void> {
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
export const messageLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.session as { userId?: string })?.userId ?? ipKeyGenerator(getTrustedClientIp(req) ?? ""),
  handler: (_req, res) => {
    sendError(res, 429, "Troppi messaggi all'AI Assistant — riprova tra un po'.");
  },
});

export const actionLimiter = rateLimit({
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
export function parsePlatform(raw: unknown): AssistantPlatform {
  return resolveClientPlatform(typeof raw === "string" ? raw : undefined);
}

export async function loadCustomFaqs(_keys: string[]): Promise<KnowledgeEntry[]> {
  // Le chiavi i18n editabili runtime sono tradotte client-side; per il prompt
  // server-side qui non risolvo (per evitare dipendenze su un i18n server).
  // Le FAQ statiche di seed in ASSISTANT_KNOWLEDGE coprono il caso base.
  //
  // Task #5322 — Iniettiamo qui la conoscenza AUTO-APPRESA in locale da Bowie
  // (ai_learned_knowledge): finisce in opts.customFaqs → parametro `extra` del
  // RAG, quindi entra nel retrieval SENZA toccare la KB statica. Best-effort e
  // con cache breve: se il DB non risponde, il chiamante prosegue senza extra.
  try {
    const { loadLearnedKnowledge } = await import("../ai/assistant/auto-learn");
    return await loadLearnedKnowledge();
  } catch (e) {
    console.warn("[ai-assistant/loadCustomFaqs] learned knowledge load failed:", (e as Error).message);
    return [];
  }
}
