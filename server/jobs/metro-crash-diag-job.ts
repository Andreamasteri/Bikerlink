// Metro crash JSONL → diagnostic_reports job.
//
// Legge /tmp/metro-crash-diag.jsonl, classifica i crash (replicando la logica
// di scripts/metro-crash-summary.sh) e inserisce un sommario nella tabella
// `diagnostic_reports` con triggeredBy="scheduler".
//
// Il watermark AppSetting `metro_crash_diag_last_line` registra il numero di
// righe già processate; il job è no-op se il file non esiste o non ha righe
// nuove dall'ultima esecuzione.
import fs from "fs";
import { Cron } from "croner";
import { db } from "../db";
import { diagnosticReports } from "@shared/db";
import { storage } from "../storage";

const METRO_DIAG_LOG = process.env.METRO_DIAG_LOG ?? "/tmp/metro-crash-diag.jsonl";
const WATERMARK_KEY = "metro_crash_diag_last_line";
const SOURCE = "metro-crash-diag";

// ── Tipi interni ─────────────────────────────────────────────────────────────

interface CrashRecord {
  type: "crash";
  ts: string;
  session_id: string;
  exit_code: number;
  signal_num: number;
  signal_name: string;
  verdict: string;
  uptime_secs: number;
}

interface SnapshotRecord {
  type: "snapshot";
  ts: string;
  session_id: string;
  oom_found: number;
}

type DiagRecord = CrashRecord | SnapshotRecord;

export interface MetroCrashSummary {
  source: string;
  total: number;
  crashCount: number;
  snapshotCount: number;
  byVerdict: {
    platform_recycle: number;
    sigkill_oom: number;
    internal_crash: number;
    clean_exit: number;
    other: number;
  };
  dominant: string | null;
  dominantPct: number;
  dominantLabel: string;
  oomCount: number;
  firstTs: string | null;
  lastTs: string | null;
  newLines: number;
}

// ── Classificatore ────────────────────────────────────────────────────────────

export function classifyMetroCrashLog(jsonlContent: string): MetroCrashSummary {
  const lines = jsonlContent.split("\n").filter((l) => l.trim().length > 0);
  const records: DiagRecord[] = [];

  for (const line of lines) {
    try {
      const obj = JSON.parse(line) as DiagRecord;
      if (obj.type === "crash" || obj.type === "snapshot") {
        records.push(obj);
      }
    } catch {
      // riga malformata — ignora
    }
  }

  const crashes = records.filter((r): r is CrashRecord => r.type === "crash");
  const snapshots = records.filter((r): r is SnapshotRecord => r.type === "snapshot");

  // Conteggio iniziale verdetti
  const byVerdict = {
    platform_recycle: 0,
    sigkill_oom: 0,
    internal_crash: 0,
    clean_exit: 0,
    other: 0,
  };

  for (const c of crashes) {
    const v = c.verdict as keyof typeof byVerdict;
    if (v in byVerdict) {
      byVerdict[v]++;
    } else {
      byVerdict.other++;
    }
  }

  // OOM upgrade per-session_id (replica logica shell)
  // Per ogni snapshot con oom_found=1, cerca i crash con lo stesso session_id
  // che erano platform_recycle o internal_crash e li "promuove" a sigkill_oom.
  const oomSessionIds = new Set<string>(
    snapshots
      .filter((s) => s.oom_found === 1 && s.session_id)
      .map((s) => s.session_id),
  );

  const oomCount = oomSessionIds.size;

  for (const sid of oomSessionIds) {
    const sessionCrashes = crashes.filter((c) => c.session_id === sid);
    for (const c of sessionCrashes) {
      if (c.verdict === "platform_recycle") {
        byVerdict.platform_recycle = Math.max(0, byVerdict.platform_recycle - 1);
        byVerdict.sigkill_oom++;
      } else if (c.verdict === "internal_crash") {
        byVerdict.internal_crash = Math.max(0, byVerdict.internal_crash - 1);
        byVerdict.sigkill_oom++;
      }
    }
  }

  // Timestamp primo e ultimo record
  const allTs = records.map((r) => r.ts).filter(Boolean);
  const firstTs = allTs.length > 0 ? allTs[0] : null;
  const lastTs = allTs.length > 0 ? allTs[allTs.length - 1] : null;

  // Verdetto dominante (stessa soglia dello script shell)
  let dominant: string | null = null;
  let dominantPct = 0;
  let dominantLabel = "";
  const crashCount = crashes.length;

  if (crashCount > 0) {
    const candidates: Array<{ key: string; label: string; count: number }> = [
      { key: "platform_recycle", label: "PLATFORM_RECYCLE (SIGTERM esterno)", count: byVerdict.platform_recycle },
      { key: "sigkill_oom",      label: "SIGKILL/OOM (confermato da snapshot)", count: byVerdict.sigkill_oom },
      { key: "internal_crash",   label: "INTERNAL_CRASH (exit senza segnale)", count: byVerdict.internal_crash },
      { key: "clean_exit",       label: "CLEAN_EXIT (exit 0)", count: byVerdict.clean_exit },
    ];
    const top = candidates.reduce((best, c) => (c.count > best.count ? c : best), candidates[0]);
    if (top.count > 0) {
      dominantPct = Math.floor((top.count / crashCount) * 100);
      dominant = top.key;
      if (dominantPct >= 70) {
        dominantLabel = `CAUSA PROBABILE: ${top.label} (${dominantPct}%, ${crashCount} crash)`;
      } else if (dominantPct >= 40) {
        dominantLabel = `CAUSA PREVALENTE ma non esclusiva: ${top.label} (${dominantPct}%, ${crashCount} crash)`;
      } else {
        dominantLabel = `CAUSA INCERTA — distribuzione frammentata (${dominantPct}%, ${crashCount} crash)`;
      }
    }
  }

  return {
    source: SOURCE,
    total: records.length,
    crashCount,
    snapshotCount: snapshots.length,
    byVerdict,
    dominant,
    dominantPct,
    dominantLabel,
    oomCount,
    firstTs,
    lastTs,
    newLines: lines.length,
  };
}

