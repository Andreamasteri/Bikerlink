// Task #2533 — Aggregator: raccoglie tutti i signals, calcola HealthSnapshot
// (status verde/giallo/arancio/rosso + score 0..100 + problems[]), persiste
// snapshot + signals, espone "latest" in-memory per consumer realtime.
//
// === OBSERVABILITY PLANE ===
// L'aggregator OSSERVA la salute dei sottosistemi e la riassume in uno snapshot.
// NON altera lo stato operativo del server: alimenta solo la slice "watchdog"
// (e, via collectDbIntegritySignals, la slice "db-integrity") dell'Health Arbiter
// come input informativo. Il cambio di comportamento operativo resta esclusiva
// del Control Plane (initState, db-circuit-breaker, bg-db-limiter).
import { setHealthState } from "../../lib/health-arbiter";
import type { Problem, Severity, Signal } from "./types";
import { collectDbIntegrity } from "../db-integrity/collector";
import { storage } from "../../storage";
import type { EmbeddingDailyReport } from "../../jobs/embedding-daily-report";

// Task #2536 — wrapper che traduce lo snapshot db-integrity in Signal[] per
// l'aggregator. Mappa severity → watchdog severity (info/warn/high/critical).
export async function collectDbIntegritySignals(): Promise<Signal[]> {
  try {
    const snap = await collectDbIntegrity();
    if (!snap.hasRun) {
      setHealthState("db-integrity", "READY", []);
      return [];
    }
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
    // Observability slice: critical ⇒ BROKEN, high ⇒ DEGRADED, altrimenti READY.
    if (snap.bySeverity.critical > 0) {
      const samples = snap.criticalSamples.map((s) => `${s.checkName} (${s.count})`);
      setHealthState("db-integrity", "BROKEN", [
        `${snap.bySeverity.critical} violazioni critical di integrità DB`,
        ...samples,
      ]);
    } else if (snap.bySeverity.high > 0) {
      setHealthState("db-integrity", "DEGRADED", [
        `${snap.bySeverity.high} violazioni high di integrità DB`,
      ]);
    } else {
      setHealthState("db-integrity", "READY", []);
    }
    return out;
  } catch (err) {
    // Il collector ha fallito: NON lasciare la slice arbiter sul valore precedente
    // (BROKEN/DEGRADED resterebbe latchato all'infinito, oppure un vecchio READY
    // mascherebbe il fatto che non sappiamo più nulla). La degradiamo con una
    // reason esplicita finché un run riuscito non la riporta allo stato reale.
    const msg = (err as Error).message?.slice(0, 200);
    setHealthState("db-integrity", "DEGRADED", [
      `collector db-integrity non disponibile${msg ? `: ${msg}` : ""}`,
    ]);
    return [{ source: "db", metric: "collector.error", severity: "warn",
      details: { collector: "db-integrity", error: msg } }];
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
    // Fase 5 (Task #545) — salta i segnali "derived": evita il feedback loop
    // overload_sustained→problema DB→dbErrorCount→dbOverload→overload_sustained.
    // I segnali derived vengono aggiunti come Problems separatamente da
    // buildDerivedProblems (che non alimenta recordDbMonitorSample).
    if (s.origin === "derived") continue;
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
    } else if (s.metric === "scheduler_heartbeat_dead") {
      title = `Scheduler matching silenzioso da ${s.value ?? "?"}min`;
      suggestion = "Il loop heartbeat (60s) è fermo: processo appeso o timer arrestati. Verifica il backend / riavvia il workflow.";
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
    } else if (s.metric === "dragonfly.unreachable") {
      const cf = (s.details as { consecutiveFailures?: number } | undefined)?.consecutiveFailures ?? 1;
      title = `DragonflyDB non raggiungibile — fallback in-memory attivo (${cf} fallimenti consecutivi)`;
      suggestion = "Fallback in-memory attivo: il matching continua a funzionare. Verifica REDIS_URL e stato del servizio per ripristinare il distributed lock.";
    } else if (s.metric === "ai_hub.unreachable") {
      const cf = (s.details as { consecutiveFailures?: number } | undefined)?.consecutiveFailures ?? 1;
      title = `AI Hub (TC) non raggiungibile — tool file/VRAM degradati, search_manual su fallback pgvector (${cf} fallimenti consecutivi)`;
      suggestion = "Verifica il servizio ai-hub (pm2, porta 4405) sul VPS, il thinkcentre-agent proxy /ai-hub/* e i secret AI_HUB_URL/AI_HUB_GATE_TOKEN. search_manual continua sul motore pgvector locale.";
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
      suggestion = "Verifica connettività Replit. Se VPS è offline, usa powered-off mode per sopprimere i relativi alert.";
    } else if (s.metric.startsWith("health.engine.")) {
      const engine = s.metric.split(".")[2];
      title = `Routing engine ${engine} health-check KO`;
      suggestion = `Pinga manualmente ${engine}, verifica DNS/firewall.`;
    } else if (s.metric === "dragonfly_blocked") {
      const det = s.details as { consecutiveCount?: number; thresholdMin?: number } | undefined;
      const blockedMin = s.value ?? "?";
      const threshold = det?.thresholdMin ?? 60;
      title = `Map-matching bloccato da ${blockedMin}min — lock DragonflyDB rifiutato (soglia: ${threshold}min)`;
      suggestion = "DragonflyDB rifiuta il lock distribuito — il ciclo di matching non parte. Verifica stato DragonflyDB (REDIS_URL), riavvia il servizio DragonflyDB sul VPS o forza l'unlock dal pannello admin matching.";
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
    } else if (s.metric === "embeddings.hnsw_index") {
      const det = s.details as { exists?: boolean; valid?: boolean } | undefined;
      const reason = det?.exists === false ? "mancante" : "invalido";
      title = `Indice HNSW ${reason} — findSimilar usa sequential scan`;
      suggestion = "HNSW index missing/invalid — findSimilar falling back to sequential scan. Riavvia il server: la boot-sequence ricostruisce l'indice al primo avvio.";
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
    } else if (s.metric === "db.bg_limiter.dropped") {
      const det = s.details as {
        deltaOverflow?: number; deltaTimeout?: number;
        overflowTotal?: number; timeoutTotal?: number; consecutiveDrops?: number;
      } | undefined;
      const dOv = det?.deltaOverflow ?? 0;
      const dTo = det?.deltaTimeout ?? 0;
      const totOv = det?.overflowTotal ?? 0;
      const totTo = det?.timeoutTotal ?? 0;
      if (s.severity === "high") {
        title = `Job DB in background scartati di continuo: ${s.value} nell'ultimo intervallo (coda piena ${dOv}, scaduti ${dTo})`;
        suggestion = `La valvola di sfogo del bg-db-limiter butta via lavoro a ogni ciclo: pressione persistente sul pool. Verifica query lente/lock e la concorrenza dei job interni. Totali dal boot: ${totOv} overflow + ${totTo} timeout. I job rieseguono al tick successivo, ma stai perdendo cicli notturni.`;
      } else {
        title = `Job DB in background scartati: ${s.value} nell'ultimo intervallo (coda piena ${dOv}, scaduti ${dTo})`;
        suggestion = `Il bg-db-limiter ha scartato job di background (coda piena o attesa troppo lunga): accumulo temporaneo, i job rieseguono al tick successivo. Totali dal boot: ${totOv} overflow + ${totTo} timeout. Monitora se cresce.`;
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
    } else if (s.metric === "tc.reboot_slow") {
      const det = s.details as { outageSec?: number; thresholdSec?: number } | undefined;
      const sec = det?.outageSec ?? s.value ?? "?";
      const threshold = det?.thresholdSec ?? 90;
      title = `VPS riavviato lentamente: ${sec}s (soglia ${threshold}s)`;
      suggestion = "Riavvio del VPS oltre la soglia di 90s. Possibile regressione del kernel (cgroup_drain_dying deadlock su Ubuntu 26.04 kernel ≤7.0.0-22-generic). Verifica la versione kernel con `uname -r` e considera l'upgrade a un kernel LTS dove il bug è confermato risolto. Il fix `ollama.service` ExecPreStop riduce l'esposizione ma non elimina il bug kernel.";
    } else if (s.metric === "backend.crash_rate_1h") {
      // Task #934 — segnale crash_rate_1h: letto direttamente da logs/uptime-resets.log.
      const count = Number(s.value ?? 0);
      const det = s.details as {
        count?: number; windowH?: number; thresholdHigh?: number; thresholdCritical?: number;
      } | undefined;
      const tHigh = det?.thresholdHigh ?? 2;
      const tCrit = det?.thresholdCritical ?? 4;
      if (s.severity === "critical") {
        title = `Crash loop backend: ${count} riavvii inattesi nell'ultima ora (soglia critica: >${tCrit})`;
        suggestion = "Crash loop in corso. Verifica logs/uptime-resets.log, logs/cerbero.log e Sentry per la causa del crash. Il DB può saturarsi come effetto a cascata.";
      } else if (s.severity === "high") {
        title = `Tasso crash backend elevato: ${count} riavvii inattesi nell'ultima ora (soglia: >${tHigh})`;
        suggestion = "Frequenza di riavvio inattesa. Verifica logs/backend-crashes.log e Sentry. Possibile regressione recente o esaurimento di una risorsa nativa.";
      } else {
        title = `Crash backend recenti: ${count} riavvii nell'ultima ora`;
        suggestion = "Monitorare — entro la soglia ma sopra lo zero. Verifica logs/uptime-resets.log per la causa.";
      }
    } else if (s.metric.startsWith("tc.gh_container_restarted.")) {
      // Un segnale per container riavviato (metric = "tc.gh_container_restarted.<containerKey>").
      // detail è piccolo (<200 char) → nessun rischio di troncamento a 300 char.
      const det = s.details as { name?: string; restartCount?: number; delta?: number } | undefined;
      const containerKey = s.metric.replace("tc.gh_container_restarted.", "");
      const name = det?.name ?? `bikerlink-${containerKey}`;
      const delta = det?.delta ?? s.value ?? "?";
      const totalRestarts = det?.restartCount ?? "?";
      title = `Container routing riavviato: ${name.replace("bikerlink-", "")} (+${delta} restart, tot: ${totalRestarts})`;
      suggestion = `Il container Docker ${name} si è riavviato inaspettatamente. Controlla i log sul VPS: \`docker logs ${name} --tail 100\`. Verifica memoria disponibile e OOM-killer con \`dmesg | grep -i oom\`.`;
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
    } else if (s.metric === "routing.graphhopper.correct" || s.metric === "routing.valhalla.correct") {
      const engine = s.metric.split(".")[1];
      const reason = (s.details as { reason?: string } | undefined)?.reason ?? "risultato non plausibile";
      title = `Routing ${engine}: correttezza KO — ${reason}`;
      suggestion = `${engine} risponde ma restituisce un percorso non plausibile o errore silenzioso. Verifica il grafo/i tile di ${engine} e la sua salute sul VPS.`;
    } else if (s.metric === "routing.area_resolver.error") {
      const det = s.details as { reason?: string; sqlCode?: string } | undefined;
      const reason = det?.reason ?? "errore SQL nell'area resolver";
      const code = det?.sqlCode ? ` (SQLSTATE ${det.sqlCode})` : "";
      title = `Area resolver GH: errore SQL${code} — sonda GH saltata`;
      suggestion = "La query PostGIS di risoluzione area ha restituito un errore prima di contattare GraphHopper. Verifica che PostGIS sia abilitato nel DB e che la sintassi unnest/ST_Contains sia supportata. La sonda GH è stata saltata: non è un guasto GraphHopper.";
      // Override reason in detail for display
      if (!det?.reason) { /* keep title */ }
      else title = `Area resolver GH: ${reason}`;
    } else if (s.metric === "geocoding.photon.correct") {
      const reason = (s.details as { reason?: string } | undefined)?.reason ?? "risultato non plausibile";
      title = `Geocoding Photon: correttezza KO — ${reason}`;
      suggestion = "Photon risponde ma il geocoding è vuoto/errato. Verifica l'indice Photon e la connettività sul VPS.";
    } else if (s.metric === "pipeline.correct") {
      const reason = (s.details as { reason?: string } | undefined)?.reason ?? "pipeline non corretta";
      title = `Pipeline routing: ${reason}`;
      suggestion = "Verifica il fallback Valhalla→GraphHopper e lo stato dei motori self-hosted.";
    }
    problems.push({
      id, severity: s.severity, source: s.source, title, suggestion,
      detail: s.details ? JSON.stringify(s.details).slice(0, 300) : undefined,
    });
  }
  return problems;
}

