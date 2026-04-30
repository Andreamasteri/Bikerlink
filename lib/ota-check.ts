import * as Updates from "expo-updates";
import { Platform } from "react-native";
import { getApiUrl } from "@/lib/query-client";

export type OtaTriggerSource = "startup" | "appstate" | "login" | "register" | "manual";
export type OtaPhase = "check" | "fetch" | "reload" | "no-update" | "fetch-not-new" | "fetched" | "skipped";

type OtaResultListener = (result: OtaManualResult) => void;
const _otaResultListeners = new Set<OtaResultListener>();

export function subscribeOtaResult(listener: OtaResultListener): () => void {
  _otaResultListeners.add(listener);
  return () => { _otaResultListeners.delete(listener); };
}

function _emitOtaResult(result: OtaManualResult) {
  for (const listener of _otaResultListeners) {
    try { listener(result); } catch {}
  }
}

export interface OtaManualResult {
  ok: boolean;
  phase: OtaPhase;
  error?: string;
  skipped?: "dev" | "web";
}

interface OtaErrorDetails {
  message: string;
  code?: string;
  cause?: string;
  nativeStack?: string;
  userInfo?: string;
}

interface OtaProbeResult {
  status?: number;
  contentType?: string;
  bodySnippet?: string;
  durationMs?: number;
  error?: string;
}

let lastCheckAt = 0;
let consecutiveFailures = 0;
let inFlight = false;

const COOLDOWN_NORMAL_MS = 60_000;
const COOLDOWN_AFTER_FAILURES_MS = 5 * 60_000;

// Task #1148: estrae il massimo dettaglio possibile dall'errore nativo
// (Updates.checkForUpdateAsync su Android lancia oggetti Error con
// `code`, `nativeStackAndroid`, `userInfo`, ecc., persi se si fa solo
// String(err)). Tutti i campi sono best-effort: se mancano restano undefined.
function extractErrorDetails(err: unknown): OtaErrorDetails {
  if (err == null) return { message: "null-or-undefined" };
  if (typeof err === "string") return { message: err.substring(0, 500) };
  if (typeof err !== "object") return { message: String(err).substring(0, 500) };

  const e = err as Record<string, unknown>;
  const out: OtaErrorDetails = {
    message: typeof e.message === "string" ? e.message.substring(0, 500) : String(err).substring(0, 500),
  };
  if (typeof e.code === "string" || typeof e.code === "number") {
    out.code = String(e.code).substring(0, 64);
  }
  if (e.cause != null) {
    try {
      const c = e.cause as Record<string, unknown>;
      const causeMsg = typeof c.message === "string" ? c.message : String(e.cause);
      out.cause = causeMsg.substring(0, 300);
    } catch {
      out.cause = "[unserializable cause]";
    }
  }
  if (typeof e.nativeStackAndroid === "string") {
    out.nativeStack = e.nativeStackAndroid.substring(0, 1500);
  } else if (Array.isArray(e.nativeStackAndroid)) {
    try {
      out.nativeStack = JSON.stringify(e.nativeStackAndroid).substring(0, 1500);
    } catch {}
  } else if (typeof e.stack === "string") {
    out.nativeStack = e.stack.substring(0, 1500);
  }
  if (e.userInfo != null) {
    try {
      out.userInfo = JSON.stringify(e.userInfo).substring(0, 500);
    } catch {
      out.userInfo = "[unserializable userInfo]";
    }
  }
  return out;
}

// Task #1148: probe HTTP diretto a /api/expo-updates con gli stessi
// header che expo-updates manda in produzione. Serve a separare problemi
// di rete/DNS/server da problemi del client expo-updates SDK.
async function runProbe(currentUpdateId: string, runtimeVersion: string): Promise<OtaProbeResult> {
  const start = Date.now();
  try {
    const url = new URL("/api/expo-updates", getApiUrl()).toString();
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "expo-runtime-version": runtimeVersion,
        "expo-platform": "android",
        "expo-current-update-id": currentUpdateId,
        "expo-protocol-version": "0",
        "expo-expect-signature": "false",
        "accept": "application/expo+json,application/json",
      },
    });
    const durationMs = Date.now() - start;
    const contentType = res.headers.get("content-type") ?? undefined;
    let bodySnippet: string | undefined;
    try {
      // 204 / 304 hanno body vuoto: prova comunque ma senza fallire.
      const text = await res.text();
      bodySnippet = text ? text.substring(0, 200) : "";
    } catch {
      bodySnippet = "[body read failed]";
    }
    return {
      status: res.status,
      contentType: contentType ? contentType.substring(0, 64) : undefined,
      bodySnippet,
      durationMs,
    };
  } catch (probeErr) {
    return {
      durationMs: Date.now() - start,
      error: String(probeErr).substring(0, 200),
    };
  }
}

// Best-effort: se expo-network non è disponibile, ritorna "unknown".
async function getNetworkInfo(): Promise<string> {
  try {
    // @ts-ignore — pacchetto opzionale, caricato dinamicamente
    const net = await import("expo-network").catch(() => null);
    if (!net) return "unknown";
    const state = await (net as { getNetworkStateAsync?: () => Promise<{ isConnected?: boolean; isInternetReachable?: boolean; type?: string }> }).getNetworkStateAsync?.();
    if (!state) return "unknown";
    const conn = state.isConnected ? "online" : "offline";
    const reach = state.isInternetReachable === false ? "/no-inet" : "";
    const type = state.type ? `/${state.type}` : "";
    return `${conn}${reach}${type}`.substring(0, 64);
  } catch {
    return "unknown";
  }
}

