// Task #2533 — Scheduler in-process del watchdog. Ogni 60s: aggregator → auto-fix
// → (se serve) proposer → alerts. Cleanup signals 1x/h. Weekly report via cron sep.
import { runAggregatorCycle } from "./aggregator";
import { runAutoFix } from "./auto-fix";
import { runProposer } from "./proposer";
import { dispatchAlerts } from "./alerts";
import { cleanupOldSignals } from "./signals";
import { isWatchdogEnabled } from "./kill-switch";
import { startWeeklyReportScheduler } from "./weekly-report";
import { cleanupMapsTelemetry } from "./maps-telemetry-store";
import { runMapsHealthChecks } from "./maps-health-checks";
import { sendSystemAlertPushToAdmins } from "../../push-notifications-admin";

const TICK_MS = 60_000;
const CLEANUP_MS = 60 * 60_000;
// Cooldown proposer: evita di chiamare Groq/AI ogni minuto per problemi
// persistenti (es. Valhalla down tutto il giorno). Limite: 1 run/60 min.
const PROPOSER_COOLDOWN_MS = 60 * 60_000;

let tickTimer: NodeJS.Timeout | null = null;
let cleanupTimer: NodeJS.Timeout | null = null;
let lastProposerRunAt = 0;
// Cooldown push appstate_transition: condivide la stessa durata del proposer
// per evitare spam notifiche durante un loop-bug prolungato.
let lastAppstateAlertSentAt = 0;

let lastError: { at: string; message: string } | null = null;
let totalCycles = 0;
let totalAutoFixesApplied = 0;
let totalProposalsCreated = 0;
let totalAlertsSent = 0;

async function tick(): Promise<void> {
  if (!(await isWatchdogEnabled())) return;
  totalCycles++;
  try {
    const snap = await runAggregatorCycle();
    const fixes = await runAutoFix(snap);
    totalAutoFixesApplied += fixes.filter((f) => f.applied).length;

    // Proposer solo se ci sono problemi high/critical residui E cooldown scaduto.
    // Senza cooldown, con un servizio giù tutto il giorno il proposer chiama
    // l'AI ogni minuto bruciando 200k token/giorno (quota Groq gratuita).
    const stillHigh = snap.problems.some((p) => p.severity === "high" || p.severity === "critical");
    if (stillHigh) {
      const now = Date.now();
      const cooldownRemainingSec = Math.ceil((PROPOSER_COOLDOWN_MS - (now - lastProposerRunAt)) / 1000);
      if (now - lastProposerRunAt >= PROPOSER_COOLDOWN_MS) {
        const prop = await runProposer(snap);
        if (prop) {
          totalProposalsCreated += prop.proposals.length;
          lastProposerRunAt = now;
          const providerInfo = prop.meta ? `provider=${prop.meta.provider} model=${prop.meta.model}` : "";
          console.log(
            `[watchdog/proposer] run: ${prop.proposals.length} proposta/e | ${providerInfo} | prossimo run tra ~${PROPOSER_COOLDOWN_MS / 60_000}min`,
          );
        }
      } else {
        console.log(
          `[watchdog/proposer] skip cooldown — problemi rilevati ma AI non richiamata (riprova tra ${cooldownRemainingSec}s)`,
        );
      }
    }

    // Push admin proattiva per loop appstate_transition: se il segnale supera
    // la soglia "high" (≥500 eventi, ≥20 utenti in 2h) notifica subito gli admin
    // senza aspettare che aprano il pannello System Health.
    // Cooldown: 1 notifica ogni PROPOSER_COOLDOWN_MS (60 min) per evitare spam.
    const appstateHighProblem = snap.problems.find(
      (p) => p.id === "app.crash_signal.appstate_transition" && p.severity === "high",
    );
    if (appstateHighProblem) {
      const now = Date.now();
      if (now - lastAppstateAlertSentAt >= PROPOSER_COOLDOWN_MS) {
        try {
          const sent = await sendSystemAlertPushToAdmins(
            "🔴 Loop AppState rilevato",
            appstateHighProblem.title,
            {
              type: "watchdog_appstate_loop",
              problemId: appstateHighProblem.id,
              severity: appstateHighProblem.severity,
            },
          );
          // Aggiorna il cooldown indipendentemente da `sent`: anche se nessun
          // admin ha un token push attivo, non ha senso riprovare ogni tick.
          lastAppstateAlertSentAt = now;
          if (sent > 0) {
            console.warn(
              `[watchdog/scheduler] push appstate_loop inviata a ${sent} admin`,
            );
          } else {
            console.log(
              "[watchdog/scheduler] push appstate_loop: nessun admin con token push attivo",
            );
          }
        } catch (pushErr) {
          console.warn("[watchdog/scheduler] push appstate_loop error (non-fatal):", pushErr);
        }
      } else {
        const remainSec = Math.ceil((PROPOSER_COOLDOWN_MS - (now - lastAppstateAlertSentAt)) / 1000);
        console.log(
          `[watchdog/scheduler] push appstate_loop in cooldown — riprova tra ${remainSec}s`,
        );
      }
    }

    const alerts = await dispatchAlerts(snap);
    totalAlertsSent += alerts.sent;
  } catch (err) {
    lastError = { at: new Date().toISOString(), message: (err as Error).message?.slice(0, 300) ?? "unknown" };
    console.warn("[watchdog/scheduler] tick error:", err);
  }
}

