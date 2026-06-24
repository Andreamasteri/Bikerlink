// Task #2637 — Router multi-scope per la AI Console.
// Decide quali scope (moderation/watchdog/ota/db-integrity/app-integrity)
// servono per rispondere al messaggio. Usa Gemini Flash come modello
// veloce/economico. Cache Redis 60s su hash del messaggio.
import crypto from "crypto";
import { z } from "zod";
import { runWithFallback, estimateCostUsd, generateStructured } from "../moderation/provider";
import { getRedis } from "../../cache/redis";
import { SCOPES } from "./tools";
import { emitConsoleQuery } from "../coordinator/integrations/console";

const CACHE_TTL_S = 60;

export const RouterDecisionSchema = z.object({
  scopes: z.array(z.enum(SCOPES)).min(1).max(SCOPES.length),
  reasoning: z.string().max(400),
});
export type RouterDecision = z.infer<typeof RouterDecisionSchema>;

const SYSTEM = `Sei il router multi-scope della AI Console admin di BikerLink.
SCOPE DISPONIBILI:
- moderation: report utenti, ban, decisioni moderatori, anomalie comportamentali
- watchdog: salute sistema (DB/Redis/queue/latenza), crash client, signals, proposte AI di auto-fix
- ota: release OTA, boot events, OTA assistant, rollback candidates
- db-integrity: orphan rows, FK invalide, stati DB anomali
- app-integrity: drift codice/config/dipendenze, asset mancanti

REGOLE:
1. Selezione MINIMA ma SUFFICIENTE: meglio 2 scope pertinenti che 5 generici.
2. Se la richiesta è cross-scope (es. "i crash di ieri sono correlati a una release?"), seleziona TUTTI gli scope necessari.
3. Se la richiesta è ambigua / molto generale ("come va il sistema?"), seleziona ["watchdog","db-integrity","app-integrity"].
4. "reasoning" max 2 frasi in italiano.`;

export interface RouteOpts {
  message: string;
  conversationContext?: string; // summary della conversazione (memoria)
  adminId?: string;
}

function hashKey(message: string, ctx?: string): string {
  return crypto.createHash("sha256").update(`${message}\n${ctx ?? ""}`).digest("hex").slice(0, 32);
}

export async function routeMessage(opts: RouteOpts): Promise<{
  decision: RouterDecision;
  cached: boolean;
  costUsd: number;
  model: string;
  provider: string;
}> {
  const key = `ai-console:router:${hashKey(opts.message, opts.conversationContext)}`;
  const redis = getRedis();
  if (redis) {
    try {
      const cached = await redis.get(key);
      if (cached) {
        const parsed = RouterDecisionSchema.parse(JSON.parse(cached));
        // Task #2654 — emit al Coordinator (graceful)
        await emitConsoleQuery({
          adminId: opts.adminId ?? "unknown",
          scopes: parsed.scopes,
          queryPreview: opts.message,
          cached: true,
        });
        return { decision: parsed, cached: true, costUsd: 0, model: "cache", provider: "cache" };
      }
    } catch { /* swallow */ }
  }

  const prompt = opts.conversationContext
    ? `Contesto conversazione (riassunto):\n${opts.conversationContext}\n\nMessaggio admin:\n${opts.message}`
    : `Messaggio admin:\n${opts.message}`;

  let costUsd = 0;
  let modelId = "llama-3.3-70b-versatile";
  let providerName = "groq";
  try {
    const { value, model } = await runWithFallback(
      { role: "router" },
      async (m) => {
        const r = await generateStructured(m, {
          schema: RouterDecisionSchema,
          system: SYSTEM,
          prompt,
        });
        modelId = m.modelId;
        providerName = m.providerName;
        const tIn = r.usage?.inputTokens ?? 0;
        const tOut = r.usage?.outputTokens ?? 0;
        costUsd = estimateCostUsd(m.modelId, tIn, tOut);
        return r.object;
      },
    );
    modelId = model.modelId;
    providerName = model.providerName;
    const decision = value;
    if (redis) {
      redis.set(key, JSON.stringify(decision), "EX", CACHE_TTL_S).catch(() => {});
    }
    // Task #2654 — emit al Coordinator (graceful)
    await emitConsoleQuery({
      adminId: opts.adminId ?? "unknown",
      scopes: decision.scopes,
      queryPreview: opts.message,
      cached: false,
    });
    return { decision, cached: false, costUsd, model: modelId, provider: providerName };
  } catch (err) {
    // Fallback determinato: scegli tutto per non bloccare l'utente.
    console.warn("[ai-console/router] fallback su all-scopes:", (err as Error).message);
    return {
      decision: { scopes: [...SCOPES], reasoning: "router non disponibile, seleziono tutti gli scope" },
      cached: false, costUsd, model: modelId, provider: providerName,
    };
  }
}
