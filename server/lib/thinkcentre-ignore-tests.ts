/**
 * Helper condiviso — legge il flag "thinkcentre_ignore_for_tests" da AppSettings.
 * Default: false (alerting normale attivo).
 * Quando true: il proposer AI watchdog salta tutte le segnalazioni relative al ThinkCentre.
 * Il routing cloud fallback rimane invariato — solo gli alert vengono soppressi.
 * Utilizzato da: watchdog/proposer, route admin thinkcentre-health.
 */
import { db, withDbRetry } from "../db";
import { appSettings } from "@shared/db";
import { eq } from "drizzle-orm";
import { dedupWarn } from "./dedup-logger";

export async function isThinkCentreIgnoredForTests(): Promise<boolean> {
  try {
    const [row] = await withDbRetry(() =>
      db
        .select({ value: appSettings.value })
        .from(appSettings)
        .where(eq(appSettings.key, "thinkcentre_ignore_for_tests"))
        .limit(1),
    );
    return row?.value === "true";
  } catch (err) {
    dedupWarn("thinkcentre-ignore-tests", "errore lettura AppSetting ignore_for_tests (non-fatal)", err);
    return false;
  }
}
