// Task #2533 — Aggregator: raccoglie tutti i signals, calcola HealthSnapshot
// (status verde/giallo/arancio/rosso + score 0..100 + problems[]), persiste
// snapshot + signals, espone "latest" in-memory per consumer realtime.
import { db } from "../../db";
import { systemHealthSnapshot } from "@shared/db";
import { desc } from "drizzle-orm";
import { collectBullMq } from "./collectors/bullmq-collector";
import { collectScheduler } from "./collectors/scheduler-collector";
import { collectDb } from "./collectors/db-collector";
import { collectRedis } from "./collectors/redis-collector";
import { collectLatency } from "./collectors/latency-collector";
import { collectErrors } from "./collectors/error-collector";
import { collectMaps } from "./collectors/maps-collector";
import { collectRestarts } from "./collectors/restart-collector";
import { collectCrashSignals } from "./collectors/crash-signals-collector";
import { collectPool } from "./collectors/pool-collector";
import { recordSignals } from "./signals";
import type { HealthSnapshot, Problem, Severity, Signal } from "./types";
import { collectDbIntegrity } from "../db-integrity/collector";
import { storage } from "../../storage";
import { withBgDbSlot } from "../../lib/bg-db-limiter";
import { isThinkCentrePoweredOff } from "../../lib/thinkcentre-powered-off";
import type { EmbeddingDailyReport } from "../../jobs/embedding-daily-report";

// Task #2536 — wrapper che traduce lo snapshot db-integrity in Signal[] per
// l'aggregator. Mappa severity → watchdog severity (info/warn/high/critical).
export async function collectDbIntegritySignals(): Promise<Signal[]> {
  try {
    const snap = await collectDbIntegrity();
    if (!snap.hasRun) return [];
    const out: Signal[] = [];
    if (snap.bySeverity.critical > 0) {
      out.push({ source: "db", metric: "db_integrity.critical_violations",
        severity: "critical", value: snap.bySeverity.critical,
        details: { samples: snap.criticalSamples, lastRunAt: snap.lastRunAt } });
    }
    if (snap.bySeverity.high > 0) {
      out.push({ source: "db", metric: "db_integrity.high_violations",
        severity: "high", value: snap.bySeverity.high });
    }
    if (snap.bySeverity.medium > 0) {
      out.push({ source: "db", metric: "db_integrity.medium_violations",
        severity: "warn", value: snap.bySeverity.medium });
    }
    return out;
  } catch (err) {
    return [{ source: "db", metric: "collector.error", severity: "warn",
      details: { collector: "db-integrity", error: (err as Error).message?.slice(0, 200) } }];
  }
}

// Collector per immagini pubblicitarie orfane. Legge il risultato dell'ultimo
// run di cleanupOrphanAdImages (persistito come AppSetting "ads_orphan_last_cleanup"
// dalla campaigns-self-check) e confronta il conteggio degli orfani con la soglia
// configurabile "ads_orphan_alert_threshold" (default 10). Se superata, emette un
// segnale "high" che il proposer AI leggerà al prossimo tick.
//
// Edge-trigger: il segnale è emesso solo una volta per ogni run di cleanup
// (identificato da "runAt"). Se il collector viene richiamato tra un cleanup e
// l'altro, i dati stantii non riproducono il segnale, evitando proposer spam.
let lastAdsOrphanAlertedRunAt: string | null = null;

export async function collectAdsOrphanSignals(): Promise<Signal[]> {
  try {
    const lastCleanup = await storage.getAppSetting("ads_orphan_last_cleanup");
    if (!lastCleanup?.valueJson) return [];
    const data = lastCleanup.valueJson as {
      scanned?: number; orphans?: number; deleted?: number; errors?: number; runAt?: string;
    };
    const orphans = typeof data.orphans === "number" ? data.orphans : 0;
    const runAt = data.runAt ?? null;

    if (orphans <= 0) return [];

    const thresholdSetting = await storage.getAppSetting("ads_orphan_alert_threshold");
    const threshold = thresholdSetting?.value
      ? Math.max(1, parseInt(thresholdSetting.value, 10) || 10)
      : 10;
    if (orphans <= threshold) return [];

    // Deduplication: non emettere lo stesso run più di una volta.
    if (runAt && runAt === lastAdsOrphanAlertedRunAt) return [];
    lastAdsOrphanAlertedRunAt = runAt;

    return [{
      source: "app",
      metric: "ads_orphan_images_high_count",
      value: orphans,
      unit: "files",
      severity: "high",
      details: {
        scanned: data.scanned ?? null,
        orphans,
        deleted: data.deleted ?? null,
        errors: data.errors ?? null,
        threshold,
        runAt,
        hint: "Possibile bug a monte nel guard upload o nella cancellazione parziale delle campagne pubblicitarie.",
      },
    }];
  } catch (err) {
    return [{ source: "app", metric: "collector.error", severity: "warn",
      details: { collector: "ads-orphan", error: (err as Error).message?.slice(0, 200) } }];
  }
}

