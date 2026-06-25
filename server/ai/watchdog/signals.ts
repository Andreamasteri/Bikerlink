// Task #2533 — Helper per scrivere signals nel DB + cleanup retention.
import { db, withDbRetry } from "../../db";
import { systemSignals } from "@shared/db";
import { lt } from "drizzle-orm";
import type { Signal } from "./types";
import { dedupWarn } from "../../lib/dedup-logger";
import { withBgDbSlot } from "../../lib/bg-db-limiter";

const RETENTION_DAYS = 7;

export async function recordSignals(signals: Signal[]): Promise<void> {
  if (!signals.length) return;
  const valid = signals.filter((s) => s.source && s.metric && s.severity);
  if (!valid.length) return;
  try {
    // Bulk insert avvolto nel budget connessioni bg: aspetta il suo turno
    // (max 3 slot) e non compete con il traffico utente quando il pool è saturo.
    await withBgDbSlot(() => withDbRetry(() => db.insert(systemSignals).values(
      valid.map((s) => ({
        source: s.source,
        metric: String(s.metric).substring(0, 80),
        value: s.value ?? null,
        unit: s.unit ? String(s.unit).substring(0, 20) : null,
        severity: s.severity,
        details: (s.details ?? null) as object | null,
      })),
    ).onConflictDoNothing()));
  } catch (err) {
    dedupWarn("watchdog/signals", "insert error (non-fatal)", err);
  }
}

export async function cleanupOldSignals(): Promise<number> {
  try {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const out = await db.delete(systemSignals).where(lt(systemSignals.createdAt, cutoff)).returning({ id: systemSignals.id });
    return out.length;
  } catch (err) {
    console.warn("[watchdog/signals] cleanup error:", err);
    return 0;
  }
}
