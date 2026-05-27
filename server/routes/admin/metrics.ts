// Task #2549 — Endpoint Prometheus admin generale.
// Espone tutte le metriche raccolte dall'app in formato Prometheus standard.
// Riusa il registry del modulo `matching/metrics` (lazy-loaded) come base e
// aggiunge gauge live per la salute del watchdog quando disponibile.
import { Router, type Request, type Response } from "express";
import { sendError } from "../../lib/api-response";
import { getMatchingMetrics } from "../../matching/metrics";
import { getLatestSnapshot } from "../../ai/watchdog/aggregator";
import { getWatchdogStats } from "../../ai/watchdog/scheduler";

const router = Router();

router.get("/metrics", async (_req: Request, res: Response) => {
  const base = await getMatchingMetrics();
  if (!base) {
    return res.status(503).type("text/plain").send("# prom-client non disponibile\n");
  }
  try {
    let extra = "";
    const snap = getLatestSnapshot();
    const stats = getWatchdogStats();
    if (snap) {
      const statusNum = snap.status === "green" ? 0 : snap.status === "yellow" ? 1 : snap.status === "orange" ? 2 : 3;
      extra += "# HELP bikerlink_watchdog_score Health score 0-100\n";
      extra += "# TYPE bikerlink_watchdog_score gauge\n";
      extra += `bikerlink_watchdog_score ${snap.score}\n`;
      extra += "# HELP bikerlink_watchdog_status_level 0=green 1=yellow 2=orange 3=red\n";
      extra += "# TYPE bikerlink_watchdog_status_level gauge\n";
      extra += `bikerlink_watchdog_status_level ${statusNum}\n`;
      extra += "# HELP bikerlink_watchdog_problems_total Problemi rilevati nell'ultimo snapshot\n";
      extra += "# TYPE bikerlink_watchdog_problems_total gauge\n";
      extra += `bikerlink_watchdog_problems_total ${snap.problems.length}\n`;
    }
    extra += "# HELP bikerlink_watchdog_cycles_total Cicli watchdog totali\n";
    extra += "# TYPE bikerlink_watchdog_cycles_total counter\n";
    extra += `bikerlink_watchdog_cycles_total ${stats.totalCycles}\n`;
    extra += "# HELP bikerlink_watchdog_auto_fixes_total Auto-fix applicati totali\n";
    extra += "# TYPE bikerlink_watchdog_auto_fixes_total counter\n";
    extra += `bikerlink_watchdog_auto_fixes_total ${stats.totalAutoFixesApplied}\n`;
    extra += "# HELP bikerlink_watchdog_proposals_total Proposte AI generate totali\n";
    extra += "# TYPE bikerlink_watchdog_proposals_total counter\n";
    extra += `bikerlink_watchdog_proposals_total ${stats.totalProposalsCreated}\n`;
    extra += "# HELP bikerlink_watchdog_alerts_total Alert inviati totali\n";
    extra += "# TYPE bikerlink_watchdog_alerts_total counter\n";
    extra += `bikerlink_watchdog_alerts_total ${stats.totalAlertsSent}\n`;

    const body = await base.register.metrics();
    res.setHeader("Content-Type", base.register.contentType);
    return res.send(body + "\n" + extra);
  } catch (error) {
    console.error("[admin/metrics] error:", error);
    return sendError(res, 500, "Errore serializzazione metriche");
  }
});

export default router;
