/**
 * Helper condiviso — legge il flag "thinkcentre_maintenance_mode" da AppSettings.
 * Default: false (manutenzione disattivata).
 * Utilizzato da: thinkcentre-monitor, maps-health-checks, route admin.
 */
import { db, withDbRetry } from "../db";
import { appSettings } from "@shared/db";
import { eq } from "drizzle-orm";
import { dedupWarn } from "./dedup-logger";

export async function isThinkCentreInMaintenance(): Promise<boolean> {
  try {
    const [row] = await withDbRetry(() =>
      db
        .select({ value: appSettings.value })
        .from(appSettings)
        .where(eq(appSettings.key, "thinkcentre_maintenance_mode"))
        .limit(1),
    );
    return row?.value === "true";
  } catch (err) {
    dedupWarn("thinkcentre-maintenance", "errore lettura AppSetting maintenance_mode (non-fatal)", err);
    return false;
  }
}
