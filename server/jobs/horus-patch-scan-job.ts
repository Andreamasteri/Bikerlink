/**
 * Horus Patch Scan — scheduler settimanale (Task #662).
 *
 * Esegue automaticamente il patch scan (app/, scripts/, server/, shared/)
 * ogni domenica alle 02:00 Europe/Rome. Al termine:
 * - Il report viene salvato in logs/ con nome timestampato
 *   (dal core horus-patch-scan-resume.ts).
 * - Se ci sono trovati CRITICO o ALTO invia una push agli admin.
 * - Se Horus non è raggiungibile il run viene saltato con un warn.
 *
 * Lo script CLI horus-patch-scan-resume.ts è già resumabile: questo job
 * lo chiama in loop (max MAX_PASSES pass, max MAX_TOTAL_MS totale) finché
 * tutti i chunk sono classificati o il limite è raggiunto.
 * Usa --no-propose per non creare task automatici: la notifica push basta.
 */

import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import { Cron } from "croner";
import { withJobGate } from "../ai/coordinator/gated-job";
import { sendSystemAlertPushToAdmins } from "../push-notifications-admin";

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(__dirname, "../..");
const TIMEZONE = "Europe/Rome";
const LOG_PREFIX = "[horus-patch-scan/scheduler]";

// Budget temporale per scan settimanale completo.
// Il singolo pass è limitato dal guard interno dello script (4 min),
// qui usiamo 5 min per sicurezza + margine di spawn/stdio.
const PASS_TIMEOUT_MS = 5 * 60 * 1_000;
const MAX_TOTAL_MS = 30 * 60 * 1_000; // 30 min totali
const MAX_PASSES = 10;

let _scheduled = false;
let lastRunAt: string | null = null;
let lastError: { at: string; message: string } | null = null;

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function runScanPass(args: string[]): Promise<string> {
  const { stdout, stderr } = await execFileAsync(
    "npx",
    ["tsx", "scripts/horus-patch-scan-resume.ts", ...args],
    { cwd: ROOT, timeout: PASS_TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024 },
  );
  if (stderr?.trim()) {
    console.warn(`${LOG_PREFIX} pass stderr:`, stderr.slice(0, 400));
  }
  return stdout ?? "";
}

/** Estrae i conteggi CRITICO/ALTO dall'output finale dello script. */
function parseSeverityCounts(output: string): { critico: number; alto: number } {
  // Lo script stampa "🔴 CRITICO: N" e "🟠 ALTO   : N"
  const criticoMatch = output.match(/CRITICO\s*:\s*(\d+)/i);
  const altoMatch = output.match(/ALTO\s*:\s*(\d+)/i);
  return {
    critico: criticoMatch ? parseInt(criticoMatch[1], 10) : 0,
    alto: altoMatch ? parseInt(altoMatch[1], 10) : 0,
  };
}

/** Ritorna true se l'output indica che tutti i chunk sono stati elaborati. */
function isScanComplete(output: string): boolean {
  return (
    output.includes("Tutti i chunk") ||
    output.includes("già classificati") ||
    output.includes("💾 Report:")
  );
}

// ─── Corpo del job ────────────────────────────────────────────────────────────

