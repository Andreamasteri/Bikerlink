// Task #2533 — Invio alert per snapshot critici. Push agli admin + WS realtime.
// Throttle: max 1 alert ogni 10 min per (status, problemId) combo.
import type { HealthSnapshot } from "./types";
import { writeWatchdogLog } from "./log";
import { emitWatchdogAlert, emitWatchdogStatusChange } from "../coordinator/integrations/watchdog";
import { isMapsFlagEnabled } from "./maps-kill-switch";
import { logger } from "../../lib/logger";
import { sendSystemAlertPushToAdmins } from "../../push-notifications";
import { getAdminPushTokenCount } from "../../push-notifications-internal";

const mapsLog = logger.child({ scope: "maps-watchdog", layer: "alerts" });

const ALERT_TTL_MS = 10 * 60 * 1000;
const sent = new Map<string, number>();

// Guard anti-spam al ripristino dei token admin (0→N).
// Quando la tabella push_tokens torna popolata dopo un periodo a zero token,
// il primo ciclo del watchdog troverebbe shouldSend()=true per tutti i problemi
// accumulati e invierebbe un burst di centinaia di push in pochi secondi.
// Tracciamo il conteggio noto: se la transizione è 0→N, marchiamo tutti i
// throttle key come "appena inviati" (timestamp=now) senza spedire nulla,
// così il primo ciclo reale (il successivo) invia solo i problemi correnti.
let lastKnownAdminTokenCount = -1; // -1 = non ancora campionato

// Task #96 — Latch: uno START alert di sovraccarico è stato REALMENTE emesso agli
// admin (segnale severity "high", NON declassato a "warn" dalla soppressione
// downstream quando il ThinkCentre è spento). La push di RIENTRO ("all-clear")
// legge i metrics grezzi dello snapshot e bypasserebbe quella soppressione: senza
// questo gate un admin potrebbe ricevere un "✅ rientrato" per un overload di cui
// non è mai stato avvisato (start soppresso durante un outage del ThinkCentre).
// Il latch viene consumato (riportato a false) quando la push di rientro parte.
let dbOverloadAlertSent = false;
let backendOverloadAlertSent = false;

interface AdminWsBroadcast { (msg: { type: string; payload: unknown }): void }
let wsBroadcast: AdminWsBroadcast | null = null;
export function registerAdminWsBroadcast(fn: AdminWsBroadcast): void { wsBroadcast = fn; }

function shouldSend(key: string): boolean {
  const now = Date.now();
  const last = sent.get(key) ?? 0;
  if (now - last < ALERT_TTL_MS) return false;
  sent.set(key, now);
  return true;
}

