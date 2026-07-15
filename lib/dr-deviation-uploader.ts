/**
 * Task #47 — DR correction engine: client-side deviation reporter.
 *
 * Sends GPS-vs-dead-reckoning deviation samples to the server in small incremental
 * packets (one per confirmed blackout recovery), mirroring the incremental
 * telemetry-upload pattern (never one bulk upload at ride end). Best-effort and
 * fire-and-forget: a failed report is non-fatal — deviations are supplementary
 * training data, not ride-critical state.
 */

import { apiRequest } from "@/lib/query-client";
import { markAsyncError } from "@/lib/crash-logger";
import type { DrDeviationSample } from "@shared/dr-correction";

export function reportDrDeviation(sample: DrDeviationSample): void {
  apiRequest("POST", "/api/telemetry/dr-deviation", { samples: [sample] }, { timeoutMs: 8_000 })
    .catch((e) => {
      markAsyncError("dr_deviation_upload", e).catch(() => {});
    });
}