export async function collectEmbeddingSignals(): Promise<Signal[]> {
  try {
    const setting = await storage.getAppSetting("embedding_daily_report");
    if (!setting?.valueJson) return [];
    const report = setting.valueJson as EmbeddingDailyReport;
    const out: Signal[] = [];
    if (report.anomaly) {
      out.push({
        source: "embedding",
        metric: "embedding.anomaly",
        severity: "high",
        value: report.today.apiCalls,
        details: {
          reason: report.anomalyReason,
          weeklyAvg: report.weeklyAvgApiCalls,
          generatedAt: report.generatedAt,
        },
      });
    }
    if (report.today?.capReached) {
      out.push({
        source: "embedding",
        metric: "embedding.cap_reached",
        severity: "warn",
        value: report.today.apiCalls,
        details: { generatedAt: report.generatedAt },
      });
    }
    return out;
  } catch (err) {
    return [{ source: "embedding", metric: "collector.error", severity: "warn",
      details: { collector: "embedding", error: (err as Error).message?.slice(0, 200) } }];
  }
}

export const SEVERITY_WEIGHT: Record<Severity, number> = { info: 0, warn: 5, high: 18, critical: 40 };

export function deriveProblems(signals: Signal[]): Problem[] {
  const problems: Problem[] = [];
  for (const s of signals) {
    if (s.severity === "info") continue;
    const id = `${s.source}.${s.metric}`;
    let title = s.metric;
    let suggestion: string | undefined;
    if (s.metric.startsWith("queue.") && s.metric.endsWith(".waiting")) {
      title = `Coda ${s.metric.split(".")[1]} congestionata (${s.value} job)`;
      suggestion = "Considera aumento concorrenza worker o restart job stuck.";
    } else if (s.metric.startsWith("queue.") && s.metric.endsWith(".failed")) {
      title = `Coda ${s.metric.split(".")[1]} con ${s.value} job falliti`;
      suggestion = "Verifica errori job, eventualmente rilancia o purga.";
    } else if (s.metric === "scheduler.last_run_min_ago") {
      title = `Scheduler matching: ultimo run ${s.value ?? "?"} min fa`;
      suggestion = "Verifica engine matching, eventualmente restart ciclo.";
    } else if (s.metric === "scheduler.lock_age_min") {
      title = `Lock matching attivo da ${s.value} min`;
      suggestion = "Possibile lock zombie: rilascia lock e fai partire un nuovo ciclo.";
    } else if (s.metric === "db.ping_ms") {
      title = `DB ping lento: ${s.value}ms`;
    } else if (s.metric === "db.connections.active") {
      title = `DB connessioni attive alte: ${s.value}`;
      suggestion = "Riduci pool client o investiga query lente.";
    } else if (s.metric === "db.slow_queries") {
      title = `${s.value} query lente (>500ms medi)`;
    } else if (s.metric === "redis.unreachable") {
      const cf = (s.details as { consecutiveFailures?: number } | undefined)?.consecutiveFailures ?? 1;
      title = `Redis non raggiungibile — fallback in-memory attivo (${cf} fallimenti consecutivi)`;
      suggestion = "Fallback in-memory attivo: il matching continua a funzionare. Verifica REDIS_URL e stato del servizio per ripristinare il distributed lock.";
    } else if (s.metric === "latency.p95_ms" || s.metric === "latency.p99_ms") {
      title = `Latenza API ${s.metric}: ${s.value}ms`;
    } else if (s.metric === "http.5xx_per_min") {
      title = `Errori 5xx: ${Number(s.value).toFixed(2)}/min`;
      suggestion = "Controlla logs server e Sentry.";
    } else if (s.metric === "client.crashes_1h") {
      title = `${s.value} crash client nell'ultima ora`;
    } else if (s.metric === "collector.error") {
      title = `Errore collector ${s.source}`;
    } else if (s.metric === "client.webview_crash_5min") {
      title = `Crash mappa WebView: ${s.value} negli ultimi 5 min`;
      suggestion = "Verifica renderer più colpito e log lato client.";
    } else if (s.metric === "client.tile_load_error_5min") {
      title = `Errori caricamento tile: ${s.value}/5min`;
      suggestion = "Possibile provider tile down o problema rete.";
    } else if (s.metric === "client.map_init_failed_5min") {
      title = `Init mappa fallita: ${s.value}/5min`;
      suggestion = "Bundle WebView corrotto o stile MapLibre invalido.";
    } else if (s.metric === "client.gps_lost_5min") {
      title = `GPS perso su ${s.value} dispositivi (5 min)`;
    } else if (s.metric === "client.render_avg_ms") {
      title = `Render mappa lento: ${s.value}ms (media)`;
    } else if (s.metric === "client.routing_failed_5min") {
      title = `Routing fallito ${s.value} volte (5 min)`;
    } else if (s.metric === "routing.fallback_rate") {
      const pct = Math.round(Number(s.value) * 100);
      title = `Routing fallback rate ${pct}%`;
      suggestion = "Engine primario in difficoltà — controlla GraphHopper/Valhalla.";
    } else if (s.metric.startsWith("routing.engine_down.")) {
      const engine = s.metric.split(".")[2];
      title = `Routing engine ${engine} down da ${s.value} min`;
      suggestion = `Verifica salute ${engine} e quota. Fallback su GraphHopper attivo.`;
    } else if (s.metric === "quota.mapbox" || s.metric === "quota.tomtom") {
      const provider = s.metric.split(".")[1];
      title = `Quota ${provider} al ${s.value}%`;
      suggestion = "Considera passare a engine self-hosted per il resto del mese.";
    } else if (s.metric.startsWith("health.tile.")) {
      const tile = s.metric.split(".")[2];
      title = `Tile provider ${tile} non raggiungibile`;
      suggestion = "Verifica disponibilità CDN tile e fallback configurato.";
    } else if (s.metric === "health.network_instability") {
      const det = s.details as { engines?: string[]; description?: string } | undefined;
      const engineList = det?.engines?.join(", ") ?? "sconosciuti";
      title = `Instabilità di rete: ${s.value} engine irraggiungibili (${engineList})`;
      suggestion = "Verifica connettività Replit. Se ThinkCentre è offline, usa powered-off mode per sopprimere i relativi alert.";
    } else if (s.metric.startsWith("health.engine.")) {
      const engine = s.metric.split(".")[2];
      title = `Routing engine ${engine} health-check KO`;
      suggestion = `Pinga manualmente ${engine}, verifica DNS/firewall.`;
    } else if (s.metric === "matching.last_run_h") {
      title = `Map-matching: ultimo run ${s.value}h fa`;
    } else if (s.metric === "matching.pending") {
      title = `Map-matching pending: ${s.value} rides`;
    } else if (s.metric === "embedding.anomaly") {
      title = `Consumo embedding anomalo: ${s.value} API call oggi`;
      suggestion = (s.details as { reason?: string })?.reason ??
        "Verifica embedding_call_log per field con spike inatteso.";
    } else if (s.metric === "embedding.cap_reached") {
      title = `Cap embedding giornaliero raggiunto (${s.value} call)`;
      suggestion = "Embedding API call bloccate fino a mezzanotte. Aumenta il cap o verifica spike.";
    } else if (s.metric === "db.pool.waiting") {
      const det = s.details as { total?: number; idle?: number; max?: number; consecutiveWaiting?: number } | undefined;
      if (s.severity === "critical") {
        title = `Pool DB esaurito: ${s.value} client in attesa (max=${det?.max ?? 10})`;
        suggestion = "Il pool è completamente saturo. Controlla query lente/lock e valuta di aumentare pool.max o ridurre la concorrenza.";
      } else if (s.severity === "high") {
        const ticks = det?.consecutiveWaiting ?? 3;
        title = `Pool DB sotto forte pressione: ${s.value} client in attesa da ${ticks} tick consecutivi`;
        suggestion = "Pressione persistente sul pool. Probabile accumulo di query lente o leak di connessioni: verifica pg_stat_activity e valuta di ridurre la concorrenza dei job interni.";
      } else {
        const ticks = det?.consecutiveWaiting ?? 2;
        title = `Pool DB sotto pressione: ${s.value} client in attesa da ${ticks} tick consecutivi`;
        suggestion = "Possibile accumulo di query lente o leak di connessioni. Verifica pg_stat_activity e monitora.";
      }
    } else if (s.metric === "db.bg_limiter.queued") {
      const det = s.details as { active?: number; max?: number; consecutiveQueued?: number } | undefined;
      const ticks = det?.consecutiveQueued ?? 0;
      if (s.severity === "high") {
        title = `Limiter job DB in background congestionato: ${s.value} job in coda da ${ticks} campioni consecutivi`;
        suggestion = "I job in background restano in coda per uno slot DB: il budget riservato è saturo a lungo, segnale di pressione persistente sul pool. Verifica query lente/lock e la concorrenza dei job interni.";
      } else {
        title = `Limiter job DB in background: ${s.value} job in coda (${ticks} campioni)`;
        suggestion = "Accumulo temporaneo di job in background in attesa di uno slot connessione. Monitora.";
      }
    } else if (s.metric === "db.bg_limiter.collector.error") {
      title = `Errore probe limiter job DB`;
      suggestion = "Verifica che bg-db-limiter sia accessibile dal collector.";
    } else if (s.metric === "db.circuit_breaker") {
      const det = s.details as { state?: string; openedAt?: string } | undefined;
      const cbState = det?.state ?? "OPEN";
      if (cbState === "OPEN") {
        title = `Circuit breaker DB APERTO — richieste bloccate (${s.value} fallimenti consecutivi)`;
        suggestion = "Il DB ha superato la soglia di fallimenti. Le API restituiscono 503. Verifica connettività DB e attendi il reset automatico (30s).";
      } else {
        title = `Circuit breaker DB in HALF_OPEN — verifica in corso`;
        suggestion = "Il circuito si sta riaprendo dopo il timeout. La prossima query buona lo chiuderà.";
      }
    } else if (s.metric === "db.ping_saturated") {
      title = `Ping DB non eseguito: pool saturo`;
      suggestion = "Il SELECT 1 non ha ottenuto una connessione perché il pool è saturo (non perché il DB è giù). Il circuit breaker NON è stato aperto; le richieste utente degradano con 503 veloce. Verifica la pressione sul pool e i job concorrenti.";
    } else if (s.metric === "db.pool.collector.error") {
      title = `Errore probe pool DB`;
      suggestion = "Verifica che pool sia correttamente inizializzato e accessibile dal collector.";
    } else if (s.metric === "ads_orphan_images_high_count") {
      const det = s.details as { orphans?: number; threshold?: number; runAt?: string } | undefined;
      title = `Immagini pubblicitarie orfane: ${s.value} file trovati (soglia: ${det?.threshold ?? 10})`;
      suggestion = "Possibile bug a monte nel guard upload o nella cancellazione parziale delle campagne. Verifica cleanup-orphan-images e il flusso di cancellazione campagna.";
    } else if (s.metric === "server.restart_alert") {
      const count = s.value ?? 1;
      const det = s.details as { minutesSinceLast?: number; latestAt?: string } | undefined;
      const minAgo = det?.minutesSinceLast ?? "?";
      title = count >= 2
        ? `Server riavviato ${count} volte di recente (ultimo: ${minAgo} min dopo il boot precedente)`
        : `Server riavviato inaspettatamente (${minAgo} min dopo il boot precedente)`;
      suggestion = "Possibile crash loop o deploy ripetuto. Verifica i log di avvio e Sentry.";
    } else if (s.metric.startsWith("crash_signal.")) {
      const det = s.details as {
        label?: string; total?: number; distinctUsers?: number; windowH?: number;
      } | undefined;
      const label = det?.label ?? s.metric.split(".")[1];
      const users = det?.distinctUsers ?? "?";
      const windowH = det?.windowH ?? 2;
      title = `Segnale client "${label}": ${s.value} eventi da ${users} utenti (${windowH}h)`;
      suggestion = s.severity === "high"
        ? `Alto volume di "${label}" rilevato. Verifica i crash log e filtra per questo tipo nel pannello diagnostici.`
        : `Frequenza anomala di "${label}" rilevata. Monitora la tendenza nei crash log.`;
    }
    problems.push({
      id, severity: s.severity, source: s.source, title, suggestion,
      detail: s.details ? JSON.stringify(s.details).slice(0, 300) : undefined,
    });
  }
  return problems;
}

