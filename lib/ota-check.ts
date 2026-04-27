import * as Updates from "expo-updates";
import { Platform } from "react-native";
import { getApiUrl } from "@/lib/query-client";

export type OtaTriggerSource = "startup" | "appstate" | "login" | "register" | "manual";
export type OtaPhase = "check" | "fetch" | "reload" | "no-update" | "fetch-not-new" | "fetched" | "skipped";

export interface OtaManualResult {
  ok: boolean;
  phase: OtaPhase;
  error?: string;
  skipped?: "dev" | "web";
}

let lastCheckAt = 0;
let consecutiveFailures = 0;
let inFlight = false;

const COOLDOWN_NORMAL_MS = 60_000;
const COOLDOWN_AFTER_FAILURES_MS = 5 * 60_000;

function reportOtaEvent(payload: {
  phase: OtaPhase;
  source: OtaTriggerSource;
  currentUpdateId: string;
  runtimeVersion: string;
  error?: string;
  failCount?: number;
}) {
  try {
    fetch(new URL("/api/admin/ota-error", getApiUrl()).toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: payload.error ?? `ok:${payload.phase}`,
        failCount: payload.failCount ?? 0,
        updateId: payload.currentUpdateId,
        runtimeVersion: payload.runtimeVersion,
        phase: payload.phase,
        source: payload.source,
        platform: Platform.OS,
      }),
    }).catch(() => {});
  } catch {}
}

export async function triggerOtaCheck(
  source: OtaTriggerSource,
  options?: { force?: boolean; delayMs?: number },
): Promise<OtaManualResult> {
  if (__DEV__) return { ok: false, phase: "skipped", skipped: "dev" };
  if (Platform.OS === "web") return { ok: false, phase: "skipped", skipped: "web" };
  if (options?.delayMs && options.delayMs > 0) {
    await new Promise((r) => setTimeout(r, options.delayMs));
  }
  if (inFlight) return { ok: false, phase: "check", error: "already in flight" };

  const now = Date.now();
  const cooldown = consecutiveFailures >= 3 ? COOLDOWN_AFTER_FAILURES_MS : COOLDOWN_NORMAL_MS;
  if (!options?.force && now - lastCheckAt < cooldown) {
    return { ok: false, phase: "check", error: "cooldown" };
  }

  inFlight = true;
  lastCheckAt = now;

  const currentUpdateId = Updates.updateId ?? "embedded";
  const runtimeVersion = Updates.runtimeVersion ?? "unknown";
  let phase: OtaPhase = "check";

  try {
    const check = await Updates.checkForUpdateAsync();
    if (!check.isAvailable) {
      consecutiveFailures = 0;
      reportOtaEvent({ phase: "no-update", source, currentUpdateId, runtimeVersion });
      return { ok: true, phase: "no-update" };
    }

    phase = "fetch";
    const fetched = await Updates.fetchUpdateAsync();
    if (!fetched.isNew) {
      consecutiveFailures = 0;
      reportOtaEvent({ phase: "fetch-not-new", source, currentUpdateId, runtimeVersion });
      return { ok: true, phase: "fetch-not-new" };
    }

    reportOtaEvent({ phase: "fetched", source, currentUpdateId, runtimeVersion });

    phase = "reload";
    await Updates.reloadAsync();
    // reloadAsync non ritorna sotto normali condizioni — l'app si riavvia.
    return { ok: true, phase: "reload" };
  } catch (err) {
    consecutiveFailures += 1;
    const errMsg = `[${phase}/${source}] ${String(err)}`;
    reportOtaEvent({
      phase,
      source,
      currentUpdateId,
      runtimeVersion,
      error: errMsg,
      failCount: consecutiveFailures,
    });
    return { ok: false, phase, error: errMsg };
  } finally {
    inFlight = false;
  }
}

/**
 * Trigger manuale dal pannello admin: bypassa il cooldown e ritorna l'esito
 * sincronizzato (così la UI può mostrare un toast con phase + eventuale errore).
 */
export async function runManualOtaCheck(): Promise<OtaManualResult> {
  return triggerOtaCheck("manual", { force: true });
}

export function resetOtaCooldown() {
  lastCheckAt = 0;
  consecutiveFailures = 0;
}
