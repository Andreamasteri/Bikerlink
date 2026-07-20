// Task #23 — Collector di CORRETTEZZA del routing (namespace "horus").
//
// Trasforma le sonde di correttezza (routing/geocoding reali + validazione di
// plausibilità) e gli errori recenti dei motori in Signal[] con source="horus".
// deriveProblems costruisce l'id come `${source}.${metric}` → tutti i problemi
// nascono nel namespace `horus.*`, isolato dal resto. Un futuro proposer Horus
// (Task #25) filtrerà per `p.id.startsWith("horus.")`; QUI non si generano proposte.
import type { Signal } from "../types";
import { runRoutingCorrectnessProbes, type CorrectnessProbeResult } from "../routing-correctness-probes";
import { getHistory } from "../../../routes/admin/thinkcentre-health-utils";
import { logger } from "../../../lib/logger";

const log = logger.child({ scope: "horus-watchdog", collector: "routing-correctness" });

/** Mappa un esito sonda su un Signal `horus.*`. */
function probeToSignal(metric: string, r: CorrectnessProbeResult, recentErrors?: Array<{ timestamp: number; error: string }>): Signal {
  // Sonda non configurata o saltata (TC spento/manutenzione) → info, nessun allarme.
  const severity: Signal["severity"] =
    !r.configured || r.skipped ? "info" : r.ok ? "info" : r.severity;
  return {
    source: "horus",
    metric,
    value: r.latencyMs ?? null,
    unit: r.latencyMs != null ? "ms" : null,
    severity,
    details: {
      configured: r.configured,
      reachable: r.reachable,
      plausible: r.plausible,
      ok: r.ok,
      skipped: r.skipped,
      reason: r.reason,
      distanceKm: r.distanceKm,
      durationMin: r.durationMin,
      ...(r.detail ?? {}),
      ...(recentErrors && recentErrors.length > 0
        ? { recentErrors: recentErrors.slice(0, 3).map((e) => ({ at: new Date(e.timestamp).toISOString(), error: e.error.slice(0, 160) })) }
        : {}),
    },
  };
}

// Task #952 — Latch per il segnale di recupero plausibilità routing.
// Tracciamo quale engine aveva una sonda non-plausibile al ciclo precedente
// così il segnale ".recovered" viene emesso SOLO sulla transizione failing→ok
// (non ad ogni ciclo ok), riducendo il numero di metric info nel snapshot.
const prevRoutingFailing = new Map<string, boolean>();

export async function collectRoutingCorrectness(): Promise<Signal[]> {
  const signals: Signal[] = [];
  try {
    const results = await runRoutingCorrectnessProbes();
    const byEngine = new Map(results.map((r) => [r.engine, r]));

    const gh = byEngine.get("graphhopper");
    const valhalla = byEngine.get("valhalla");
    const photon = byEngine.get("photon");
    const pipeline = byEngine.get("pipeline");

    if (gh) {
      signals.push(probeToSignal("routing.graphhopper.correct", gh, safeHistory("graphhopper")));
      // Task #952 — emette il segnale di recupero sulla transizione failing→ok.
      // Il segnale è "info" (non crea un Problem): alerts.ts lo legge dai metrics
      // e invia la push "all-clear" solo se il latch start era armato.
      const wasFailing = prevRoutingFailing.get("graphhopper") ?? false;
      const isOkNow = gh.configured && !gh.skipped && gh.ok;
      if (wasFailing && isOkNow) {
        signals.push({
          source: "horus",
          metric: "routing.graphhopper.correct.recovered",
          value: gh.latencyMs ?? null,
          unit: gh.latencyMs != null ? "ms" : null,
          severity: "info",
          details: { recovered: true, latencyMs: gh.latencyMs },
        });
      }
      prevRoutingFailing.set("graphhopper", gh.configured && !gh.skipped && !gh.ok);
    }

    if (valhalla) {
      signals.push(probeToSignal("routing.valhalla.correct", valhalla, safeHistory("valhalla")));
      // Task #952 — stessa logica del blocco GH per Valhalla.
      const wasFailing = prevRoutingFailing.get("valhalla") ?? false;
      const isOkNow = valhalla.configured && !valhalla.skipped && valhalla.ok;
      if (wasFailing && isOkNow) {
        signals.push({
          source: "horus",
          metric: "routing.valhalla.correct.recovered",
          value: valhalla.latencyMs ?? null,
          unit: valhalla.latencyMs != null ? "ms" : null,
          severity: "info",
          details: { recovered: true, latencyMs: valhalla.latencyMs },
        });
      }
      prevRoutingFailing.set("valhalla", valhalla.configured && !valhalla.skipped && !valhalla.ok);
    }

    if (photon) signals.push(probeToSignal("geocoding.photon.correct", photon, safeHistory("photon")));
    if (pipeline) signals.push(probeToSignal("pipeline.correct", pipeline));
    // area_resolver: errore SQL nella fase pre-GH — segnale separato per non
    // gonfiare horus.routing.graphhopper.correct con falsi positivi.
    const areaResolver = byEngine.get("area_resolver");
    if (areaResolver) signals.push(probeToSignal("routing.area_resolver.error", areaResolver));
  } catch (err) {
    signals.push({
      source: "horus", metric: "collector.error", severity: "warn",
      details: { stage: "correctness_probes", error: (err as Error).message?.slice(0, 200) },
    });
  }

  log.debug({ signals: signals.length }, "routing-correctness collector cycle done");
  return signals;
}

/** getHistory è in-memory e non lancia, ma restiamo difensivi. */
function safeHistory(key: string): Array<{ timestamp: number; error: string }> {
  try {
    return getHistory(key);
  } catch {
    return [];
  }
}