// Problemi che sono CONSEGUENZA diretta del VPS offline — lista
// ESPLICITA e ristretta, mai per prefisso (un prefisso largo sopprimerebbe anche
// guasti indipendenti):
//  - DragonflyDB non raggiungibile (self-hosted sul VPS);
//  - backlog map-matching che cresce perché GraphHopper non risponde;
//  - routing engine SELF-HOSTED down (graphhopper/valhalla). I cloud engine
//    (mapbox/tomtom) sono ESCLUSI: un loro down è indipendente dal VPS
//    e deve restare azionabile;
//  - pressione del pool conseguente (event-loop ingolfato dalle chiamate lente
//    verso il VPS → SELECT 1 non ottiene slot, limiter bg in coda);
//  - instabilità di rete (N engine irraggiungibili): con TC spento i self-hosted
//    risultano giù, gonfiando il contatore — il rumore non è azionabile;
//  - DB ping lento (db.db.ping_ms): i job di map-matching girano a vuoto senza
//    GH/Valhalla e saturano il pool → il ping rallenta come effetto collaterale.
// NON inclusi (restano allarmi pieni anche a VPS spento):
//  - maps.routing.engine_down.mapbox/tomtom (cloud, indipendenti dall'outage);
//  - db.db.circuit_breaker (DB realmente giù — sempre azionabile).
const OUTAGE_DOWNSTREAM_IDS = new Set<string>([
  "dragonfly.dragonfly.unreachable",
  "maps.matching.pending",
  "maps.routing.engine_down.graphhopper",
  "maps.routing.engine_down.valhalla",
  "db.db.pool.waiting",
  "db.db.ping_saturated",
  "db.db.bg_limiter.queued",
  "db.db.bg_limiter.dropped",
  "maps.health.network_instability",
  "db.db.ping_ms",
  // Task #72 — sovraccarico sostenuto: con il VPS spento pool/ping/errori
  // DB e l'event-loop ingolfato dalle chiamate lente verso i self-hosted sono
  // conseguenze attese dell'outage → downstream, push soppressa.
  "db.db.overload_sustained",
  "app.backend.overload_sustained",
  // Task #23 — sonde di correttezza routing self-hosted (namespace Horus): con il
  // VPS spento i motori risultano scorretti/irraggiungibili → downstream.
  "horus.routing.graphhopper.correct",
  "horus.routing.valhalla.correct",
  "horus.geocoding.photon.correct",
  "horus.pipeline.correct",
  // Task #392 — errore SQL nel resolver dell'area (pre-GH): con TC spento il DB
  // PostGIS potrebbe essere irraggiungibile → downstream, non azionabile.
  "horus.routing.area_resolver.error",
  // Task #575 — lock DragonflyDB (su TC): con TC spento il lock non è acquisibile
  // → il blocco matching è un effetto downstream atteso, non un nuovo incidente.
  "matching.dragonfly_blocked",
]);

