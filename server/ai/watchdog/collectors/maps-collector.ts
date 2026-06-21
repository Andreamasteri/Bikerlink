// Task #2686 — Maps collector. Produce Signal[] da:
//  - aggregato eventi telemetria client ultimi 5 min (maps_telemetry_events)
//  - quota Mapbox/TomTom (vicina al limite)
//  - stats map-matching job (last run lontano nel tempo / errori)
//  - health-check tile servers + routing engines (HEAD ping ogni ciclo, lazy)
//  - routing fallback rate (counter in-process da router-selector)
import type { Signal } from "../types";
import { aggregateMapsTelemetry } from "../maps-telemetry-store";
import { isMapsFlagEnabled } from "../maps-kill-switch";
import { checkQuota as checkMapboxQuota } from "../../../routing/mapbox/quota-guard";
import { checkQuota as checkTomTomQuota } from "../../../routing/tomtom/quota-guard";
import { getMatchingBacklogEstimate } from "../../../map-matching-job";
import { getRoutingCounters } from "../../../routing/routing-metrics";
import { runMapsHealthChecks } from "../maps-health-checks";
import { logger } from "../../../lib/logger";
import { withBgDbSlot } from "../../../lib/bg-db-limiter";

/**
 * Rimuove parametri sensibili (es. key=) da URL prima di persistere nei dettagli
 * del segnale. Evita che le API key vengano scritte nel DB/log.
 */
function redactUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.searchParams.has("key")) u.searchParams.set("key", "[REDACTED]");
    return u.toString();
  } catch {
    return url;
  }
}

const log = logger.child({ scope: "maps-watchdog", collector: "maps" });

const WINDOW_MS = 5 * 60_000;

// Soglie configurabili (potrebbero diventare app_settings in futuro).
const TH = {
  webviewCrashCritical: 5,
  webviewCrashWarn: 2,
  tileErrorCritical: 50,
  tileErrorWarn: 10,
  routingFailureRateCritical: 0.5,  // 50%
  routingFailureRateHigh: 0.2,      // 20%
  renderSlowMs: 4000,
  mapInitFailWarn: 3,
  mapInitFailCritical: 10,
  gpsLostCritical: 100,
  gpsLostHigh: 30,
  quotaWarn: 0.85,
  quotaCritical: 0.97,
  mapMatchingStaleHours: 36,
};