// ── Job principale ────────────────────────────────────────────────────────────

export async function runMetroCrashDiagJob(): Promise<void> {
  try {
    // Leggi il file; se non esiste è no-op
    let fileContent: string;
    try {
      fileContent = fs.readFileSync(METRO_DIAG_LOG, "utf8");
    } catch {
      console.log("[metro-crash-diag-job] file non trovato — nessun crash Metro registrato ancora");
      return;
    }

    const allLines = fileContent.split("\n").filter((l) => l.trim().length > 0);
    const totalLines = allLines.length;

    if (totalLines === 0) {
      console.log("[metro-crash-diag-job] file vuoto — skip");
      return;
    }

    // Leggi watermark
    let lastLine = 0;
    try {
      const setting = await storage.getAppSetting(WATERMARK_KEY);
      if (setting?.value) {
        const parsed = parseInt(setting.value, 10);
        if (!isNaN(parsed) && parsed >= 0) lastLine = parsed;
      }
    } catch {
      // usa 0
    }

    if (totalLines <= lastLine) {
      console.log(`[metro-crash-diag-job] nessuna riga nuova (watermark=${lastLine}, total=${totalLines}) — skip`);
      return;
    }

    // Processa solo le righe nuove
    const newLines = allLines.slice(lastLine);
    const summary = classifyMetroCrashLog(newLines.join("\n"));

    if (summary.crashCount === 0 && summary.snapshotCount === 0) {
      // Nessun record valido nelle righe nuove; aggiorna comunque il watermark
      await storage.upsertAppSetting(WATERMARK_KEY, String(totalLines));
      return;
    }

    // Inserisci in diagnostic_reports
    await db.insert(diagnosticReports).values({
      userId: null,
      triggeredBy: "scheduler",
      appVersion: null,
      platform: "server",
      deviceModel: null,
      buildProfile: null,
      sentryEventId: null,
      summary: summary as unknown as Record<string, unknown>,
      results: null,
    });

    // Aggiorna watermark
    await storage.upsertAppSetting(WATERMARK_KEY, String(totalLines));

    console.log(
      `[metro-crash-diag-job] report inserito — crash=${summary.crashCount} snap=${summary.snapshotCount} dominante=${summary.dominant ?? "n/d"} (${summary.dominantPct}%) newLines=${summary.newLines}`,
    );
  } catch (err) {
    console.warn("[metro-crash-diag-job] errore non fatale:", (err as Error).message?.slice(0, 300));
  }
}

// ── Scheduler giornaliero ─────────────────────────────────────────────────────

let cron: Cron | null = null;

export function startMetroCrashDiagScheduler(): void {
  if (cron) return;
  try {
    // Esecuzione ogni giorno alle 06:15 Europe/Rome (fuori dal burst di avvio
    // e prima del report settimanale di lunedì alle 07:00).
    cron = new Cron("15 6 * * *", { timezone: "Europe/Rome" }, async () => {
      try {
        await runMetroCrashDiagJob();
      } catch (err) {
        console.warn("[metro-crash-diag-job] cron error:", err);
      }
    });
    // Esegui subito al boot (con delay per non contendere il burst iniziale)
    setTimeout(() => {
      runMetroCrashDiagJob().catch((e) =>
        console.warn("[metro-crash-diag-job] run iniziale error:", e),
      );
    }, 5 * 60 * 1000);
    console.log("[metro-crash-diag-job] scheduler attivo (ogni giorno 06:15 Europe/Rome)");
  } catch (err) {
    console.warn("[metro-crash-diag-job] scheduler init error:", err);
  }
}

export function stopMetroCrashDiagScheduler(): void {
  if (cron) { cron.stop(); cron = null; }
}
