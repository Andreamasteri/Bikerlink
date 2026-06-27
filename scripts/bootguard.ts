/**
 * bootguard.ts — interruttore del BootGuard (BootGate diagnostico, Task #4979/#5061).
 *
 * Scrive/legge il flag remoto `boot_gate_enabled` in app_settings. Il client lo
 * riceve dal manifest OTA (GET /api/ota/manifest → bootGateEnabled) e al prossimo
 * avvio entra nel percorso BootGate (bisect interattivo + ping passivi). Spento
 * (default) → boot normale invariato.
 *
 * ⚠️  Ambiente: lo script usa `server/db` (stesso DATABASE_URL del server). In
 *     questo Repl dev e produzione condividono il database gestito, quindi
 *     scrivere qui ha effetto REALE sui device in produzione al prossimo avvio.
 *
 * Uso:
 *   npx tsx scripts/bootguard.ts on        # attiva il BootGuard (boot_gate_enabled=true)
 *   npx tsx scripts/bootguard.ts off       # disattiva (boot_gate_enabled=false)
 *   npx tsx scripts/bootguard.ts status    # mostra lo stato corrente (default)
 */

import { eq } from "drizzle-orm";
import { db } from "../server/db";
import { appSettings } from "../shared/db/system";

const FLAG_KEY = "boot_gate_enabled";
const DESCRIPTION =
  "Task #4979/#5061 — attiva il BootGuard diagnostico (BootGate) sui device al prossimo avvio.";

type Action = "on" | "off" | "status";

function parseAction(): Action {
  const raw = (process.argv[2] ?? "status").toLowerCase();
  if (raw === "on" || raw === "enable" || raw === "true" || raw === "1") return "on";
  if (raw === "off" || raw === "disable" || raw === "false" || raw === "0") return "off";
  return "status";
}

async function readFlag(): Promise<boolean> {
  const [row] = await db
    .select({ value: appSettings.value, updatedAt: appSettings.updatedAt })
    .from(appSettings)
    .where(eq(appSettings.key, FLAG_KEY))
    .limit(1);
  return row?.value === "true";
}

async function writeFlag(enabled: boolean): Promise<void> {
  await db
    .insert(appSettings)
    .values({ key: FLAG_KEY, value: enabled ? "true" : "false", description: DESCRIPTION })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value: enabled ? "true" : "false", updatedAt: new Date() },
    });
}

function banner(enabled: boolean): string {
  return enabled
    ? "🟢 BootGuard ATTIVO — i device entrano nella diagnostica al prossimo avvio."
    : "⚪ BootGuard SPENTO — boot normale (percorso invariato).";
}

async function main(): Promise<void> {
  const action = parseAction();

  if (action === "status") {
    const enabled = await readFlag();
    console.log(`\n${"═".repeat(56)}`);
    console.log(`  BootGuard — stato corrente`);
    console.log(`${"═".repeat(56)}`);
    console.log(`  ${banner(enabled)}`);
    console.log(`  Flag DB: ${FLAG_KEY} = ${enabled ? "true" : "false"}`);
    console.log(`${"═".repeat(56)}\n`);
    process.exit(0);
  }

  const target = action === "on";
  const before = await readFlag();
  await writeFlag(target);
  const after = await readFlag();

  console.log(`\n${"═".repeat(56)}`);
  console.log(`  BootGuard — ${target ? "ATTIVAZIONE" : "DISATTIVAZIONE"}`);
  console.log(`${"═".repeat(56)}`);
  console.log(`  Prima:  ${before ? "true" : "false"}`);
  console.log(`  Dopo:   ${after ? "true" : "false"}`);
  console.log(`  ${banner(after)}`);
  if (after !== target) {
    console.error("  ⚠️  Il flag non risulta aggiornato come atteso!");
    console.log(`${"═".repeat(56)}\n`);
    process.exit(1);
  }
  console.log(`${"═".repeat(56)}\n`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[bootguard] Errore:", err);
  process.exit(1);
});
