/**
 * dump-boot-log.ts — log di boot APPROFONDITO, leggibile in tempo reale dall'agente.
 *
 * Mirror del pattern di scripts/dump-diagnostic-report.ts. Consolida in un'unica
 * vista tre fonti già esistenti nel DB (dev e prod condividono il managed Postgres):
 *
 *   1. boot_gate_enabled        (app_settings)  → BootGuard attivo o spento.
 *   2. boot_gate_latest_ping    (app_settings)  → timeline dell'ultimo boot bisect
 *      (snapshot riscritto a OGNI ping del device, ultimi 30 step). Ogni step è
 *      annotato con etichetta + modulo + knownRisks da lib/boot-gate-steps.ts,
 *      così si capisce SUBITO a quale area (e a quale fix anti-crash-loop)
 *      corrisponde ogni checkpoint.
 *   3. app_crash_logs           (tabella)        → crash/segnali recenti dei device.
 *
 * Modalità:
 *   npx tsx scripts/dump-boot-log.ts            # watch continuo (default, ogni 15s)
 *   npx tsx scripts/dump-boot-log.ts --once     # one-shot, stato attuale
 *   npx tsx scripts/dump-boot-log.ts --limit 5  # one-shot + ultimi 5 crash log
 *
 * In watch stampa SOLO quando cambia qualcosa (nuovo ping o nuovo crash), così
 * `refresh_all_logs` cattura gli eventi di boot appena arrivano.
 */

import { desc, eq, gt } from "drizzle-orm";
import { db } from "../server/db";
import { appSettings, appCrashLogs } from "../shared/db/system";
import { users } from "../shared/db/users";
import { getBootStep } from "../lib/boot-gate-steps";

const POLL_INTERVAL_MS = 15_000;

const STATUS_ICON: Record<string, string> = {
  reached: "▶️ ",
  passed: "✅",
  ok: "✅",
  stopped: "⛔",
  failed: "❌",
  error: "❌",
  skipped: "⏭️ ",
  timeout: "⏱️ ",
};

interface PingEntry {
  step: string;
  status: string;
  ts: number;
  note: string | null;
}

interface PingSnapshot {
  deviceId?: string;
  platform?: string | null;
  appVersion?: string | null;
  step?: string;
  status?: string;
  note?: string | null;
  ts?: number;
  totalSteps?: number;
  entries?: PingEntry[];
}

interface BootError {
  message?: string;
  stack?: string;
  componentStack?: string;
  platform?: string;
  appVersion?: string;
  isFatal?: boolean;
  ts?: number;
}

function printError(err: BootError): void {
  console.log(`\n  ── Ultimo errore di boot ${err.isFatal ? "(FATALE)" : ""} ──`);
  console.log(`  Quando: ${fmtTs(err.ts)}   ${err.platform ?? "?"}  app=${err.appVersion ?? "—"}`);
  console.log(`  ❌ ${err.message ?? "unknown"}`);
  if (err.stack) console.log(`  stack:\n    ${err.stack.split("\n").join("\n    ")}`);
  if (err.componentStack) console.log(`  componentStack:\n    ${err.componentStack.split("\n").join("\n    ")}`);
}

function parseArgs(): { mode: "watch" | "once"; crashLimit: number } {
  const args = process.argv.slice(2);
  if (args.includes("--once") || args.includes("--limit")) {
    const idx = args.indexOf("--limit");
    let crashLimit = 5;
    if (idx !== -1 && args[idx + 1]) {
      const n = parseInt(args[idx + 1], 10);
      if (!isNaN(n) && n > 0) crashLimit = n;
    }
    return { mode: "once", crashLimit };
  }
  return { mode: "watch", crashLimit: 5 };
}

async function readSetting(key: string): Promise<{ value: string | null; updatedAt: Date } | null> {
  const [row] = await db
    .select({ value: appSettings.value, updatedAt: appSettings.updatedAt })
    .from(appSettings)
    .where(eq(appSettings.key, key))
    .limit(1);
  return row ?? null;
}

function fmtTs(ts: number | undefined): string {
  if (!ts || !Number.isFinite(ts)) return "—";
  try {
    return new Date(ts).toISOString();
  } catch {
    return String(ts);
  }
}

function printGateFlag(value: string | null | undefined): void {
  const enabled = value === "true";
  console.log(`  BootGuard: ${enabled ? "🟢 ATTIVO" : "⚪ spento"}  (boot_gate_enabled=${value ?? "—"})`);
}

function printTimeline(snap: PingSnapshot): void {
  const entries = Array.isArray(snap.entries) ? snap.entries : [];
  console.log(`\n  ── Ultimo boot (device ${snap.deviceId ?? "—"}) ──`);
  console.log(`  Piattaforma: ${snap.platform ?? "—"}   App: ${snap.appVersion ?? "—"}`);
  console.log(`  Step totali in questa sessione: ${snap.totalSteps ?? entries.length}`);
  console.log(`  Ultimo ping: ${fmtTs(snap.ts)}`);

  if (entries.length === 0) {
    console.log("  (nessuno step registrato)");
    return;
  }

  console.log(`\n  Timeline (ultimi ${entries.length}):`);
  for (const e of entries) {
    const meta = getBootStep(e.step);
    const icon = STATUS_ICON[e.status] ?? `[${e.status}]`;
    const label = meta ? meta.label : e.step;
    const note = e.note ? `  → ${e.note}` : "";
    console.log(`    ${icon} ${label} (${e.step}) [${e.status}]${note}`);
  }

  // Diagnosi: l'ultimo step "reached" senza "passed" successivo è il sospetto.
  const last = entries[entries.length - 1];
  const lastMeta = last ? getBootStep(last.step) : undefined;
  const looksStuck = last && (last.status === "reached" || last.status === "stopped" || last.status === "failed");
  if (looksStuck && lastMeta) {
    console.log(`\n  🔎 Sospetto: il boot si è fermato a "${lastMeta.label}" (${last.step}).`);
    console.log(`     Modulo:      ${lastMeta.module}`);
    console.log(`     Dipende da:  ${lastMeta.dependsOn}`);
    console.log(`     Rischi noti: ${lastMeta.knownRisks}`);
  }
}