function isOutageDownstreamProblem(id: string): boolean {
  return OUTAGE_DOWNSTREAM_IDS.has(id);
}

// Quando il VPS è in modalità "spento", retrocede i problemi a valle
// dell'outage da critical/high a "warn": restano VISIBILI in dashboard (così
// l'admin sa che ci sono) ma non scatenano escalation critica né push, perché
// sono attesi e non azionabili finché il VPS è offline.
export function suppressDownstreamWhenPoweredOff(problems: Problem[]): Problem[] {
  return problems.map((p) => {
    if (
      isOutageDownstreamProblem(p.id) &&
      (p.severity === "critical" || p.severity === "high")
    ) {
      return {
        ...p,
        severity: "warn" as Severity,
        title: `${p.title} — soppresso (VPS spento)`,
        suggestion:
          "Allarme atteso mentre il VPS è in modalità spento: escalation e push soppresse, ma il problema resta visibile in dashboard. Riaccendi il VPS o disattiva la modalità powered-off per ripristinare gli alert.",
      };
    }
    return p;
  });
}

/**
 * Fase 5 (Task #545) — Costruisce Problems dai segnali "derived".
 *
 * I segnali `origin === "derived"` sono saltati da `deriveProblems` per evitare
 * il feedback loop (overload_sustained → problema DB → dbOverload → overload_sustained).
 * Questa funzione li traduce in Problems separatamente, così restano visibili nel
 * pannello admin e attivano gli alert watchdog, ma NON alimentano il calcolo di
 * dbOverload in recordDbMonitorSample.
 *
 * Attualmente gestisce: db.overload_sustained, backend.overload_sustained.
 */
