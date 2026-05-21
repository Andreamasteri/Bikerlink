import * as Updates from "expo-updates";
import { AppState, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApiUrl } from "@/lib/query-client";
import { incrementStuckSessions, getLastFetchedId, setLastFetchedId } from "@/lib/ota-stuck";
import { getCachedDeviceId } from "@/lib/device-id";

// Chiave AsyncStorage per il flag di reload pendente.
// Viene scritto dopo ogni fetchUpdateAsync() riuscito.
// Letto al cold start in OtaStartupChecker (_layout.tsx): se presente,
// reloadAsync() viene chiamato immediatamente (prima dei 3s di ritardo),
// garantendo che l'aggiornamento venga applicato anche se il background
// listener di AppState non funzionò nella sessione precedente (Android).
export const OTA_PENDING_KEY = "@bikerlink/ota_pending_reload";

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

// Task #1164: riavvio differito — flag attivato dopo il download se l'app
// è in primo piano. Il reload effettivo scatta quando AppState va in background.
let _pendingReload = false;
let _bgListenerSub: ReturnType<typeof AppState.addEventListener> | null = null;

// Quanti ms l'app deve restare in background prima che reloadAsync() scatti.
// 5s evita reload indesiderati per switch rapidi ad altre app.
const BG_RELOAD_DELAY_MS = 5_000;

function _scheduleReloadOnBackground() {
  if (_bgListenerSub) return;

  // Timer locale alla closure: si avvia quando l'app va in background,
  // si cancella se torna in primo piano prima dei 5s.
  let bgTimer: ReturnType<typeof setTimeout> | null = null;

  const _doReload = () => {
    bgTimer = null;
    if (!_pendingReload) return;
    _pendingReload = false;
    if (_bgListenerSub) {
      _bgListenerSub.remove();
      _bgListenerSub = null;
    }
    // Cancella il flag persistente solo se reloadAsync() ha successo.
    // Se il reload fallisce silenziosamente nel background listener (comune
    // su Android), il flag rimane e OtaStartupChecker lo applica al cold start.
    Updates.reloadAsync()
      .then(() => AsyncStorage.removeItem(OTA_PENDING_KEY).catch(() => {}))
      .catch(() => {});
  };

  _bgListenerSub = AppState.addEventListener("change", (nextState) => {
    if (nextState === "background" && _pendingReload) {
      // Avvia il timer solo se non è già partito.
      if (!bgTimer) {
        bgTimer = setTimeout(_doReload, BG_RELOAD_DELAY_MS);
      }
    } else if (nextState === "active") {
      // Tornato in primo piano prima dei 5s → annulla il reload.
      if (bgTimer) {
        clearTimeout(bgTimer);
        bgTimer = null;
      }
    }
  });
}

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
// Task #1148: probe con timeout duro di 8s tramite AbortController. Senza
// limite, una rete che hangs (DNS lento, captive portal) ritardarebbe la
// segnalazione dell'errore OTA finché il fetch non scade da solo (>30s).
const OTA_PROBE_TIMEOUT_MS = 8000;
async function runProbe(currentUpdateId: string, runtimeVersion: string): Promise<OtaProbeResult> {
  const start = Date.now();
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), OTA_PROBE_TIMEOUT_MS);
  try {
    const url = new URL("/api/expo-updates", getApiUrl()).toString();
    const res = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "expo-runtime-version": runtimeVersion,
        "expo-platform": "android",
        "expo-current-update-id": currentUpdateId,
        "expo-protocol-version": "1",
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
    const aborted = (probeErr as { name?: string })?.name === "AbortError";
    return {
      durationMs: Date.now() - start,
      error: aborted ? `timeout-${OTA_PROBE_TIMEOUT_MS}ms` : String(probeErr).substring(0, 200),
    };
  } finally {
    clearTimeout(timeoutHandle);
  }
}

// Stub: `expo-network` NON è installato in package.json. Un dynamic import con
// stringa letterale verrebbe risolto comunque da Metro al bundle time e farebbe
// fallire la build. Per ora ritorna sempre "unknown"; basta installare
// `expo-network` e riscrivere questa funzione per popolarla davvero.
async function getNetworkInfo(): Promise<string> {
  return "unknown";
}

interface ReportPayload {
  phase: OtaPhase;
  source: OtaTriggerSource;
  currentUpdateId: string;
  runtimeVersion: string;
  error?: string;
  failCount?: number;
  errorCode?: string;
  errorCause?: string;
  errorUserInfo?: string;
  nativeStack?: string;
  updateUrl?: string;
  channel?: string;
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
        // Task #1625: stable device fingerprint (cached sync value, loaded at init).
        deviceId: getCachedDeviceId(),
        // Task #1148: nuovi campi diagnostici (tutti opzionali, troncati lato server).
        errorCode: payload.errorCode,
        errorCause: payload.errorCause,
        errorUserInfo: payload.errorUserInfo,
        nativeStack: payload.nativeStack,
        updateUrl: payload.updateUrl,
        channel: payload.channel,
        networkInfo: payload.networkInfo,
        probe: payload.probe,
      }),
    }).catch(() => {});
  } catch {}
}