export function startWatchdogScheduler(): void {
  if (tickTimer) return;
  // Primo tick dopo 90s: il watchdog fa query DB ad ogni ciclo; ritardarlo
  // evita di contribuire al thundering herd durante il burst di avvio.
  // Usiamo un chain di setTimeout auto-rischedulante con ±15% di jitter
  // (51–69s) per evitare la risincronizzazione tra worker dopo ogni restart.
  // clearTimeout e clearInterval condividono lo stesso namespace in Node.js,
  // quindi stopWatchdogScheduler() può usare clearTimeout(tickTimer) sul timer.
  const jitter = () => TICK_MS * (0.85 + Math.random() * 0.30);
  const scheduleNext = () => {
    tickTimer = setTimeout(() => {
      tick().catch(() => {});
      scheduleNext();
    }, jitter());
    tickTimer.unref?.();
  };
  tickTimer = setTimeout(() => {
    tick().catch(() => {});
    scheduleNext();
  }, 90_000);
  tickTimer.unref?.();
  cleanupTimer = setInterval(() => {
    cleanupOldSignals().then((n) => {
      if (n > 0) console.log(`[watchdog/scheduler] cleanup signals: ${n} righe rimosse`);
    }).catch(() => {});
    // Task #2686 — cleanup telemetria mappe (retention 7gg)
    cleanupMapsTelemetry().then((n) => {
      if (n > 0) console.log(`[watchdog/scheduler] cleanup maps telemetry: ${n} righe rimosse`);
    }).catch(() => {});
    // Task #2686 — refresh health-checks tile/engine periodicamente
    runMapsHealthChecks(true).catch(() => {});
  }, CLEANUP_MS);
  cleanupTimer.unref?.();
  startWeeklyReportScheduler();
  console.log("[watchdog/scheduler] avviato (tick=60s)");
}

export function stopWatchdogScheduler(): void {
  if (tickTimer) { clearTimeout(tickTimer); tickTimer = null; }
  if (cleanupTimer) { clearInterval(cleanupTimer); cleanupTimer = null; }
}

export function getWatchdogStats() {
  const cooldownRemainingSec =
    lastProposerRunAt > 0
      ? Math.max(0, Math.ceil((PROPOSER_COOLDOWN_MS - (Date.now() - lastProposerRunAt)) / 1000))
      : 0;
  return {
    totalCycles, totalAutoFixesApplied, totalProposalsCreated, totalAlertsSent,
    lastError, running: !!tickTimer,
    proposer: {
      lastRunAt: lastProposerRunAt > 0 ? new Date(lastProposerRunAt).toISOString() : null,
      cooldownRemainingSec,
      cooldownTotalSec: PROPOSER_COOLDOWN_MS / 1000,
    },
  };
}
