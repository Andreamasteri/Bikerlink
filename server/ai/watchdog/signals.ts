// Task #2533 — Helper per scrivere signals nel DB + cleanup retention.
import { db } from "../../db";
import { systemSignals } from "@shared/db";
import { lt } from "drizzle-orm";
import type { Signal } from "./types";

const RETENTION_DAYS = 7;

export async function recordSignals(signals: Signal[]): Promise<void> {
  if (!signals.length) return;
  try {
    await db.insert(systemSignals).values(
      signals.map((s) => ({
        source: s.source,
        metric: s.metric,
        value: s.value ?? null,
        unit: s.unit ?? null,
        severity: s.severity,
        details: (s.details ?? null) as object | null,
      })),
    );
  } catch (err) {
    console.warn("[watchdog/signals] insert error (non-fatal):", err);
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