// Problemi che sono CONSEGUENZA diretta del ThinkCentre offline — lista
// ESPLICITA e ristretta, mai per prefisso (un prefisso largo sopprimerebbe anche
// guasti indipendenti):
//  - Redis non raggiungibile (self-hosted sul ThinkCentre);
//  - backlog map-matching che cresce perché GraphHopper non risponde;
//  - routing engine SELF-HOSTED down (graphhopper/valhalla). I cloud engine
//    (mapbox/tomtom) sono ESCLUSI: un loro down è indipendente dal ThinkCentre
//    e deve restare azionabile;
//  - pressione del pool conseguente (event-loop ingolfato dalle chiamate lente
//    verso il ThinkCentre → SELECT 1 non ottiene slot, limiter bg in coda);
//  - instabilità di rete (N engine irraggiungibili): con TC spento i self-hosted
//    risultano giù, gonfiando il contatore — il rumore non è azionabile;
//  - DB ping lento (db.db.ping_ms): i job di map-matching girano a vuoto senza
//    GH/Valhalla e saturano il pool → il ping rallenta come effetto collaterale.
// NON inclusi (restano allarmi pieni anche a ThinkCentre spento):
//  - maps.routing.engine_down.mapbox/tomtom (cloud, indipendenti dall'outage);
//  - db.db.circuit_breaker (DB realmente giù — sempre azionabile).
const OUTAGE_DOWNSTREAM_IDS = new Set<string>([
  "redis.redis.unreachable",
  "maps.matching.pending",
  "maps.routing.engine_down.graphhopper",
  "maps.routing.engine_down.valhalla",
  "db.db.pool.waiting",
  "db.db.ping_saturated",
  "db.db.bg_limiter.queued",
  "maps.health.network_instability",
  "db.db.ping_ms",
]);

