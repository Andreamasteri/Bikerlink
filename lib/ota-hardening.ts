// Task #1357 — Sistema OTA modulare: hardening client.
//
// Tre responsabilità:
//  1. Iniettare il device ID come parametro extra nelle chiamate /api/expo-updates
//     (header "expo-extra-params" gestito automaticamente da expo-updates).
//  2. Heartbeat post-load: dopo che un OTA è stato caricato e l'app si è
//     riavviata, segnaliamo al server che il bundle gira davvero. Fire-and-forget,
//     una sola volta per session, timeout 3s.
//  3. ErrorRecovery: se un OTA appena scaricato genera errore di download/check
//     subito al boot, il bundle precedente (o l'embedded) viene mantenuto in
//     cache da expo-updates e checkAutomatically=ON_ERROR_RECOVERY fa già il
//     rollback nativo. Qui aggiungiamo un listener difensivo che forza
//     reloadAsync se siamo in stato di "rollback" pendente — guard anti-loop
//     tramite contatore in-memory.
//
// NOTA sull'header `expo-device-id`:
// Il server (server/routes.ts /api/expo-updates) legge `req.headers["expo-device-id"]`
// per fare slot-routing. Per iniettare un valore dinamico per-device usiamo
// `Updates.setUpdateRequestHeadersOverride` (SDK 55, experimental), che richiede
// `disableAntiBrickingMeasures: true` in app.json.updates. In app.json mettiamo
// un placeholder statico ("pending") che viene sovrascritto al primo avvio
// utile dall'override runtime.

import * as Updates from "expo-updates";
import { Platform } from "react-native";
import { getApiUrl } from "@/lib/query-client";
import { getStableDeviceId } from "@/lib/device-id";
import { CURRENT_OTA_NUMBER } from "@/lib/ota";

const HEARTBEAT_TIMEOUT_MS = 3000;
const ERROR_RECOVERY_MAX_RELOADS = 1; // anti-loop: max 1 reload-to-embedded per session

let _heartbeatSent = false;
let _hardeningInited = false;
let _errorReloadCount = 0;
let _stateListenerSub: { remove: () => void } | null = null;
let _seenCheckErrorSeq = -1;
let _seenDownloadErrorSeq = -1;

/**
 * Heartbeat fire-and-forget verso /api/ota/heartbeat.
 * Idempotente per sessione: chiamate successive sono no-op.
 * Inviato SOLO se l'app sta girando da un OTA scaricato (Updates.updateId
 * presente e diverso dal placeholder embedded).
 */
export async function sendOtaHeartbeatOnce(): Promise<void> {
  if (_heartbeatSent) return;
  if (__DEV__) return; // expo-updates è no-op in dev
  if (Platform.OS === "web") return;

  const updateId = Updates.updateId;
  if (!updateId) return; // nessun OTA caricato (embedded bundle): non c'è nulla da segnalare

  _heartbeatSent = true; // segna prima della fetch — evitiamo race su doppio mount

  try {
    const deviceId = await getStableDeviceId();
    const runtimeVersion = Updates.runtimeVersion ?? "unknown";

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), HEARTBEAT_TIMEOUT_MS);

    try {
      await fetch(new URL("/api/ota/heartbeat", getApiUrl()).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          deviceId,
          releaseId: updateId,
          runtimeVersion,
          otaNumber: CURRENT_OTA_NUMBER,
        }),
      }).catch(() => {});
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    // graceful degrade: heartbeat è fire-and-forget, nessun retry
  }
}

/**
 * Wiring difensivo per auto-rollback: se durante la sessione expo-updates
 * segnala uno stato di rollback pendente (es. il bundle attivo è marcato come
 * broken dal server tramite rollback directive), forziamo reloadAsync per
 * applicare il rollback al prossimo avvio. Guard anti-loop interno.
 *
 * Nota: il rollback nativo "vero" al bundle precedente avviene già
 * automaticamente tramite `checkAutomatically: ON_ERROR_RECOVERY` (vedi
 * app.json) quando l'app crasha al boot. Questo listener gestisce il caso
 * runtime in cui il server emette una rollback directive senza crash.
 */