export async function dispatchAlerts(snap: HealthSnapshot): Promise<{ sent: number }> {
  // Guard anti-spam: rileva la transizione 0→N token admin (ripristino).
  // Se era a zero e ora ci sono token, marchia tutti i throttle key con timestamp=now
  // così il burst di alert accumulati NON parte — solo i problemi del ciclo
  // successivo (post-ripristino) verranno inviati normalmente.
  const currentTokenCount = await getAdminPushTokenCount();
  if (currentTokenCount >= 0) {
    // campione valido (>=0; -1 = errore DB, skip)
    if (lastKnownAdminTokenCount === 0 && currentTokenCount > 0) {
      const now = Date.now();
      // flush throttle: marca tutti i key esistenti come "appena inviati"
      for (const key of sent.keys()) {
        sent.set(key, now);
      }
      console.warn(
        `[Watchdog] Token admin ripristinati (0→${currentTokenCount}): alert backlog soppresso per prevenire burst.`,
      );
    }
    lastKnownAdminTokenCount = currentTokenCount;
  }

  // Snapshot-level (status change → red/orange)
  let sentCount = 0;
  // Task #2654 — Emit al Coordinator (graceful, non blocca)
  if (snap.status === "red" || snap.status === "orange") {
    await emitWatchdogStatusChange({
      status: snap.status,
      score: snap.score,
      topProblem: snap.problems[0]?.title ?? null,
    });
  }
  if ((snap.status === "red" || snap.status === "orange") && shouldSend(`status.${snap.status}`)) {
    const icon = snap.status === "red" ? "🔴" : "🟠";
    const top = snap.problems[0]?.title ?? "Problema sistema";
    const n = await sendSystemAlertPushToAdmins(
      `${icon} Sistema ${snap.status === "red" ? "CRITICO" : "degradato"}`,
      `Score ${snap.score}/100 — ${top}`,
      { type: "watchdog_status", status: snap.status, score: snap.score },
    );
    sentCount += n;
    await writeWatchdogLog({
      kind: "alert", scope: `status.${snap.status}`, status: "ok",
      summary: `Alert status ${snap.status} inviato a ${n} admin`,
      details: { snapshotProblems: snap.problems.length, score: snap.score },
    });
  }

  // Pool exhaustion — dedicated alert (higher priority than generic critical loop)
  const poolProblem = snap.problems.find(
    (p) => p.id === "db.db.pool.waiting" && p.severity === "critical",
  );
  if (poolProblem) {
    await emitWatchdogAlert({ problem: poolProblem, score: snap.score, status: snap.status });
    if (shouldSend("db.pool.exhaustion")) {
      let detail: { max?: number; total?: number; consecutiveWaiting?: number } = {};
      try { detail = JSON.parse(poolProblem.detail ?? "{}"); } catch { /* use defaults */ }
      const waiting = snap.metrics["db.db.pool.waiting"] ?? "?";
      const max = detail.max ?? 10;
      const consecutive = detail.consecutiveWaiting != null ? ` (${detail.consecutiveWaiting} tick consecutivi)` : "";
      const n = await sendSystemAlertPushToAdmins(
        `💀 Pool DB esaurito — ${waiting}/${max} client in attesa`,
        `Il pool è completamente saturo${consecutive}. Controlla query lente/lock e valuta di aumentare pool.max.`,
        { type: "watchdog_pool_exhaustion", waiting, max, score: snap.score },
      );
      sentCount += n;
      await writeWatchdogLog({
        kind: "alert", scope: "db.pool.exhaustion", status: "ok",
        summary: `Alert pool DB esaurito: ${waiting}/${max} client in attesa`,
        details: { sent: n, waiting, max, consecutive: detail.consecutiveWaiting },
      });
    }
  }

  // Instabilità di rete — alert dedicato per ≥2 engine down contemporaneamente.
  // Severity "high" (non critical) per evitare rumore eccessivo ma comunque notificato.
  // Gate sulla severity: questo path dedicato bypassa il loop critical-only sotto,
  // quindi se la severity viene declassata (es. soppressione downstream a "warn")
  // NON deve comunque emettere push. Solo high/critical notificano.
  const netInstabilityProblem = snap.problems.find(
    (p) => p.id === "maps.health.network_instability",
  );
  if (
    netInstabilityProblem &&
    (netInstabilityProblem.severity === "high" || netInstabilityProblem.severity === "critical")
  ) {
    await emitWatchdogAlert({ problem: netInstabilityProblem, score: snap.score, status: snap.status });
    const mapsAlertsOn = await isMapsFlagEnabled("alerts");
    if (mapsAlertsOn && shouldSend("maps.network_instability")) {
      const n = await sendSystemAlertPushToAdmins(
        `🌐 ${netInstabilityProblem.title}`,
        netInstabilityProblem.suggestion ?? "Verifica connettività Replit.",
        { type: "watchdog_network_instability", score: snap.score, status: snap.status },
      );
      sentCount += n;
      await writeWatchdogLog({
        kind: "alert", scope: "maps.network_instability", status: "ok",
        summary: `Alert instabilità di rete: ${netInstabilityProblem.title}`,
        details: { sent: n, suggestion: netInstabilityProblem.suggestion },
      });
    }
  }

  // Indice HNSW mancante/invalido (Task #4893) — segnale "high" emesso dal
  // db-collector quando embeddings_vec_hnsw_cosine_idx non esiste o è invalido.
  // findSimilar() degrada a sequential scan: nessun crash, ma latenza alta sotto
  // carico (BioAffinity/MusicAffinity lo chiamano in loop). La severity è "high"
  // (non critical) → NON viene catturata dal loop critical-only sotto, quindi
  // serve un blocco dedicato perché la push parta davvero.
  const hnswProblem = snap.problems.find(
    (p) => p.id === "db.embeddings.hnsw_index" && p.severity === "high",
  );
  if (hnswProblem) {
    await emitWatchdogAlert({ problem: hnswProblem, score: snap.score, status: snap.status });
    if (shouldSend("db.embeddings.hnsw_index")) {
      let detail: { exists?: boolean; valid?: boolean; indexName?: string } = {};
      try { detail = JSON.parse(hnswProblem.detail ?? "{}"); } catch { /* use defaults */ }
      const reason = detail.exists === false ? "mancante" : "invalido";
      const n = await sendSystemAlertPushToAdmins(
        `🧭 Indice HNSW ${reason} — ricerca affinità degradata`,
        hnswProblem.suggestion ?? "HNSW index missing/invalid — findSimilar falling back to sequential scan. Riavvia il server per ricostruirlo.",
        { type: "watchdog_hnsw_index", exists: detail.exists ?? null, valid: detail.valid ?? null, score: snap.score },
      );
      sentCount += n;
      await writeWatchdogLog({
        kind: "alert", scope: "db.embeddings.hnsw_index", status: "ok",
        summary: `Alert HNSW index ${reason} inviato a ${n} admin`,
        details: { sent: n, exists: detail.exists, valid: detail.valid, indexName: detail.indexName },
      });
    }
  }

  // Sovraccarico DB sostenuto (Task #72) — segnale "high" emesso dall'overload-collector
  // quando il DB resta sovraccarico (pool saturo / ping alto / errori) per una
  // finestra sostenuta. Severity "high" (non critical) → NON catturato dal loop
  // critical-only sotto: serve un blocco dedicato perché la push parta. Rispetta
  // il throttle shouldSend (una push ogni 10 min) per non spammare.
  const dbOverloadProblem = snap.problems.find(
    (p) => p.id === "db.db.overload_sustained" && p.severity === "high",
  );
  if (dbOverloadProblem) {
    // Task #96 — arma il latch: uno start alert reale (high, non soppresso) è
    // presente. Impostato qui (non dentro shouldSend) così resta armato anche
    // quando la push è throttled ma l'overload è comunque in corso.
    dbOverloadAlertSent = true;
    await emitWatchdogAlert({ problem: dbOverloadProblem, score: snap.score, status: snap.status });
    if (shouldSend("db.overload_sustained")) {
      let detail: { consecutiveTicks?: number; reasons?: string[] } = {};
      try { detail = JSON.parse(dbOverloadProblem.detail ?? "{}"); } catch { /* use defaults */ }
      const ticks = detail.consecutiveTicks ?? "?";
      const reasons = detail.reasons?.length ? detail.reasons.join(", ") : "pool/ping/errori DB";
      const n = await sendSystemAlertPushToAdmins(
        `🗄️ Database sovraccarico da ${ticks} cicli`,
        dbOverloadProblem.suggestion ?? `Il database è sovraccarico in modo sostenuto (${reasons}). Verifica query lente/lock e la concorrenza dei job interni.`,
        { type: "watchdog_db_overload", consecutiveTicks: detail.consecutiveTicks ?? null, score: snap.score },
      );
      sentCount += n;
      await writeWatchdogLog({
        kind: "alert", scope: "db.overload_sustained", status: "ok",
        summary: `Alert DB sovraccarico sostenuto inviato a ${n} admin`,
        details: { sent: n, consecutiveTicks: detail.consecutiveTicks, reasons: detail.reasons },
      });
    }
  }

  // Sovraccarico backend Node sostenuto (Task #72) — segnale "high" emesso
  // dall'overload-collector quando il server Node resta sovraccarico (event-loop
  // lag / CPU) per una finestra sostenuta, INDIPENDENTEMENTE dal DB. Blocco
  // dedicato per la stessa ragione: severity "high" non passa dal loop critical.
  const backendOverloadProblem = snap.problems.find(
    (p) => p.id === "app.backend.overload_sustained" && p.severity === "high",
  );
  if (backendOverloadProblem) {
    // Task #96 — arma il latch backend (stessa logica del blocco DB).
    backendOverloadAlertSent = true;
    await emitWatchdogAlert({ problem: backendOverloadProblem, score: snap.score, status: snap.status });
    if (shouldSend("backend.overload_sustained")) {
      let detail: { consecutiveTicks?: number; reasons?: string[] } = {};
      try { detail = JSON.parse(backendOverloadProblem.detail ?? "{}"); } catch { /* use defaults */ }
      const ticks = detail.consecutiveTicks ?? "?";
      const reasons = detail.reasons?.length ? detail.reasons.join(", ") : "event-loop lag / CPU";
      const n = await sendSystemAlertPushToAdmins(
        `⚙️ Backend sovraccarico da ${ticks} cicli`,
        backendOverloadProblem.suggestion ?? `Il server Node è sovraccarico in modo sostenuto (${reasons}), indipendentemente dal DB. Verifica loop bloccanti o lavoro sincrono pesante.`,
        { type: "watchdog_backend_overload", consecutiveTicks: detail.consecutiveTicks ?? null, score: snap.score },
      );
      sentCount += n;
      await writeWatchdogLog({
        kind: "alert", scope: "backend.overload_sustained", status: "ok",
        summary: `Alert backend sovraccarico sostenuto inviato a ${n} admin`,
        details: { sent: n, consecutiveTicks: detail.consecutiveTicks, reasons: detail.reasons },
      });
    }
  }

  // Rientro dal sovraccarico DB sostenuto (Task #84) — l'overload-collector emette
  // un segnale "info" db.overload_recovered (value = tick di salute) quando un DB
  // PRECEDENTEMENTE sovraccarico in modo sostenuto torna sano per una finestra
  // piena. Info → non è un Problem (non intacca lo score): lo leggiamo dai metrics
  // dello snapshot per chiudere il cerchio con UNA push "rientrato". Throttle
  // dedicato (chiave distinta dalla start) per non lampeggiare su overload che
  // vanno e vengono.
  // Task #96 — gate: la push di rientro parte SOLO se lo start alert era stato
  // realmente emesso (dbOverloadAlertSent). Se lo start era soppresso dal
  // ThinkCentre spento (declassato a "warn"), il latch non è mai stato armato e
  // l'admin non riceve un "all-clear" per un allarme mai partito.
  if (
    snap.metrics["db.db.overload_recovered"] != null &&
    dbOverloadAlertSent &&
    shouldSend("db.overload_recovered")
  ) {
    dbOverloadAlertSent = false; // consuma il latch: un prossimo rientro richiede un nuovo start reale
    const n = await sendSystemAlertPushToAdmins(
      `✅ Database rientrato — sovraccarico risolto`,
      "Il database è tornato in condizioni normali dopo un periodo di sovraccarico sostenuto (pool/ping/errori). Nessun intervento ulteriore necessario.",
      { type: "watchdog_db_recovered", score: snap.score },
    );
    sentCount += n;
    await writeWatchdogLog({
      kind: "alert", scope: "db.overload_recovered", status: "ok",
      summary: `Alert rientro DB sovraccarico inviato a ${n} admin`,
      details: { sent: n },
    });
  }

  // Rientro dal sovraccarico backend Node sostenuto (Task #84) — stessa logica del
  // blocco DB ma per il segnale info app.backend.overload_recovered, così l'"all
  // clear" distingue backend da DB (chiave throttle e payload separati).
  // Task #96 — stesso gate del blocco DB, per il latch backend.
  if (
    snap.metrics["app.backend.overload_recovered"] != null &&
    backendOverloadAlertSent &&
    shouldSend("backend.overload_recovered")
  ) {
    backendOverloadAlertSent = false; // consuma il latch backend
    const n = await sendSystemAlertPushToAdmins(
      `✅ Backend rientrato — sovraccarico risolto`,
      "Il server Node è tornato in condizioni normali dopo un periodo di sovraccarico sostenuto (event-loop lag / CPU). Nessun intervento ulteriore necessario.",
      { type: "watchdog_backend_recovered", score: snap.score },
    );
    sentCount += n;
    await writeWatchdogLog({
      kind: "alert", scope: "backend.overload_recovered", status: "ok",
      summary: `Alert rientro backend sovraccarico inviato a ${n} admin`,
      details: { sent: n },
    });
  }

  // TC reboot lento (Task #178) — segnale "high" emesso dal tc-reboot-collector
  // quando il ThinkCentre impiega >90s per tornare raggiungibile dopo un riavvio.
  // Indica una potenziale regressione del kernel (cgroup_drain_dying deadlock).
  // Severity "high" (non critical) → NON catturato dal loop critical-only sotto:
  // serve un blocco dedicato perché la push parta.
  // Throttle: 1 push per evento di reboot (chiave include il valore in secondi
  // così reboot diversi non si throttlano a vicenda nel TTL di 10 min).
  const tcRebootSlowProblem = snap.problems.find(
    (p) => p.id === "tc.tc.reboot_slow" && p.severity === "high",
  );
  if (tcRebootSlowProblem) {
    await emitWatchdogAlert({ problem: tcRebootSlowProblem, score: snap.score, status: snap.status });
    const outageSec = snap.metrics["tc.tc.reboot_slow"] ?? "?";
    if (shouldSend(`tc.reboot_slow.${outageSec}`)) {
      let detail: { outageSec?: number; thresholdSec?: number } = {};
      try { detail = JSON.parse(tcRebootSlowProblem.detail ?? "{}"); } catch { /* use defaults */ }
      const sec = detail.outageSec ?? outageSec;
      const n = await sendSystemAlertPushToAdmins(
        `⚠️ ThinkCentre: riavvio lento (${sec}s)`,
        "Il TC ha impiegato più di 90s per tornare online. Possibile regressione kernel (cgroup_drain_dying). Verifica la versione kernel e considera l'upgrade.",
        { type: "watchdog_tc_reboot_slow", outageSec: sec, thresholdSec: detail.thresholdSec ?? 90, score: snap.score },
      );
      sentCount += n;
      await writeWatchdogLog({
        kind: "alert", scope: "tc.reboot_slow", status: "ok",
        summary: `Alert riavvio TC lento (${sec}s) inviato a ${n} admin`,
        details: { sent: n, outageSec: sec, thresholdSec: detail.thresholdSec ?? 90 },
      });
    }
  }

  // Crash-free rate 24h (Task #395) — segnale critical/warn emesso dall'error-collector
  // quando il tasso di sessioni senza crash scende sotto soglia. Blocco dedicato
  // perché il loop generico sotto logga solo { sent, suggestion } perdendo tutti i
  // metadati numerici già calcolati dal collector (crashFreeRate, crashCount,
  // totalSessions). Il blocco dedicato li include nel payload push e nel log.
  const crashRateProblem = snap.problems.find(
    (p) => p.id === "error.client.crash_free_rate_24h" && p.severity === "critical",
  );
  if (crashRateProblem) {
    await emitWatchdogAlert({ problem: crashRateProblem, score: snap.score, status: snap.status });
    if (shouldSend("error.crash_free_rate_24h")) {
      let detail: {
        crashFreeRate?: number | null;
        crashCount?: number;
        totalSessions?: number;
        insufficientData?: boolean;
        byPlatform?: Record<string, number>;
      } = {};
      try { detail = JSON.parse(crashRateProblem.detail ?? "{}"); } catch { /* use defaults */ }

      // Guard: se insufficientData è true (totalSessions troppo basso) non siamo
      // in un ciclo critical reale — skip push (il collector avrebbe già emesso info,
      // ma per sicurezza evitiamo un falso allarme).
      if (!detail.insufficientData) {
        const rate = detail.crashFreeRate != null ? `${detail.crashFreeRate}%` : "?";
        const crashes = detail.crashCount ?? "?";
        const sessions = detail.totalSessions ?? "?";

        // Task #421 — breakdown per piattaforma nella push body.
        // Formato: "Android: 81% · iOS: 98%" (ordine canonico: android poi ios).
        // Se una sola piattaforma ha dati, viene comunque mostrata.
        let platformLine = "";
        const bp = detail.byPlatform;
        if (bp && Object.keys(bp).length > 0) {
          const parts: string[] = [];
          if (bp["android"] != null) parts.push(`Android: ${bp["android"]}%`);
          if (bp["ios"] != null) parts.push(`iOS: ${bp["ios"]}%`);
          // Includi piattaforme inattese (es. unknown) se presenti
          for (const [plat, r] of Object.entries(bp)) {
            if (plat !== "android" && plat !== "ios") parts.push(`${plat}: ${r}%`);
          }
          if (parts.length > 0) platformLine = ` (${parts.join(" · ")})`;
        }

        // Soglia hardcoded a 90% (coerente con il collector).
        const n = await sendSystemAlertPushToAdmins(
          `📉 Crash-free rate 24h: ${rate} (soglia: 90%)`,
          `${crashes} crash su ${sessions} sessioni nelle ultime 24h${platformLine}. ${crashRateProblem.suggestion ?? "Verifica i log crash nell'admin."}`,
          {
            type: "watchdog_crash_free_rate",
            crashFreeRate: detail.crashFreeRate ?? null,
            crashCount: detail.crashCount ?? null,
            totalSessions: detail.totalSessions ?? null,
            byPlatform: detail.byPlatform ?? null,
            score: snap.score,
          },
        );
        sentCount += n;
        await writeWatchdogLog({
          kind: "alert", scope: "error.client.crash_free_rate_24h", status: "ok",
          summary: `Alert crash-free rate 24h: ${rate} (${crashes} crash / ${sessions} sessioni)${platformLine}`,
          details: {
            sent: n,
            crashFreeRate: detail.crashFreeRate ?? null,
            crashCount: detail.crashCount ?? null,
            totalSessions: detail.totalSessions ?? null,
            byPlatform: detail.byPlatform ?? null,
            suggestion: crashRateProblem.suggestion,
          },
        });
      }
    }
  }

  // Problem-level (critical singoli — pool exhaustion e network_instability già gestite sopra)
  for (const p of snap.problems) {
    if (p.severity !== "critical") continue;
    if (p.id === "db.db.pool.waiting") continue; // già gestita nel blocco pool dedicato
    if (p.id === "error.client.crash_free_rate_24h") continue; // già gestita nel blocco dedicato sopra
    // Task #2654 — emit ogni problem critical anche se throttled (lo throttle è solo per push)
    await emitWatchdogAlert({ problem: p, score: snap.score, status: snap.status });
    // Task #2686 — kill-switch dedicato per push mappe.
    if (p.source === "maps") {
      const mapsAlertsOn = await isMapsFlagEnabled("alerts");
      if (!mapsAlertsOn) {
        mapsLog.info({ problemId: p.id }, "push maps soppressa da kill-switch");
        continue;
      }
    }
    if (!shouldSend(`problem.${p.id}`)) continue;
    const n = await sendSystemAlertPushToAdmins(
      `🚨 ${p.title}`,
      p.suggestion ?? "Verifica system-health admin.",
      { type: "watchdog_problem", problemId: p.id, severity: p.severity, source: p.source },
    );
    sentCount += n;
    await writeWatchdogLog({
      kind: "alert", scope: p.id, status: "ok",
      summary: `Alert critical: ${p.title}`,
      details: { sent: n, suggestion: p.suggestion },
    });
  }

  // WS broadcast (sempre, non throttled)
  try { wsBroadcast?.({ type: "watchdog_snapshot", payload: snap }); } catch { /* ignore */ }

  return { sent: sentCount };
}

export function _resetThrottleForTests(): void {
  sent.clear();
  dbOverloadAlertSent = false;
  backendOverloadAlertSent = false;
  lastKnownAdminTokenCount = -1;
}
