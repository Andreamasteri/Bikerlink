// Task #354 — Sampler background metriche ThinkCentre.
//
// Campiona le metriche di sistema del TC ogni 60s, indipendentemente dal fatto
// che un admin stia guardando il pannello. Se il TC è offline scrive una riga
// con online=false e tutte le metriche null (nessun crash). Il cleanup delle
// righe più vecchie di 7 giorni gira ogni 6 ore (stesso pattern di
// db-monitor-history.ts).
//
// Ogni scrittura e ogni cleanup passano da withBgDbSlot + withDbRetry per non
// saturare il pool delle connessioni (max=10).
import { db, withDbRetry } from "../db";
import { tcMetricsHistory } from "@shared/db";
import { lt } from "drizzle-orm";
import { withBgDbSlot } from "../lib/bg-db-limiter";
import { cfAccessHeaders } from "../lib/cf-access";
import { dedupWarn } from "../lib/dedup-logger";

const SAMPLE_INTERVAL_MS = 60_000;     // 1 campione al minuto
const CLEANUP_INTERVAL_MS = 6 * 60 * 60_000; // cleanup ogni 6 ore
const RETENTION_DAYS = 7;
const FETCH_TIMEOUT_MS = 8_000;

let _sampleTimer: ReturnType<typeof setInterval> | null = null;
let _cleanupTimer: ReturnType<typeof setInterval> | null = null;

/** Preleva le metriche dal TC e scrive una riga nella tabella. */
async function sampleAndWrite(): Promise<void> {
  const metricsBase = process.env.THINKCENTRE_METRICS_URL?.trim().replace(/\/$/, "");
  const METRICS_URL = metricsBase ? `${metricsBase}/sys-metrics` : null;
  const AGENT_TOKEN = process.env.THINKCENTRE_AGENT_TOKEN ?? "";

  if (!METRICS_URL) return; // non configurato → skip silenzioso

  let row: {
    online: boolean;
    cpuTempC?: number | null;
    gpuTempC?: number | null;
    gpuUtilPct?: number | null;
    vramUsedMb?: number | null;
    vramTotalMb?: number | null;
    loadAvg1?: number | null;
    ramUsedPct?: number | null;
    netRxKbs?: number | null;
    netTxKbs?: number | null;
    diskReadKbs?: number | null;
    diskWriteKbs?: number | null;
  } = { online: false };

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const headers: Record<string, string> = { ...cfAccessHeaders() };
    if (AGENT_TOKEN) headers["X-Agent-Token"] = AGENT_TOKEN;

    const upstream = await fetch(METRICS_URL, { signal: controller.signal, headers });
    clearTimeout(timer);

    if (upstream.ok) {
      const data = await upstream.json() as Record<string, unknown>;
      const ramUsedMb  = typeof data.ramUsedMb  === "number" ? data.ramUsedMb  : null;
      const ramTotalMb = typeof data.ramTotalMb  === "number" ? data.ramTotalMb : null;
      const ramUsedPct = ramUsedMb != null && ramTotalMb != null && ramTotalMb > 0
        ? (ramUsedMb / ramTotalMb) * 100
        : null;

      row = {
        online:       true,
        cpuTempC:     typeof data.cpuTempC     === "number" ? data.cpuTempC     : null,
        gpuTempC:     typeof data.gpuTempC     === "number" ? data.gpuTempC     : null,
        gpuUtilPct:   typeof data.gpuUtilPct   === "number" ? data.gpuUtilPct   : null,
        vramUsedMb:   typeof data.vramUsedMb   === "number" ? Math.round(data.vramUsedMb)  : null,
        vramTotalMb:  typeof data.vramTotalMb  === "number" ? Math.round(data.vramTotalMb) : null,
        loadAvg1:     typeof data.loadAvg1     === "number" ? data.loadAvg1     : null,
        ramUsedPct:   ramUsedPct,
        netRxKbs:     typeof data.netRxKBs     === "number" ? data.netRxKBs     : null,
        netTxKbs:     typeof data.netTxKBs     === "number" ? data.netTxKBs     : null,
        diskReadKbs:  typeof data.diskReadKBs  === "number" ? data.diskReadKBs  : null,
        diskWriteKbs: typeof data.diskWriteKBs === "number" ? data.diskWriteKBs : null,
      };
    }
  } catch {
    // timeout o irraggiungibile → online=false già impostato, nessun crash
  }

  try {
    await withBgDbSlot(() =>
      withDbRetry(() =>
        db.insert(tcMetricsHistory).values({
          sampledAt: new Date(),
          ...row,
        }),
      ),
    );
  } catch (err) {
    dedupWarn("tc-metrics-sampler", "write error (non-fatal)", err);
  }
}

/** Elimina le righe più vecchie di 7 giorni. */
async function cleanup(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60_000);
    await withBgDbSlot(() =>
      withDbRetry(() =>
        db.delete(tcMetricsHistory).where(lt(tcMetricsHistory.sampledAt, cutoff)),
      ),
    );
  } catch (err) {
    dedupWarn("tc-metrics-sampler", "cleanup error (non-fatal)", err);
  }
}

/**
 * Avvia il sampler e il timer di cleanup. Idempotente: chiamate successive
 * sono no-op. Il primo campione viene prelevato subito (non dopo 60s).
 */
export function startTcMetricsSampler(): void {
  if (_sampleTimer) return;

  // Primo campione ritardato di 90s dal boot per non aggiungere pressione
  // al pool durante la fase di init più intensa.
  setTimeout(() => {
    sampleAndWrite().catch(() => {});
    _sampleTimer = setInterval(() => { sampleAndWrite().catch(() => {}); }, SAMPLE_INTERVAL_MS);
    _sampleTimer.unref?.();
  }, 90_000).unref?.();

  // Cleanup: primo dopo 5 min, poi ogni 6h.
  setTimeout(() => { cleanup().catch(() => {}); }, 5 * 60_000).unref?.();
  _cleanupTimer = setInterval(() => { cleanup().catch(() => {}); }, CLEANUP_INTERVAL_MS);
  _cleanupTimer.unref?.();
}