function attachErrorRecoveryListener() {
  if (_stateListenerSub) return;
  if (__DEV__) return;
  if (Platform.OS === "web") return;

  try {
    _stateListenerSub = Updates.addUpdatesStateChangeListener((event) => {
      try {
        const ctx = event?.context;
        if (!ctx) return;

        // Caso 1: il server ha emesso una directive di rollback (o expo-updates
        // ha detectato che il bundle attivo non è più valido) → forziamo reload.
        // Se l'app sta girando da un OTA non-stable e quel bundle è marcato
        // come da rollbackare, expo-updates ha già scartato il manifest:
        // reloadAsync riparte sull'embedded bundle (il fallback nativo).
        if (ctx.rollback && _errorReloadCount < ERROR_RECOVERY_MAX_RELOADS) {
          _errorReloadCount += 1;
          Updates.reloadAsync().catch(() => {});
          return;
        }

        // Caso 2: errore al check del manifest. Notifichiamo il server
        // (telemetria) ma non facciamo reload: il bundle attivo è ancora sano.
        // Usiamo sequenceNumber per non riportare lo stesso errore due volte.
        if (ctx.checkError && ctx.sequenceNumber > _seenCheckErrorSeq) {
          _seenCheckErrorSeq = ctx.sequenceNumber;
          reportOtaListenerError("check", ctx.checkError, Updates.updateId);
          return;
        }

        // Caso 3: errore al download di un nuovo OTA. Idem: nessun reload,
        // il bundle attivo è valido. Telemetria una sola volta per evento.
        if (ctx.downloadError && ctx.sequenceNumber > _seenDownloadErrorSeq) {
          _seenDownloadErrorSeq = ctx.sequenceNumber;
          reportOtaListenerError("download", ctx.downloadError, Updates.updateId);
          return;
        }
      } catch {
        // listener non deve mai propagare eccezioni
      }
    });
  } catch {
    // API non disponibile / runtime non supportato: degrade silenzioso
  }
}

function reportOtaListenerError(
  phase: "check" | "download",
  err: Error,
  currentUpdateId: string | null,
): void {
  try {
    const msg = String(err?.message ?? err).substring(0, 500);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    fetch(new URL("/api/admin/ota-error", getApiUrl()).toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        error: `[listener/${phase}] ${msg}`,
        failCount: 0,
        updateId: currentUpdateId ?? "embedded",
        runtimeVersion: Updates.runtimeVersion ?? "unknown",
        phase,
        source: "listener",
        platform: Platform.OS,
      }),
    })
      .catch(() => {})
      .finally(() => clearTimeout(timeout));
  } catch {}
}

/**
 * Inizializzazione one-shot, da chiamare appena possibile dopo il mount
 * del root layout (dopo che fonts/providers sono pronti).
 *
 * Idempotente: chiamate successive sono no-op.
 */
export async function initOtaHardening(): Promise<void> {
  if (_hardeningInited) return;
  _hardeningInited = true;
  if (Platform.OS === "web") return;

  // 1. Inietta device ID come HEADER `expo-device-id` sulle prossime chiamate
  //    /api/expo-updates (slot routing lato server). Persiste tra restart
  //    perché expo-updates salva l'override nello storage nativo.
  //    Inoltre lo replichiamo come extra-param `device-id` per compatibilità
  //    con eventuali consumer che leggono da Expo-Extra-Params.
  try {
    const deviceId = await getStableDeviceId();
    if (!__DEV__) {
      try {
        const override = (Updates as {
          setUpdateRequestHeadersOverride?: (h: Record<string, string> | null) => void;
        }).setUpdateRequestHeadersOverride;
        if (typeof override === "function") {
          override({ "expo-device-id": deviceId });
        }
      } catch {}
      await Updates.setExtraParamAsync("device-id", deviceId).catch(() => {});
    }
  } catch {}

  // 2. Listener per rollback runtime + errori di check/download.
  attachErrorRecoveryListener();

  // 3. Heartbeat (se siamo su un OTA scaricato).
  //    Lo schedulo con setTimeout per non bloccare il primo frame.
  setTimeout(() => {
    sendOtaHeartbeatOnce().catch(() => {});
  }, 1500);
}

// ---- Note operative su expo-updates cache (Task #1357 step 4) ----
// expo-updates mantiene by-default il bundle precedente in cache locale fino
// a quando un nuovo OTA viene "launched" con successo (ovvero: scaricato +
// applicato + non crashato entro la finestra di error recovery). Con la nostra
// config:
//   - fallbackToCacheTimeout: 0   → al boot non aspettiamo nuovi OTA, lanciamo
//                                   subito dal cached/embedded bundle
//   - checkAutomatically: ON_ERROR_RECOVERY → se l'app crasha al boot,
//                                   expo-updates fa fetch immediato della
//                                   nuova versione (rollback nativo verso
//                                   embedded se il cached è broken)
// Conseguenza: nessun codice custom di gestione cache è necessario.