export async function runHorusPatchScan(): Promise<void> {
  const horusUrl = process.env.HORUS_OLLAMA_URL?.trim();
  if (!horusUrl) {
    console.warn(`${LOG_PREFIX} HORUS_OLLAMA_URL non impostato — scan saltato`);
    return;
  }

  // Probe di raggiungibilità: /api/tags è l'endpoint standard di Ollama.
  // Se Horus è irraggiungibile il job si interrompe pulitamente.
  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 10_000);
    const resp = await fetch(`${horusUrl}/api/tags`, { signal: ctrl.signal });
    clearTimeout(tid);
    if (!resp.ok) {
      console.warn(`${LOG_PREFIX} Horus non raggiungibile (HTTP ${resp.status}) — scan saltato`);
      return;
    }
  } catch (err) {
    console.warn(
      `${LOG_PREFIX} Horus non raggiungibile — scan saltato:`,
      (err as Error).message?.slice(0, 200),
    );
    return;
  }

  const startedAt = Date.now();
  console.log(`${LOG_PREFIX} avvio scan settimanale...`);

  // Cancella lo stato residuo di run precedenti così il ciclo riparte da zero.
  try {
    await runScanPass(["--reset"]);
    console.log(`${LOG_PREFIX} stato precedente cancellato`);
  } catch (err) {
    // Non bloccante: se /tmp non ha stato il --reset è no-op e lo script continua.
    console.warn(`${LOG_PREFIX} reset fallito (continuo):`, (err as Error).message?.slice(0, 200));
  }

  let lastOutput = "";
  let pass = 0;
  let done = false;

  while (!done && pass < MAX_PASSES && Date.now() - startedAt < MAX_TOTAL_MS) {
    pass++;
    console.log(`${LOG_PREFIX} pass ${pass}/${MAX_PASSES}...`);
    try {
      // --no-propose: evita la creazione automatica di task dal CLI; la notifica
      // push agli admin è sufficiente per il ciclo schedulato.
      lastOutput = await runScanPass(["--no-propose"]);
      if (isScanComplete(lastOutput)) done = true;
    } catch (err) {
      // Un singolo pass in timeout non annulla tutto: lo stato su /tmp è persistito,
      // il prossimo pass riprende dai chunk rimasti.
      console.warn(`${LOG_PREFIX} pass ${pass} error (continuo):`, (err as Error).message?.slice(0, 300));
    }
  }

  lastRunAt = new Date().toISOString();
  const elapsedSec = Math.round((Date.now() - startedAt) / 1_000);

  if (!done) {
    const reason = pass >= MAX_PASSES ? `max pass (${MAX_PASSES})` : "timeout 30min";
    console.warn(`${LOG_PREFIX} scan incompleto (${reason}) dopo ${elapsedSec}s`);
    return;
  }

  const { critico, alto } = parseSeverityCounts(lastOutput);
  console.log(
    `${LOG_PREFIX} scan completato — CRITICO: ${critico}, ALTO: ${alto} — ${elapsedSec}s`,
  );

  if (critico > 0 || alto > 0) {
    try {
      const parts: string[] = [];
      if (critico > 0) parts.push(`🔴 ${critico} CRITICO`);
      if (alto > 0) parts.push(`🟠 ${alto} ALTO`);
      const sent = await sendSystemAlertPushToAdmins(
        "🔍 Horus Patch Scan — Workaround rilevati",
        `${parts.join(", ")} trovati. Controllare logs/horus-patch-scan-*.md`,
        { type: "horus_patch_scan", critico, alto },
      );
      if (sent > 0) {
        console.log(`${LOG_PREFIX} push inviata a ${sent} admin`);
      } else {
        console.log(`${LOG_PREFIX} push: nessun admin con token push attivo`);
      }
    } catch (pushErr) {
      console.warn(`${LOG_PREFIX} push error (non-fatal):`, pushErr);
    }
  }
}

// ─── Scheduling ───────────────────────────────────────────────────────────────

export function scheduleHorusPatchScan(): void {
  if (_scheduled) return;
  _scheduled = true;

  const gatedRun = withJobGate("horus-patch-scan", async () => {
    try {
      await runHorusPatchScan();
    } catch (err) {
      lastError = {
        at: new Date().toISOString(),
        message: (err as Error).message?.slice(0, 300) ?? "unknown",
      };
      console.warn(`${LOG_PREFIX} run error:`, err);
    }
  });

  try {
    // Domenica alle 02:00 Europe/Rome — non sovrappone con:
    //   nadir nightly   03:30
    //   db-integrity    03:00 / 04:00 (domenica)
    new Cron("0 2 * * 0", { timezone: TIMEZONE, protect: true }, gatedRun);
    console.log(`${LOG_PREFIX} scheduler avviato (dom 02:00 Europe/Rome)`);
  } catch (cronErr) {
    console.warn(`${LOG_PREFIX} croner non disponibile, fallback setInterval 7gg:`, cronErr);
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1_000;
    setInterval(gatedRun, SEVEN_DAYS_MS);
  }
}

export function getHorusPatchScanScheduleInfo() {
  return { scheduled: _scheduled, lastRunAt, lastError };
}
