/**
 * Helper condiviso — legge il flag "thinkcentre_powered_off" da AppSettings.
 * Default: false (ThinkCentre considerato acceso).
 * Quando true: tutte le probe saltate, zero push inviate, routing su cloud.
 * Utilizzato da: thinkcentre-monitor, maps-health-checks, router-selector.
 */
import { db, withDbRetry } from "../db";
import { appSettings } from "@shared/db";
import { eq } from "drizzle-orm";
import { dedupWarn } from "./dedup-logger";

export async function isThinkCentrePoweredOff(): Promise<boolean> {
  try {
    const [row] = await withDbRetry(() =>
      db
        .select({ value: appSettings.value })
        .from(appSettings)
        .where(eq(appSettings.key, "thinkcentre_powered_off"))
        .limit(1),
    );
    return row?.value === "true";
  } catch (err) {
    dedupWarn("thinkcentre-powered-off", "errore lettura AppSetting powered_off (non-fatal)", err);
    return false;
  }
}
