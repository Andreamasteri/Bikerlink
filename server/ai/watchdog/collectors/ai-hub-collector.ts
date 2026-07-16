// Collector ai-hub (Task #153) — probe HTTP verso {AI_HUB_URL}/health.
//
// L'ai-hub gira sul ThinkCentre (pm2, porta 4405) ed è esposto via il
// thinkcentre-agent (reverse-proxy /ai-hub/* dentro l'agente, NON nginx).
// La probe usa hubGet() — che include automaticamente X-Hub-Gate-Token e
// CF Access headers — per rispettare il gate token dell'hub. Una probe con
// solo CF Access (nessun gate token) riceverebbe 401 e markerebbe l'hub come
// irraggiungibile falsamente. Questa probe:
//   - salta silenziosamente (info) se l'hub non è configurato o se il TC è
//     spento/in manutenzione (nessun allarme atteso in quei casi);
//   - marca `setHubReachable(true/false)` in ai-hub-client, così isHubAvailable()
//     usato dai tool degrada con grazia senza tentare la rete;
//   - emette `ai_hub.unreachable` con severity "high" solo dopo N=3 fallimenti
//     consecutivi (prima "warn"), come il collector DragonflyDB.
//
// Naming interno: source "ai_hub" (vedi server/ai/watchdog/types.ts); l'id del
// problema diventa `ai_hub.ai_hub.unreachable` in deriveProblems.
import type { Signal } from "../types";
import { AI_HUB_PING_WARN_MS, hubGet, isHubConfigured, setHubReachable } from "../../../lib/ai-hub-client";
import { isThinkCentrePoweredOff } from "../../../lib/thinkcentre-powered-off";
import { isThinkCentreInMaintenance } from "../../../lib/thinkcentre-maintenance";

const FAILURES_BEFORE_HIGH = 3;

// Contatore fallimenti consecutivi — azzerato a ogni probe riuscita.
let consecutiveFailures = 0;
// True dopo la prima probe riuscita in questa sessione: l'escalation a "high"
// richiede che l'hub fosse stato raggiungibile in precedenza.
let hadSuccessfulProbe = false;

export async function collectAiHub(): Promise<Signal[]> {
  const signals: Signal[] = [];

  if (!isHubConfigured()) {
    signals.push({
      source: "ai_hub", metric: "ai_hub.absent", severity: "info",
      details: { reason: "AI_HUB_URL / AI_HUB_GATE_TOKEN non impostati" },
    });
    return signals;
  }

  // TC spento: l'hub è ospitato sul TC, quindi se il TC è spento l'hub è
  // certamente irraggiungibile. Marchiamo esplicitamente setHubReachable(false)
  // per evitare che il flag ottimistico di boot ("true") faccia credere al tile
  // che l'hub sia raggiungibile prima che una vera probe sia mai girata.
  // Non emettiamo segnali di allarme (nessun allarme atteso per TC spento).
  if (await isThinkCentrePoweredOff().catch(() => false)) {
    setHubReachable(false);
    return signals;
  }
  // In manutenzione: skip senza allarmi, ma lo stato rimane quello dell'ultima probe.
  if (await isThinkCentreInMaintenance().catch(() => false)) return signals;

  // hubGet include automaticamente X-Hub-Gate-Token + CF Access headers (8s timeout).
  // NON usare fetch diretto: senza X-Hub-Gate-Token l'hub risponde 401 e la probe
  // segnerebbe l'hub come irraggiungibile falsamente (task #153 review feedback).
  const started = Date.now();
  const result = await hubGet("/health");
  const latencyMs = Date.now() - started;

  // hubGet ritorna { ok:true, data:{ok,service,...} } su 2xx, { ok:false, ... } su errori.
  // Controlliamo anche data.ok per distinguere una risposta 2xx malformata.
  const healthy = result.ok && (result.data as { ok?: boolean } | undefined)?.ok !== false;

  if (healthy) {
    hadSuccessfulProbe = true;
    consecutiveFailures = 0;
    setHubReachable(true);
    signals.push({
      source: "ai_hub", metric: "ai_hub.ping_ms", value: latencyMs, unit: "ms",
      // Soglia in lockstep con NADIR_SEARCH_TIMEOUT_MS (Task #235): warn scatta
      // 500ms prima del timeout /nadir/search, così la GPU lenta è visibile
      // nelle metriche prima che gli utenti vedano il fallback pgvector.
      severity: latencyMs > AI_HUB_PING_WARN_MS ? "warn" : "info",
    });
  } else {
    consecutiveFailures += 1;
    setHubReachable(false);
    const errorMsg = result.error ?? (result.status ? `HTTP ${result.status}` : "unreachable");
    const severity = !hadSuccessfulProbe
      ? "warn"
      : consecutiveFailures >= FAILURES_BEFORE_HIGH ? "high" : "warn";
    signals.push({
      source: "ai_hub", metric: "ai_hub.unreachable", severity,
      details: {
        error: errorMsg,
        consecutiveFailures,
        fallback: "tool TC ai-hub disabilitati (isHubAvailable=false)",
      },
    });
  }
  return signals;
}
