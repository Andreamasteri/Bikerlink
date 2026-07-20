// Collector riavvii container Docker routing (Task #947) — detecta restart
// non pianificati dei container bikerlink-gh-* e bikerlink-valhalla tramite
// l'endpoint HTTP /container-restarts del TC agent (stats-server.js).
//
// Strategia di rilevamento:
//   - Prima run: campiona i RestartCount attuali come baseline, nessun segnale.
//   - Run successive: se RestartCount cresce → emette segnale "high" con delta
//     e conteggio totale per ogni container riavviato nel collector window.
//   - TC non configurato / non raggiungibile: skip silenzioso (nessun segnale).
//   - powered_off admin-marcato: skip (riavvio intenzionale o manutenzione).
//
// Segnale emesso:
//   source: "tc", metric: "tc.gh_container_restarted", severity: "high"
//   value:   numero di container con RestartCount cresciuto
//   details: { containers: [{ name, restartCount, delta, startedAt }], total }
//
// Il segnale "high" non passa dal loop critical-only di alerts.ts: serve un
// blocco dedicato in dispatchAlerts che itera containers e invia una push per
// ciascuno con throttle per-container (chiave "tc.gh_container_restart.<name>").

import type { Signal } from "../types";
import { cfAccessHeaders } from "../../../lib/cf-access";
import { isThinkCentrePoweredOff } from "../../../lib/thinkcentre-powered-off";

const AGENT_TIMEOUT_MS = 8_000;

// ---- Stato persistente ---------------------------------------------------
// Mappa container name → ultimo RestartCount campionato.
// La prima run popola la baseline e restituisce sempre [] (no false positive).
const lastRestartCount = new Map<string, number>();
let baselineSet = false;

// ---- Fetch verso il TC agent --------------------------------------------
interface ContainerInfo {
  name: string;
  restartCount: number;
  status: string;
  startedAt: string;
}

async function fetchContainerRestarts(): Promise<ContainerInfo[] | null> {
  const metricsBase = process.env.THINKCENTRE_METRICS_URL?.trim().replace(/\/$/, "");
  if (!metricsBase) return null;

  const token = process.env.THINKCENTRE_AGENT_TOKEN ?? "";
  const headers: Record<string, string> = { ...cfAccessHeaders() };
  if (token) headers["X-Agent-Token"] = token;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AGENT_TIMEOUT_MS);
  try {
    const res = await fetch(`${metricsBase}/container-restarts`, {
      signal: controller.signal,
      headers,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const raw = await res.json() as unknown;
    if (!Array.isArray(raw)) return null;
    return raw.filter(
      (c): c is ContainerInfo =>
        c !== null &&
        typeof c === "object" &&
        typeof (c as ContainerInfo).name === "string" &&
        typeof (c as ContainerInfo).restartCount === "number" &&
        typeof (c as ContainerInfo).status === "string",
    );
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ---- Collector pubblico -------------------------------------------------
export async function collectGhContainerRestarts(): Promise<Signal[]> {
  // Se il TC è esplicitamente spento dall'admin, un riavvio container è
  // intenzionale o conseguenza della manutenzione: non emettere alert.
  const poweredOff = await isThinkCentrePoweredOff().catch(() => false);
  if (poweredOff) return [];

  const containers = await fetchContainerRestarts();
  if (containers === null) return [];

  if (!baselineSet) {
    // Prima run: popola la baseline senza emettere segnali (evita falsi
    // positivi al boot del server quando i container potrebbero avere
    // RestartCount > 0 da riavvii storici già noti).
    for (const c of containers) lastRestartCount.set(c.name, c.restartCount);
    baselineSet = true;
    return [];
  }

  // Run successive: rileva aumenti del RestartCount rispetto alla baseline
  // rolling aggiornata a ogni tick.
  const restarted: Array<{
    name: string;
    restartCount: number;
    delta: number;
    startedAt: string;
  }> = [];

  for (const c of containers) {
    const prev = lastRestartCount.get(c.name);
    if (prev === undefined) {
      // Container non visto nella baseline (nuovo): aggiorna senza alert.
      lastRestartCount.set(c.name, c.restartCount);
      continue;
    }
    if (c.restartCount > prev) {
      restarted.push({
        name: c.name,
        restartCount: c.restartCount,
        delta: c.restartCount - prev,
        startedAt: c.startedAt,
      });
    }
    // Aggiorna il contatore rolling (baseline segue i riavvii rilevati).
    lastRestartCount.set(c.name, c.restartCount);
  }

  if (restarted.length === 0) return [];

  const total = restarted.reduce((s, c) => s + c.delta, 0);
  const names = restarted
    .map((c) => c.name.replace("bikerlink-", ""))
    .join(", ");
  console.warn(
    `[watchdog/gh-container-restart] ${restarted.length} container riavviati: ${names} (+${total} restart)`,
  );

  // Un segnale PER container riavviato, con metric name che include il nome
  // corto (es. "tc.gh_container_restarted.gh-arco-alpino"). Questo garantisce:
  //   - detail JSON piccolo (<200 char) → nessun rischio di troncamento a 300 in deriveProblems
  //   - ogni problem ha ID univoco → alerts.ts può iterarli senza parsing fragile
  //   - fallback sicuro: se detail non si parsea, container name è ricavabile dall'ID
  return restarted.map((c) => {
    const containerKey = c.name.replace("bikerlink-", "");
    return {
      source: "tc" as const,
      metric: `tc.gh_container_restarted.${containerKey}`,
      value: c.delta,
      unit: "restarts",
      severity: "high" as const,
      details: {
        name: c.name,
        restartCount: c.restartCount,
        delta: c.delta,
        startedAt: c.startedAt,
      },
    };
  });
}

// Esposto solo per i test: azzera lo stato tra un test e l'altro.
export function _resetGhContainerRestartStateForTests(): void {
  lastRestartCount.clear();
  baselineSet = false;
}