export async function triggerOtaCheck(
  source: OtaTriggerSource,
  options?: { force?: boolean; delayMs?: number; immediateReload?: boolean },
): Promise<OtaManualResult> {
  if (__DEV__) {
    const r: OtaManualResult = { ok: false, phase: "skipped", skipped: "dev" };
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
  // Task #1148: Updates.channel ("default", "preview", ...) aiuta a distinguere
  // device su build con channel sbagliato — frequente causa di "no update" persistente.
  const channel = (Updates as { channel?: string | null }).channel ?? undefined;
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
      // Siamo aggiornati: cancella l'eventuale flag residuo di sessioni precedenti.
      AsyncStorage.removeItem(OTA_PENDING_KEY).catch(() => {});
      reportOtaEvent({ phase: "no-update", source, currentUpdateId, runtimeVersion });
      const r: OtaManualResult = { ok: true, phase: "no-update" };
      _emitOtaResult(r);
      // Lasciamo che probe/network completino in background per non sprecare la chiamata.
      probePromise.catch(() => {});
      networkInfoPromise.catch(() => {});
      return r;
    }

    // Task #1587: stale-session detection.
    // If an update is available but we're still running the same bundle ID we
    // had last time we tried to fetch, the previous fetch+reload didn't advance
    // the bundle → potential stuck state. Increment the stuck-sessions counter.
    // Skip in __DEV__ (expo-updates is a no-op anyway).
    if (!__DEV__) {
      try {
        const lastFetchedId = await getLastFetchedId();
        if (lastFetchedId && lastFetchedId === currentUpdateId) {
          incrementStuckSessions().catch(() => {});
        }
        // Record the ID we're running right now before we try to fetch.
        await setLastFetchedId(currentUpdateId);
      } catch {}
    }

    phase = "fetch";
    const fetched = await Updates.fetchUpdateAsync();
    if (!fetched.isNew) {
      // L'update era già stato scaricato in una sessione precedente ma reloadAsync
      // non è mai stato chiamato (es. app chiusa di forza prima del backgrounding).
      // Il bundle è pronto: lo applichiamo adesso con la stessa logica del ramo normale.
      consecutiveFailures = 0;
      probePromise.catch(() => {});
      networkInfoPromise.catch(() => {});
      reportOtaEvent({ phase: "fetch-not-new", source, currentUpdateId, runtimeVersion });
      const appIsActive = AppState.currentState === "active";
      if (options?.immediateReload || !appIsActive) {
        phase = "reload";
        AsyncStorage.removeItem(OTA_PENDING_KEY).catch(() => {});
        await Updates.reloadAsync();
        const r: OtaManualResult = { ok: true, phase: "reload" };
        _emitOtaResult(r);
        return r;
      }
      // Persiste il flag: se il background listener non scatta (Android),
      // il prossimo cold start chiamerà reloadAsync() prima dei 3s.
      AsyncStorage.setItem(OTA_PENDING_KEY, "1").catch(() => {});
      _pendingReload = true;
      _scheduleReloadOnBackground();
      const r: OtaManualResult = { ok: true, phase: "fetch-not-new" };
      _emitOtaResult(r);
      return r;
    }

    consecutiveFailures = 0;
    reportOtaEvent({ phase: "fetched", source, currentUpdateId, runtimeVersion });
    probePromise.catch(() => {});
    networkInfoPromise.catch(() => {});

    // Task #1164: riavvio differito al backgrounding.
    // Se il check è manuale (admin) o l'app è già in background, riavviamo subito.
    // Altrimenti aspettiamo che l'utente esca dall'app (AppState → background).
    const appIsActive = AppState.currentState === "active";
    if (options?.immediateReload || !appIsActive) {
      phase = "reload";
      AsyncStorage.removeItem(OTA_PENDING_KEY).catch(() => {});
      await Updates.reloadAsync();
      // reloadAsync non ritorna sotto normali condizioni — l'app si riavvia.
      const r: OtaManualResult = { ok: true, phase: "reload" };
      _emitOtaResult(r);
      return r;
    }

    // App in primo piano: schedula il reload al prossimo backgrounding.
    // Persiste il flag su AsyncStorage: se il background listener non scatta
    // (comportamento inaffidabile su Android), il cold start successivo
    // rileverà il flag e chiamerà reloadAsync() immediatamente.
    AsyncStorage.setItem(OTA_PENDING_KEY, "1").catch(() => {});
    _pendingReload = true;
    _scheduleReloadOnBackground();
    const r: OtaManualResult = { ok: true, phase: "fetched" };
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
      errorCause: details.cause,
      errorUserInfo: details.userInfo,
      nativeStack: details.nativeStack,
      updateUrl,
      channel,
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
 * Trigger manuale dal pannello admin: bypassa il cooldown e ricarica subito.
 * La UI può mostrare un toast con phase + eventuale errore.
 */
export async function runManualOtaCheck(): Promise<OtaManualResult> {
  return triggerOtaCheck("manual", { force: true, immediateReload: true });
}

export function resetOtaCooldown() {
  lastCheckAt = 0;
  consecutiveFailures = 0;
}
