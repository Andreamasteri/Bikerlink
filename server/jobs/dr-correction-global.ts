/**
 * Task #47 — Periodic recompute of the GLOBAL DR correction aggregate.
 *
 * The per-user correction model is refreshed in real time on each ingestion batch
 * (see server/dr-correction/engine.ts). The GLOBAL cross-user aggregate is heavier
 * (it scans all non-test deviation samples in the window), so it runs on this
 * periodic job instead. Test/synthetic users are excluded at the query level so
 * synthetic verification data never pollutes the global statistics.
 */

import { dedupWarn } from "../lib/dedup-logger";
import { recomputeGlobalModel } from "../dr-correction/engine";

let lastStats = { sampleCount: 0, contributingUsers: 0, durationMs: 0 };
export function getLastDrCorrectionGlobalStats() {
  return lastStats;
}

export async function recomputeDrCorrectionGlobal(): Promise<number> {
  const startedAt = Date.now();
  try {
    const model = await recomputeGlobalModel();
    const elapsed = Date.now() - startedAt;
    lastStats = {
      sampleCount: model.sampleCount,
      contributingUsers: model.contributingUsers,
      durationMs: elapsed,
    };
    console.log(
      `[DrCorrectionGlobal] modello globale aggiornato — ${model.sampleCount} campioni, ` +
        `${model.contributingUsers} utenti, distScale=${model.distanceScale.toFixed(3)} ` +
        `speedScale=${model.speedScale.toFixed(3)} in ${(elapsed / 1000).toFixed(1)}s`,
    );
    return model.sampleCount;
  } catch (err) {
    dedupWarn("dr-correction-global", "errore recompute globale (non-fatal)", err);
    lastStats = { ...lastStats, durationMs: Date.now() - startedAt };
    return 0;
  }
}