interface ReportPayload {
  phase: OtaPhase;
  source: OtaTriggerSource;
  currentUpdateId: string;
  runtimeVersion: string;
  error?: string;
  failCount?: number;
  errorCode?: string;
  nativeStack?: string;
  updateUrl?: string;
  networkInfo?: string;
  probe?: OtaProbeResult;
}

function reportOtaEvent(payload: ReportPayload) {
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
        // Task #1148: nuovi campi diagnostici (tutti opzionali, troncati lato server).
        errorCode: payload.errorCode,
        nativeStack: payload.nativeStack,
        updateUrl: payload.updateUrl,
        networkInfo: payload.networkInfo,
        probe: payload.probe,
      }),
    }).catch(() => {});
  } catch {}
}

export async function triggerOtaCheck(
  source: OtaTriggerSource,
  options?: { force?: boolean; delayMs?: number },
): Promise<OtaManualResult> {
  if (__DEV__) {
    const r: OtaManualResult = { ok: false, phase: "skipped", skipped: "dev" };
    _emitOtaResult(r);
    return r;
  }
  if (Platform.OS === "web") {
    const r: OtaManualResult = { ok: false, phase: "skipped", skipped: "web" };
    _emitOtaResult(r);
    return r;
  }
  if (options?.delayMs && options.delayMs > 0) {
    await new Promise((r) => setTimeout(r, options.delayMs));
  }
  if (inFlight) {
    const r: OtaManualResult = { ok: false, phase: "check", error: "already in flight" };
    _emitOtaResult(r);
    return r;
  }

  const now = Date.now();
  const cooldown = consecutiveFailures >= 3 ? COOLDOWN_AFTER_FAILURES_MS : COOLDOWN_NORMAL_MS;
  if (!options?.force && now - lastCheckAt < cooldown) {
    const r: OtaManualResult = { ok: false, phase: "check", error: "cooldown" };
    _emitOtaResult(r);
    return r;
  }

  inFlight = true;
  lastCheckAt = now;

  const currentUpdateId = Updates.updateId ?? "embedded";
  const runtimeVersion = Updates.runtimeVersion ?? "unknown";
  const updateUrl = (Updates as { updateUrl?: string | null }).updateUrl ?? undefined;
  let phase: OtaPhase = "check";

  // Task #1148: probe + checkForUpdateAsync in parallelo.
  // Il probe non deve mai bloccare il check: il suo risultato serve solo
  // come diagnostica, e viene atteso solo nel ramo di errore (Promise.allSettled
  // più avanti garantisce che non venga mai propagata un'eccezione del probe).
  const probePromise = runProbe(currentUpdateId, runtimeVersion);
  const networkInfoPromise = getNetworkInfo();

  try {
    const check = await Updates.checkForUpdateAsync();
    if (!check.isAvailable) {
      consecutiveFailures = 0;
      reportOtaEvent({ phase: "no-update", source, currentUpdateId, runtimeVersion });
      const r: OtaManualResult = { ok: true, phase: "no-update" };
      _emitOtaResult(r);
      // Lasciamo che probe/network completino in background per non sprecare la chiamata.
      probePromise.catch(() => {});
      networkInfoPromise.catch(() => {});
      return r;
    }

    phase = "fetch";
    const fetched = await Updates.fetchUpdateAsync();
    if (!fetched.isNew) {
      consecutiveFailures = 0;
      reportOtaEvent({ phase: "fetch-not-new", source, currentUpdateId, runtimeVersion });
      const r: OtaManualResult = { ok: true, phase: "fetch-not-new" };
      _emitOtaResult(r);
      probePromise.catch(() => {});
      networkInfoPromise.catch(() => {});
      return r;
    }

    reportOtaEvent({ phase: "fetched", source, currentUpdateId, runtimeVersion });

    phase = "reload";
    await Updates.reloadAsync();
    // reloadAsync non ritorna sotto normali condizioni — l'app si riavvia.
    const r: OtaManualResult = { ok: true, phase: "reload" };
    _emitOtaResult(r);
    return r;
  } catch (err) {
    consecutiveFailures += 1;
    const details = extractErrorDetails(err);
    // Aspetta il probe e network info SOLO se il check è fallito (worth waiting).
    const [probeRes, netInfo] = await Promise.all([
      probePromise.catch((e) => ({ error: String(e).substring(0, 200) } as OtaProbeResult)),
      networkInfoPromise.catch(() => "unknown"),
    ]);
    const errMsg = `[${phase}/${source}] ${details.message}`;
    reportOtaEvent({
      phase,
      source,
      currentUpdateId,
      runtimeVersion,
      error: errMsg,
      failCount: consecutiveFailures,
      errorCode: details.code,
      nativeStack: details.nativeStack,
      updateUrl,
      networkInfo: netInfo,
      probe: probeRes,
    });
    const r: OtaManualResult = { ok: false, phase, error: errMsg };
    _emitOtaResult(r);
    return r;
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