export async function collectMaps(): Promise<Signal[]> {
  if (!(await isMapsFlagEnabled("collector"))) {
    return [{ source: "maps", metric: "collector.disabled", severity: "info" }];
  }
  const signals: Signal[] = [];

  // ─── 1. Aggregato eventi telemetria client ────────────────────────────
  try {
    // Query DB sotto il budget cooperativo bg: il collector maps gira fuori dal
    // budget nell'aggregator (fa health-check di rete lenti), ma le sue query DB
    // devono comunque rispettare il limite ≤3 connessioni concorrenti.
    const agg = await withBgDbSlot(() => aggregateMapsTelemetry(WINDOW_MS));
    signals.push({
      source: "maps", metric: "client.events_5min", value: agg.total, unit: "events",
      severity: "info", details: { byEvent: agg.byEvent, uniqueUsers: agg.uniqueUsers },
    });

    const crashes = agg.byEvent["webview_crash"] ?? 0;
    signals.push({
      source: "maps", metric: "client.webview_crash_5min", value: crashes, unit: "crashes",
      severity: crashes >= TH.webviewCrashCritical ? "critical"
              : crashes >= TH.webviewCrashWarn ? "high" : "info",
      details: { byRenderer: agg.byEventRenderer["webview_crash"] },
    });

    const tileErrors = agg.byEvent["tile_load_error"] ?? 0;
    signals.push({
      source: "maps", metric: "client.tile_load_error_5min", value: tileErrors, unit: "errors",
      severity: tileErrors >= TH.tileErrorCritical ? "critical"
              : tileErrors >= TH.tileErrorWarn ? "warn" : "info",
      details: { byRenderer: agg.byEventRenderer["tile_load_error"] },
    });

    const initFails = agg.byEvent["map_init_failed"] ?? 0;
    signals.push({
      source: "maps", metric: "client.map_init_failed_5min", value: initFails, unit: "failures",
      severity: initFails >= TH.mapInitFailCritical ? "critical"
              : initFails >= TH.mapInitFailWarn ? "high" : "info",
      details: { byRenderer: agg.byEventRenderer["map_init_failed"] },
    });

    const renderSlow = agg.byEvent["render_slow"] ?? 0;
    if (renderSlow > 0 && agg.avgRenderMs != null) {
      signals.push({
        source: "maps", metric: "client.render_avg_ms", value: agg.avgRenderMs, unit: "ms",
        severity: agg.avgRenderMs > TH.renderSlowMs ? "warn" : "info",
        details: { samples: agg.totalRenderSamples },
      });
    }

    const gpsLost = agg.byEvent["gps_lost"] ?? 0;
    const gpsDegraded = agg.byEvent["gps_degraded"] ?? 0;
    signals.push({
      source: "maps", metric: "client.gps_lost_5min", value: gpsLost, unit: "events",
      severity: gpsLost >= TH.gpsLostCritical ? "critical"
              : gpsLost >= TH.gpsLostHigh ? "high"
              : gpsLost > 0 ? "warn" : "info",
      details: { degraded: gpsDegraded },
    });

    // Routing failure rate (client-side)
    const routingFails = agg.byEvent["routing_failed"] ?? 0;
    if (routingFails > 0) {
      signals.push({
        source: "maps", metric: "client.routing_failed_5min", value: routingFails, unit: "failures",
        severity: routingFails >= 20 ? "high" : "warn",
        details: { byEngine: agg.byEngineFailure },
      });
    }

    if (agg.topErrors.length) {
      signals.push({
        source: "maps", metric: "client.top_errors", value: agg.topErrors.length,
        severity: "info", details: { topErrors: agg.topErrors },
      });
    }
  } catch (err) {
    signals.push({
      source: "maps", metric: "collector.error", severity: "warn",
      details: { stage: "client_agg", error: (err as Error).message?.slice(0, 200) },
    });
  }

  // ─── 2. Routing counter in-process (fallback rate / engine errors) ──
  try {
    const counters = getRoutingCounters(WINDOW_MS);
    const totalRouting = counters.successes + counters.failures + counters.fallbacks;
    if (totalRouting > 0) {
      const failRate = (counters.failures + counters.fallbacks) / totalRouting;
      signals.push({
        source: "maps", metric: "routing.fallback_rate", value: Number(failRate.toFixed(3)),
        unit: "ratio",
        severity: failRate >= TH.routingFailureRateCritical ? "critical"
                : failRate >= TH.routingFailureRateHigh ? "high"
                : failRate >= 0.05 ? "warn" : "info",
        details: { ...counters },
      });
    } else {
      signals.push({
        source: "maps", metric: "routing.fallback_rate", value: 0, unit: "ratio",
        severity: "info", details: { reason: "no_traffic", ...counters },
      });
    }
    for (const [engine, downSince] of Object.entries(counters.enginesDown)) {
      if (downSince) {
        const ageMin = Math.round((Date.now() - downSince) / 60_000);
        signals.push({
          source: "maps", metric: `routing.engine_down.${engine}`, value: ageMin, unit: "min",
          severity: ageMin >= 15 ? "critical" : "high",
          details: { engine, downSince: new Date(downSince).toISOString() },
        });
      }
    }
  } catch (err) {
    signals.push({
      source: "maps", metric: "collector.error", severity: "warn",
      details: { stage: "routing_counters", error: (err as Error).message?.slice(0, 200) },
    });
  }

  // ─── 3. Quota Mapbox/TomTom ───────────────────────────────────────────
  try {
    const [mbx, ttm] = await Promise.allSettled([checkMapboxQuota(), checkTomTomQuota()]);
    if (mbx.status === "fulfilled") {
      const pct = mbx.value.percent / 100;
      signals.push({
        source: "maps", metric: "quota.mapbox", value: Math.round(pct * 1000) / 10,
        unit: "percent",
        severity: pct >= TH.quotaCritical ? "critical"
                : pct >= TH.quotaWarn ? "high"
                : pct >= 0.5 ? "warn" : "info",
        details: { used: mbx.value.used, limit: mbx.value.limit, resets_at: mbx.value.resets_at },
      });
    }
    if (ttm.status === "fulfilled") {
      const pct = ttm.value.percent / 100;
      signals.push({
        source: "maps", metric: "quota.tomtom", value: Math.round(pct * 1000) / 10,
        unit: "percent",
        severity: pct >= TH.quotaCritical ? "critical"
                : pct >= TH.quotaWarn ? "high"
                : pct >= 0.5 ? "warn" : "info",
        details: { used: ttm.value.used, limit: ttm.value.limit },
      });
    }
  } catch (err) {
    signals.push({
      source: "maps", metric: "collector.error", severity: "warn",
      details: { stage: "quota", error: (err as Error).message?.slice(0, 200) },
    });
  }

  // ─── 4. Map-matching backlog (stima economica) ────────────────────────
  // Task #4706: NON usare getMapMatchingStats() qui (GROUP BY su tutta la tabella
  // ad ogni tick a 60s, contende il pool). getMatchingBacklogEstimate conta solo
  // pending+retry via indice parziale, sotto budget bg + statement_timeout breve,
  // e degrada (backlog -1) senza alzare falsi allarmi quando il DB è lento.
  try {
    const mm = await getMatchingBacklogEstimate();
    const lastRunAt = mm.lastRun ? new Date(mm.lastRun).getTime() : null;
    const ageH = lastRunAt ? Math.round((Date.now() - lastRunAt) / 3_600_000) : null;
    signals.push({
      source: "maps", metric: "matching.last_run_h", value: ageH ?? -1, unit: "h",
      severity: ageH != null && ageH > TH.mapMatchingStaleHours ? "warn" : "info",
      details: {
        lastRun: mm.lastRun,
        pending: mm.pending,
        retry: mm.retry,
        degraded: mm.degraded,
      },
    });
    if (mm.degraded) {
      // Stima non disponibile (DB lento/timeout): segnale info, niente allarme.
      signals.push({
        source: "maps", metric: "matching.pending", value: -1, unit: "rides",
        severity: "info", details: { degraded: true, reason: "estimate_timeout" },
      });
    } else {
      const backlog = mm.backlog;
      signals.push({
        source: "maps", metric: "matching.pending", value: backlog, unit: "rides",
        severity: backlog > 10000 ? "high" : backlog > 2000 ? "warn" : "info",
        details: { pending: mm.pending, retry: mm.retry },
      });
    }
  } catch (err) {
    signals.push({
      source: "maps", metric: "collector.error", severity: "warn",
      details: { stage: "matching", error: (err as Error).message?.slice(0, 200) },
    });
  }

  // ─── 5. Health-check tile servers + routing engines ───────────────────
  try {
    const hc = await runMapsHealthChecks();

    // Correlazione multi-engine: se ≥2 engine falliscono nello stesso ciclo,
    // è probabile un micro-outage di rete, non guasti separati. In quel caso:
    // - i segnali individuali vengono retrocessi a "warn" (ridurre il rumore);
    // - viene aggiunto un segnale aggregato "health.network_instability" high.
    const failedEngines = hc.filter((r) => r.kind === "engine" && !r.ok);
    const networkInstability = failedEngines.length >= 2;

    for (const r of hc) {
      let severity: Signal["severity"] =
        r.ok ? (r.latencyMs && r.latencyMs > 2500 ? "warn" : "info")
             : r.severity ?? "high";

      // Retrocedi il segnale individuale a "warn" in caso di instabilità di rete
      // (il segnale aggregato è già a "high" e contiene il dettaglio completo).
      if (!r.ok && r.kind === "engine" && networkInstability) {
        severity = "warn";
      }

      signals.push({
        source: "maps", metric: `health.${r.kind}.${r.id}`,
        value: r.latencyMs ?? null, unit: "ms",
        severity,
        details: { url: redactUrl(r.url), error: r.error ?? null, statusCode: r.statusCode ?? null },
      });
    }

    if (networkInstability) {
      const engineList = failedEngines.map((r) => r.id).join(", ");
      signals.push({
        source: "maps", metric: "health.network_instability",
        value: failedEngines.length, unit: "engines",
        severity: "high",
        details: {
          engines: failedEngines.map((r) => r.id),
          description: `${failedEngines.length} engine irraggiungibili contemporaneamente: ${engineList}`,
        },
      });
    }
  } catch (err) {
    signals.push({
      source: "maps", metric: "collector.error", severity: "warn",
      details: { stage: "health_check", error: (err as Error).message?.slice(0, 200) },
    });
  }

  log.debug({ signals: signals.length }, "maps collector cycle done");
  return signals;
}
