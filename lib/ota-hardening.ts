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
// NOTA sull'header `expo-device-id` richiesto dal task:
// `app.json > expo.updates.requestHeaders` accetta solo valori statici (baked
// al build time). Per un valore per-device dinamico l'API supportata da
// expo-updates SDK 55 è `setExtraParamAsync`, che invia i parametri nel
// header strutturato `Expo-Extra-Params`. Il server legge `device-id` da lì.

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

        // Caso 1: il server ha emesso una directive di rollback → applichiamo.
        if (ctx.rollback && _errorReloadCount < ERROR_RECOVERY_MAX_RELOADS) {
          _errorReloadCount += 1;
          // reloadAsync ricarica al bundle embedded perché expo-updates ha
          // già scartato il bundle marcato come rollback.
          Updates.reloadAsync().catch(() => {});
          return;
        }

        // Caso 2: errore di download di un nuovo OTA. Non facciamo reload qui
        // (l'OTA non è ancora attivo, quindi non c'è nulla da cui rollbackare).
        // Il prossimo check riproverà.
      } catch {
        // listener non deve mai propagare eccezioni
      }
    });
  } catch {
    // API non disponibile / runtime non supportato: degrade silenzioso
  }
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

  // 1. Inietta device ID nelle prossime chiamate /api/expo-updates.
  //    Persiste tra restart (expo-updates lo salva nello storage nativo).
  try {
    const deviceId = await getStableDeviceId();
    if (!__DEV__) {
      await Updates.setExtraParamAsync("device-id", deviceId).catch(() => {});
    }
  } catch {}

  // 2. Listener per rollback runtime.
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