export function buildDerivedProblems(signals: Signal[]): Problem[] {
  const problems: Problem[] = [];
  for (const s of signals) {
    if (s.origin !== "derived") continue;
    if (s.severity === "info") continue;

    const id = `${s.source}.${s.metric}`;
    let title = s.metric;
    let suggestion: string | undefined;

    if (s.metric === "db.overload_sustained") {
      const det = s.details as { reasons?: string[]; poolActivePct?: number; pingMs?: number | null } | undefined;
      const reasons = det?.reasons?.length ? det.reasons.join(", ") : "pool/ping/errori DB";
      title = `Database sovraccarico da ${s.value} cicli consecutivi (${reasons})`;
      suggestion = "Il database è sovraccarico in modo sostenuto (pool saturo, ping alto o errori). Verifica query lente/lock (pg_stat_activity), la concorrenza dei job interni e valuta di ridurre il carico o aumentare pool.max.";
    } else if (s.metric === "backend.overload_sustained") {
      const det = s.details as { reasons?: string[]; cpuPct?: number; eventLoopLagMs?: number } | undefined;
      const reasons = det?.reasons?.length ? det.reasons.join(", ") : "event-loop lag / CPU";
      title = `Backend Node sovraccarico da ${s.value} cicli consecutivi (${reasons})`;
      suggestion = "Il server Node è sovraccarico in modo sostenuto (event-loop lag alto o CPU satura) INDIPENDENTEMENTE dal DB: le richieste rallentano anche col database sano. Verifica loop bloccanti, lavoro sincrono pesante o chiamate esterne lente sul thread principale.";
    }

    problems.push({
      id, severity: s.severity, source: s.source, title, suggestion,
      detail: s.details ? JSON.stringify(s.details).slice(0, 300) : undefined,
    });
  }
  return problems;
}

export { runAggregatorCycle, getRecentSnapshots, getLatestSnapshot, subscribeSnapshot, isAggregatorCycleInFlight, getSnoozedUntil, setSnoozedUntil, rehydrateSnoozedUntil } from "./aggregator.part2";