function isOutageDownstreamProblem(id: string): boolean {
  return OUTAGE_DOWNSTREAM_IDS.has(id);
}

// Quando il ThinkCentre è in modalità "spento", retrocede i problemi a valle
// dell'outage da critical/high a "warn": restano VISIBILI in dashboard (così
// l'admin sa che ci sono) ma non scatenano escalation critica né push, perché
// sono attesi e non azionabili finché il ThinkCentre è offline.
export function suppressDownstreamWhenPoweredOff(problems: Problem[]): Problem[] {
  return problems.map((p) => {
    if (
      isOutageDownstreamProblem(p.id) &&
      (p.severity === "critical" || p.severity === "high")
    ) {
      return {
        ...p,
        severity: "warn" as Severity,
        title: `${p.title} — soppresso (ThinkCentre spento)`,
        suggestion:
          "Allarme atteso mentre il ThinkCentre è in modalità spento: escalation e push soppresse, ma il problema resta visibile in dashboard. Riaccendi il ThinkCentre o disattiva la modalità powered-off per ripristinare gli alert.",
      };
    }
    return p;
  });
}

function computeStatus(problems: Problem[]): { status: HealthSnapshot["status"]; score: number } {
  let penalty = 0;
  for (const p of problems) penalty += SEVERITY_WEIGHT[p.severity] ?? 0;
  const score = Math.max(0, 100 - penalty);
  const status: HealthSnapshot["status"] =
    score >= 90 ? "green" :
    score >= 70 ? "yellow" :
    score >= 40 ? "orange" : "red";
  return { status, score };
}

export { runAggregatorCycle, getRecentSnapshots, getLatestSnapshot, subscribeSnapshot } from "./aggregator.part2";
