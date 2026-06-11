// Task #2503 — worker auto-rollback OTA
// Per ogni release con auto_rollback_enabled=true e abbastanza segnale telemetrico,
// marca automaticamente la release come `rejected` se il boot success rate è sotto soglia.
//
// Si attiva su:
//   - status='pending' (qualsiasi età)
//   - status='approved' pubblicata negli ultimi 2 ore (oltre quel limite assumiamo che la
//     release sia stabile e non vogliamo auto-rejectarla per fluttuazioni statistiche).
//
// Non interrompe i download in corso: marca solo lo stato in DB; gli utenti che hanno già
// scaricato il bundle lo mantengono. La protezione è per i NUOVI cold-start.
import { db } from "../db";
import { otaReleases } from "@shared/db";
import { eq, and, or, sql, inArray } from "drizzle-orm";
import { withDbRetry } from "../lib/db-retry";

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

export async function runOtaAutoRollback(): Promise<void> {
  try {
    const candidates = await withDbRetry("[ota-rollback]", () =>
      db.select().from(otaReleases).where(
        and(
          eq(otaReleases.autoRollbackEnabled, true),
          inArray(otaReleases.status, ["pending", "approved"]),
        ),
      ),
    );

    const now = Date.now();
    for (const r of candidates) {
      // Skip release già auto-rollbackate
      if (r.autoRolledBackAt) continue;
      // Skip approved più vecchie di 2 ore
      const publishedTs = r.publishedAt instanceof Date ? r.publishedAt.getTime() : new Date(r.publishedAt as unknown as string).getTime();
      if (r.status === "approved" && now - publishedTs > TWO_HOURS_MS) continue;
      // Finestra minima (deve passare almeno autoRollbackWindowMinutes dalla publish)
      const windowMs = (r.autoRollbackWindowMinutes ?? 30) * 60 * 1000;
      if (now - publishedTs < windowMs) continue;
      // Min downloads
      if ((r.downloadCount ?? 0) < (r.autoRollbackMinDownloads ?? 10)) continue;
      // Calcola success rate
      const downloads = r.downloadCount ?? 0;
      const successes = r.bootSuccessCount ?? 0;
      const rate = downloads > 0 ? Math.round((successes / downloads) * 100) : 100;
      if (rate >= (r.autoRollbackThreshold ?? 70)) continue;

      console.warn(
        `[ota][AUTO-ROLLBACK] release ${r.id} (${r.easUpdateId}) — boot success ${successes}/${downloads} (${rate}%) < soglia ${r.autoRollbackThreshold}% → REJECT`,
      );

      await withDbRetry("[ota-rollback]", () =>
        db
          .update(otaReleases)
          .set({
            status: "rejected",
            rejectedAt: new Date(),
            rejectedBy: null,
            autoRolledBackAt: new Date(),
          })
          .where(eq(otaReleases.id, r.id)),
      );
    }
  } catch (err) {
    console.warn("[ota][AUTO-ROLLBACK] worker error:", err);
  }
}

// Silenziatore — helper futuri
void or; void sql;