async function printCrashLogs(limit: number, sinceTs?: number): Promise<number> {
  const base = db
    .select({
      id: appCrashLogs.id,
      nickname: users.nickname,
      userId: appCrashLogs.userId,
      crashType: appCrashLogs.crashType,
      appVersion: appCrashLogs.appVersion,
      platform: appCrashLogs.platform,
      deviceModel: appCrashLogs.deviceModel,
      errorMessage: appCrashLogs.errorMessage,
      reportedAt: appCrashLogs.reportedAt,
    })
    .from(appCrashLogs)
    .leftJoin(users, eq(appCrashLogs.userId, users.id))
    .orderBy(desc(appCrashLogs.reportedAt))
    .limit(limit);

  const rows = sinceTs
    ? await base.where(gt(appCrashLogs.reportedAt, new Date(sinceTs)))
    : await base;

  if (rows.length === 0) {
    if (!sinceTs) console.log("\n  ── Crash log recenti ──\n  (nessun crash registrato)");
    return sinceTs ?? 0;
  }

  console.log(`\n  ── Crash log recenti (${rows.length}) ──`);
  for (const r of rows) {
    const derived = (r.errorMessage ?? "").match(/^\[resume:([^\]]+)\]/)?.[1];
    const kind = derived ? `${r.crashType}/${derived}` : r.crashType;
    console.log(`    ❌ ${r.reportedAt.toISOString()}  ${kind}  ${r.platform ?? "?"} ${r.deviceModel ?? ""}`);
    console.log(`       utente=${r.nickname ?? r.userId ?? "—"}  app=${r.appVersion ?? "—"}`);
    if (r.errorMessage) console.log(`       msg: ${r.errorMessage.slice(0, 200)}`);
  }

  return Math.max(...rows.map((r) => r.reportedAt.getTime()));
}

async function dumpFull(crashLimit: number): Promise<void> {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  BOOT LOG DUMP  —  ${new Date().toISOString()}`);
  console.log(`${"═".repeat(60)}`);

  const flag = await readSetting("boot_gate_enabled");
  printGateFlag(flag?.value);

  const ping = await readSetting("boot_gate_latest_ping");
  if (ping?.value) {
    try {
      printTimeline(JSON.parse(ping.value) as PingSnapshot);
    } catch {
      console.log("\n  ⚠️  boot_gate_latest_ping non è JSON valido.");
    }
  } else {
    console.log("\n  ── Ultimo boot ──\n  (nessun ping ricevuto — BootGuard mai attivato o nessun avvio recente)");
  }

  const err = await readSetting("boot_gate_latest_error");
  if (err?.value) {
    try {
      printError(JSON.parse(err.value) as BootError);
    } catch {
      console.log("\n  ⚠️  boot_gate_latest_error non è JSON valido.");
    }
  }

  await printCrashLogs(crashLimit);
  console.log(`\n${"═".repeat(60)}\n`);
}

async function runWatch(): Promise<void> {
  console.log(`[watch-boot-log] Avviato — polling ogni ${POLL_INTERVAL_MS / 1000}s`);
  console.log(`[watch-boot-log] In attesa di nuovi eventi di boot...\n`);

  let lastPingTs = 0;
  let lastErrTs = 0;
  let lastCrashTs = Date.now();

  while (true) {
    try {
      const flag = await readSetting("boot_gate_enabled");
      const ping = await readSetting("boot_gate_latest_ping");
      let snap: PingSnapshot | null = null;
      if (ping?.value) {
        try {
          snap = JSON.parse(ping.value) as PingSnapshot;
        } catch {
          snap = null;
        }
      }
      const pingTs = snap?.ts ?? 0;
      const hasNewPing = pingTs > lastPingTs;

      if (hasNewPing && snap) {
        console.log(`\n${"═".repeat(60)}`);
        console.log(`  🆕 NUOVO EVENTO BOOT  —  ${new Date().toISOString()}`);
        console.log(`${"═".repeat(60)}`);
        printGateFlag(flag?.value);
        printTimeline(snap);
        console.log(`${"═".repeat(60)}\n`);
        lastPingTs = pingTs;
      }

      const errRow = await readSetting("boot_gate_latest_error");
      if (errRow?.value) {
        try {
          const err = JSON.parse(errRow.value) as BootError;
          if ((err.ts ?? 0) > lastErrTs) {
            console.log(`\n${"═".repeat(60)}`);
            console.log(`  🆕 NUOVO ERRORE BOOT  —  ${new Date().toISOString()}`);
            console.log(`${"═".repeat(60)}`);
            printError(err);
            console.log(`${"═".repeat(60)}\n`);
            lastErrTs = err.ts ?? Date.now();
          }
        } catch {
          // snapshot non valido, ignora
        }
      }

      const newest = await printCrashLogs(5, lastCrashTs);
      if (newest > lastCrashTs) lastCrashTs = newest;
    } catch (e) {
      console.error("[watch-boot-log] Errore durante il check:", e);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

async function main(): Promise<void> {
  const { mode, crashLimit } = parseArgs();
  if (mode === "watch") {
    await runWatch();
  } else {
    await dumpFull(crashLimit);
    process.exit(0);
  }
}

main().catch((err) => {
  console.error("[dump-boot-log] Errore:", err);
  process.exit(1);
});
