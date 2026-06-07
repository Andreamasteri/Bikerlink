/**
 * Task #3191 — AI Routing Engine Selector.
 *
 * Quando l'admin imposta `maps_routing_engine = "ai"`, per ogni richiesta di
 * routing un modello cloud (chain Groq→Gemini→OpenAI→Anthropic, role "router")
 * sceglie l'engine self-hosted ottimale. La chiamata NON deve mai bloccare oltre
 * il timeout (default 800ms): oltre quel tempo si aborta e si ricade sul
 * selettore normale (vedi router-selector.ts).
 */
import { z } from "zod";
import { generateObject } from "ai";
import { runWithFallback } from "../ai/moderation/provider";
import { getRoutingCounters, getRecentLatencies, getBboxEngineQuality, bboxKeyOf, type BboxEngineQuality } from "./routing-metrics";

// Engine candidati per la selezione AI: solo i due self-hosted. Gli engine cloud
// (mapbox/tomtom) restano fuori dalla scelta automatica.
export const AI_CANDIDATE_ENGINES = ["graphhopper", "valhalla"] as const;
export type AiCandidateEngine = (typeof AI_CANDIDATE_ENGINES)[number];

export interface AiRoutingContext {
  style: string;
  area: { centerLat: number; centerLon: number };
  /** Cella geografica (~0.5°) cui si riferisce bboxQuality. */
  bboxKey: string;
  hourOfDay: number;
  valhallaConfigured: boolean;
  engineHealth: Record<string, { success: number; fallback: number; failure: number; down: boolean }>;
  recentLatencyMs: Record<string, number | null>;
  /** Storico qualità per-engine (24h) specifico di questa bbox: success/failure, latenza e score medi. */
  bboxQuality: Record<string, BboxEngineQuality>;
}

export interface AiEngineDecision {
  engine: AiCandidateEngine;
  confidence: number;
  reason: string;
  provider: string | null;
}

// Schema strict-safe: solo enum/number/string, nessun optional/record (vedi
// memoria ai-strict-schema) così il response_format è accettato dai provider strict.
const decisionSchema = z.object({
  engine: z.enum(["graphhopper", "valhalla"]),
  confidence: z.number(),
  reason: z.string(),
});

const SYSTEM_PROMPT = `Sei il selettore di motore di routing per un'app di itinerari in moto.
Scegli quale engine self-hosted usare per una specifica richiesta di percorso:
- "graphhopper": robusto, ottimo per percorsi curvy con custom model, default affidabile.
- "valhalla": profilo motorcycle nativo, buono su percorsi lunghi e tornanti, può essere meno stabile.
Ricevi un contesto JSON con: stile percorso, area, ora del giorno, salute recente e latenze globali dei due engine, se Valhalla è configurato, e bboxQuality (storico qualità 24h dei due engine NELLA stessa zona geografica della richiesta: success/failure, avgLatencyMs, avgScore — score qualità più alto = percorso migliore).
Regole:
- Se valhallaConfigured è false, scegli SEMPRE graphhopper con confidence alta.
- Dai priorità a bboxQuality quando ha dati: nella stessa zona preferisci l'engine con avgScore più alto e meno failure; è il segnale più rilevante.
- In assenza di dati bbox, usa la salute globale: preferisci l'engine con meno failure/fallback (non down) e latenza più bassa.
- Per stile "curvy"/"extra_curvy" Valhalla è spesso preferibile SE sano; per "fast"/"balanced" GraphHopper è una scelta sicura.
- Imposta confidence < 0.6 quando i due engine sono equivalenti o i dati (globali e bbox) sono insufficienti: attiverà il confronto a doppia route.
Rispondi SOLO con: engine, confidence (0..1), reason (breve, in italiano).`;

/** True se la modalità AI è attiva (legge il raw setting, non resolveRoutingEngine). */
export async function isAiRoutingMode(): Promise<boolean> {
  try {
    const { storage } = await import("../storage");
    const row = await storage.getAppSetting("maps_routing_engine");
    return row?.value === "ai";
  } catch {
    return false;
  }
}

/** Costruisce il contesto per il modello dai segnali runtime in-memory. */
export function buildAiRoutingContext(points: [number, number][], style: string): AiRoutingContext {
  const counters = getRoutingCounters();
  const latencies = getRecentLatencies();
  const lats = points.map((p) => p[1]).filter((n) => Number.isFinite(n));
  const lons = points.map((p) => p[0]).filter((n) => Number.isFinite(n));
  const centerLat = lats.length ? lats.reduce((a, b) => a + b, 0) / lats.length : 0;
  const centerLon = lons.length ? lons.reduce((a, b) => a + b, 0) / lons.length : 0;
  const bboxKey = bboxKeyOf(centerLat, centerLon);

  const engineHealth: AiRoutingContext["engineHealth"] = {};
  for (const e of AI_CANDIDATE_ENGINES) {
    const c = counters.byEngine[e] ?? { success: 0, fallback: 0, failure: 0 };
    engineHealth[e] = { success: c.success, fallback: c.fallback, failure: c.failure, down: counters.enginesDown[e] != null };
  }

  return {
    style,
    area: { centerLat: Math.round(centerLat * 1000) / 1000, centerLon: Math.round(centerLon * 1000) / 1000 },
    bboxKey,
    hourOfDay: new Date().getHours(),
    valhallaConfigured: Boolean(process.env.VALHALLA_URL),
    engineHealth,
    recentLatencyMs: {
      graphhopper: latencies.graphhopper ?? null,
      valhalla: latencies.valhalla ?? null,
    },
    bboxQuality: getBboxEngineQuality(bboxKey),
  };
}

function clampConfidence(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/**
 * Chiede al modello l'engine ottimale. Garantisce di non bloccare oltre
 * timeoutMs: scaduto il tempo, aborta la richiesta e ritorna null così il
 * chiamante ricade sul selettore normale.
 */
export async function decideEngineWithAI(
  ctx: AiRoutingContext,
  timeoutMs = 800,
): Promise<AiEngineDecision | null> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const timeoutPromise = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve(null);
    }, timeoutMs);
  });

  const aiPromise = (async (): Promise<AiEngineDecision | null> => {
    try {
      const { value, model } = await runWithFallback({ role: "router" }, (mm) =>
        mm.scheduler(() =>
          generateObject({
            model: mm.model,
            schema: decisionSchema,
            system: SYSTEM_PROMPT,
            prompt: JSON.stringify(ctx),
            temperature: 0,
            abortSignal: controller.signal,
            ...(mm.objectMode ? { mode: mm.objectMode } : {}),
          }),
        ),
      );
      return {
        engine: value.object.engine,
        confidence: clampConfidence(value.object.confidence),
        reason: value.object.reason,
        provider: model.providerName,
      };
    } catch (err) {
      console.warn("[ai-engine-decider] decisione AI fallita:", (err as Error)?.message ?? err);
      return null;
    }
  })();

  const result = await Promise.race([aiPromise, timeoutPromise]);
  if (timer) clearTimeout(timer);
  return result;
}
