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
//     consecutivi (prima "warn"), come il collector DragonflyDB;
//   - ogni SIZE_CHECK_EVERY_N probe riuscite controlla la dimensione dei file in
//     ~/agent-shared/: se un file supera LARGE_FILE_WARN_BYTES emette
//     `ai_hub.large_file` (warn) per ricordare di rieseguire la probe latenza
//     di Task #244 e aggiornare HUB_FILE_READ_TIMEOUT_MS se necessario.
//
// Naming interno: source "ai_hub" (vedi server/ai/watchdog/types.ts); l'id del
// problema diventa `ai_hub.ai_hub.unreachable` in deriveProblems.
import type { Signal } from "../types";
import { AI_HUB_PING_WARN_MS, hubGet, isHubConfigured, setHubReachable, HUB_HEALTH_TIMEOUT_MS, HUB_FILE_READ_TIMEOUT_MS } from "../../../lib/ai-hub-client";
import { isThinkCentrePoweredOff } from "../../../lib/thinkcentre-powered-off";
import { isThinkCentreInMaintenance } from "../../../lib/thinkcentre-maintenance";

const FAILURES_BEFORE_HIGH = 3;

// Contatore fallimenti consecutivi — azzerato a ogni probe riuscita.
let consecutiveFailures = 0;
// True dopo la prima probe riuscita in questa sessione: l'escalazione a "high"
// richiede che l'hub fosse stato raggiungibile in precedenza.
let hadSuccessfulProbe = false;

// ── Check dimensioni file (Task #248) ─────────────────────────────────────────
//
// Ogni SIZE_CHECK_EVERY_N probe riuscite chiama /files/list (root) per trovare
// il file più grande in ~/agent-shared/. Se supera LARGE_FILE_WARN_BYTES emette
// un segnale warn: la latenza di /files/read è proporzionale alla dimensione del
// file (endpoint I/O-bound) e il margine ×25 calcolato su file da 3.6 KB
// potrebbe ridursi significativamente su file grandi.
//
// Il check è best-effort: un errore /files/list non produce segnali aggiuntivi.

/** Soglia dimensione file oltre la quale aggiornare HUB_FILE_READ_TIMEOUT_MS. */
const LARGE_FILE_WARN_BYTES = 50_000; // 50 KB
/** Esegue il check ogni N probe riuscite (~10 min a cadenza 1 min). */
const SIZE_CHECK_EVERY_N = 10;

// Contatore probe riuscite per il throttle del size-check.
let successfulProbeCount = 0;

interface HubFileEntry {
  name: string;
  type?: string;
  size?: number;
}

async function checkHubFileSizes(signals: Signal[]): Promise<void> {
  const res = await hubGet<{ ok?: boolean; files?: HubFileEntry[] }>(
    "/files/list", {}, HUB_FILE_READ_TIMEOUT_MS,
  );
  if (!res.ok || !res.data) return; // best-effort: nessun segnale se la lista fallisce

  const files: HubFileEntry[] = res.data.files ?? [];
  const largest = files
    .filter((f) => f.type !== "directory" && typeof f.size === "number")
    .reduce<{ name: string; size: number } | null>((max, f) => {
      const s = f.size as number;
      return !max || s > max.size ? { name: f.name, size: s } : max;
    }, null);

  if (largest && largest.size > LARGE_FILE_WARN_BYTES) {
    signals.push({
      source: "ai_hub",
      metric: "ai_hub.large_file",
      severity: "warn",
      details: {
        file: largest.name,
        sizeBytes: largest.size,
        sizeKb: Math.round(largest.size / 1024),
        note: "Rieseguire la probe latenza /files/read (Task #244) e aggiornare HUB_FILE_READ_TIMEOUT_MS in ai-hub-client.ts se il margine ×25 non è più garantito",
      },
    });
  }
}

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

  // hubGet include automaticamente X-Hub-Gate-Token + CF Access headers.
  // NON usare fetch diretto: senza X-Hub-Gate-Token l'hub risponde 401 e la probe
  // segnerebbe l'hub come irraggiungibile falsamente (task #153 review feedback).
  // Timeout dedicato 5s: una probe di salute non deve bloccare il ciclo watchdog.
  const started = Date.now();
  const result = await hubGet("/health", undefined, HUB_HEALTH_TIMEOUT_MS);
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

    // Task #248: ogni SIZE_CHECK_EVERY_N probe riuscite controlla la dimensione
    // dei file in ~/agent-shared/ per avvisare se un file supera la soglia oltre
    // la quale il margine di HUB_FILE_READ_TIMEOUT_MS va rimisurato.
    successfulProbeCount += 1;
    if (successfulProbeCount >= SIZE_CHECK_EVERY_N) {
      successfulProbeCount = 0;
      await checkHubFileSizes(signals).catch(() => {/* best-effort */});
    }
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
