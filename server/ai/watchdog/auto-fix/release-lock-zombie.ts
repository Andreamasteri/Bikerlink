// Task #2533 — Auto-fix: rilascia il lock matching se più vecchio di 30 min
// (scheduler probabilmente bloccato). Operazione idempotente.
import { storage } from "../../../storage";
import type { AutoFixRule } from "../types";

const STALE_THRESHOLD_MIN = 30;

export const releaseLockZombie: AutoFixRule = {
  id: "release_lock_zombie",
  description: "Rilascia lock matching scheduler vecchio >30 min",
  async run(snap) {
    const lockAge = snap.metrics["scheduler.scheduler.lock_age_min"];
    if (!Number.isFinite(lockAge) || lockAge < STALE_THRESHOLD_MIN) {
      return { applied: false, reason: "lock non zombie" };
    }
    try {
      const row = await storage.getAppSetting("matching_scheduler_state");
      const parsed = (row?.valueJson ?? {}) as Record<string, unknown>;
      delete parsed.lockedAt;
      await storage.upsertAppSetting("matching_scheduler_state",
        JSON.stringify({ ...parsed, lockReleasedByWatchdogAt: new Date().toISOString() }),
      );
      return {
        applied: true,
        summary: `Lock matching rilasciato (era attivo da ${Math.round(lockAge)} min)`,
        details: { lockAgeMin: lockAge },
      };
    } catch (err) {
      return { applied: false, reason: (err as Error).message };
    }
  },
};
