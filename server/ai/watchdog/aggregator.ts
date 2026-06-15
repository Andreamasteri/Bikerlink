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
import { collectPool } from "./collectors/pool-collector";
import { recordSignals } from "./signals";
import type { HealthSnapshot, Problem, Severity, Signal } from "./types";
import { collectDbIntegrity } from "../db-integrity/collector";
import { storage } from "../../storage";
import type { EmbeddingDailyReport } from "../../jobs/embedding-daily-report";

// Task #2536 — wrapper che traduce lo snapshot db-integrity in Signal[] per
// l'aggregator. Mappa severity → watchdog severity (info/warn/high/critical).
async function collectDbIntegritySignals(): Promise<Signal[]> {
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

async function collectEmbeddingSignals(): Promise<Signal[]> {
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

const SEVERITY_WEIGHT: Record<Severity, number> = { info: 0, warn: 5, high: 18, critical: 40 };

function deriveProblems(signals: Signal[]): Problem[] {
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
      } else {
        const ticks = det?.consecutiveWaiting ?? 2;
        title = `Pool DB sotto pressione: ${s.value} client in attesa da ${ticks} tick consecutivi`;
        suggestion = "Possibile accumulo di query lente o leak di connessioni. Verifica pg_stat_activity e monitora.";
      }
    } else if (s.metric === "db.pool.collector.error") {
      title = `Errore probe pool DB`;
      suggestion = "Verifica che pool sia correttamente inizializzato e accessibile dal collector.";
    } else if (s.metric === "server.restart_alert") {
      const count = s.value ?? 1;
      const det = s.details as { minutesSinceLast?: number; latestAt?: string } | undefined;
      const minAgo = det?.minutesSinceLast ?? "?";
      title = count >= 2
        ? `Server riavviato ${count} volte di recente (ultimo: ${minAgo} min dopo il boot precedente)`
        : `Server riavviato inaspettatamente (${minAgo} min dopo il boot precedente)`;
      suggestion = "Possibile crash loop o deploy ripetuto. Verifica i log di avvio e Sentry.";
    }
    problems.push({
      id, severity: s.severity, source: s.source, title, suggestion,
      detail: s.details ? JSON.stringify(s.details).slice(0, 300) : undefined,
    });
  }
  return problems;
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

let latest: HealthSnapshot | null = null;
const subscribers = new Set<(s: HealthSnapshot) => void>();

export function getLatestSnapshot(): HealthSnapshot | null { return latest; }
export function subscribeSnapshot(cb: (s: HealthSnapshot) => void): () => void {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}

export async function runAggregatorCycle(): Promise<HealthSnapshot> {
  const collectors = await Promise.allSettled([
    collectBullMq(), collectScheduler(), collectDb(),
    collectRedis(), collectLatency(), collectErrors(),
    collectDbIntegritySignals(), collectMaps(),
    collectEmbeddingSignals(), collectRestarts(),
    Promise.resolve(collectPool()),
  ]);
  const signals: Signal[] = [];
  for (const r of collectors) {
    if (r.status === "fulfilled") signals.push(...r.value);
    else signals.push({ source: "app", metric: "collector.crash", severity: "warn", details: { error: String(r.reason) } });
  }
  // persisti solo signals non-info (ridurre noise nel DB)
  await recordSignals(signals.filter((s) => s.severity !== "info"));

  const problems = deriveProblems(signals);
  const { status, score } = computeStatus(problems);
  const metrics: Record<string, number> = {};
  for (const s of signals) if (typeof s.value === "number") metrics[`${s.source}.${s.metric}`] = s.value;

  const snap: HealthSnapshot = {
    status, score, problems, metrics, generatedAt: new Date().toISOString(),
  };
  latest = snap;
  // persist snapshot (best-effort)
  try {
    await db.insert(systemHealthSnapshot).values({
      status, score,
      problems: problems as unknown as typeof systemHealthSnapshot.$inferInsert["problems"],
      metrics: metrics as object,
    });
  } catch (err) {
    console.warn("[watchdog/aggregator] persist snapshot error:", err);
  }
  for (const cb of subscribers) { try { cb(snap); } catch { /* ignore */ } }
  return snap;
}

export async function getRecentSnapshots(limit = 60): Promise<Array<{
  status: string; score: number; createdAt: string;
}>> {
  try {
    const rows = await db.select({
      status: systemHealthSnapshot.status,
      score: systemHealthSnapshot.score,
      createdAt: systemHealthSnapshot.createdAt,
    }).from(systemHealthSnapshot)
      .orderBy(desc(systemHealthSnapshot.createdAt))
      .limit(limit);
    return rows.map((r) => ({
      status: r.status, score: r.score,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
    }));
  } catch {
    return [];
  }
}
