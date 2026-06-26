// Task #4979 — Livello B passivo: checkpoint PRE-React.
//
// Emette ping al server PRIMA che React renderizzi, direttamente dai side-effect
// di module-load in app/_layout.tsx. Se l'app crasha durante la valutazione dei
// moduli o in un side-effect early (splash, Sentry, online/focus manager, task
// telemetria), il server ha comunque registrato l'ultimo checkpoint raggiunto —
// è proprio il caso in cui il Livello A (interattivo, post-render) non scatterebbe
// mai perché React non monta.
//
// PRESTAZIONE / VERIDICITÀ: i ping partono appena il flag LOCALE (lettura veloce
// AsyncStorage, ~ms) risulta attivo — NON si attende il fetch remoto del manifest
// (fino a 2.5s). Così il ritardo tra checkpoint e ping è minimo. Il flag remoto è
// risolto in parallelo e, se attivo, fa partire comunque i ping bufferizzati.
//
// Contratto opt-in / NON-regressione: i checkpoint sono bufferizzati in memoria a
// costo zero e inviati SOLO se il BootGate è attivo (flag locale OPPURE manifest
// remoto). Con BootGate spento il buffer viene scartato → nessuna chiamata di rete
// aggiuntiva oltre all'unica risoluzione del flag (condivisa con RootLayout) e
// nessun effetto osservabile sul boot normale.

import { getApiUrl } from "@/lib/query-client";
import {
  pingBootGate,
  isBootGateEnabledLocally,
  getBootGateRemoteMirror,
  setBootGateRemoteMirror,
} from "@/lib/boot-gate-ping";

const REMOTE_TIMEOUT_MS = 2500;

interface PendingCheckpoint {
  stepId: string;
  ts: number;
}

const pending: PendingCheckpoint[] = [];

// Snapshot SINCRONO dell'attivazione: null = ancora ignoto, true/false = noto.
// Appena è noto, passiveCheckpoint() decide all'istante senza alcuna attesa.
let activeSnapshot: boolean | null = null;

// Promesse memoizzate. Locale e remoto sono risolti SEPARATAMENTE così i ping
// pre-React possono partire al primo (locale, veloce) senza attendere il secondo.
let localPromise: Promise<boolean> | null = null;
let remotePromise: Promise<boolean> | null = null;
let combinedPromise: Promise<boolean> | null = null;
let flushing = false;

function resolveLocal(): Promise<boolean> {
  if (!localPromise) {
    localPromise = isBootGateEnabledLocally().catch(() => false);
  }
  return localPromise;
}

function resolveRemote(): Promise<boolean> {
  if (!remotePromise) {
    remotePromise = (async () => {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), REMOTE_TIMEOUT_MS);
        try {
          const res = await fetch(
            new URL("/api/ota/manifest", getApiUrl()).toString(),
            { headers: { "Content-Type": "application/json" }, signal: controller.signal },
          );
          const data = (await res.json()) as { bootGateEnabled?: boolean };
          const remote = data?.bootGateEnabled === true;
          // Specchio SIMMETRICO dell'ultimo valore remoto: serve SOLO da fallback
          // offline al prossimo avvio. Riflette sia l'accensione sia lo spegnimento
          // remoto — così lo "Disattiva" admin si propaga (niente latch sticky-ON).
          // L'override MANUALE (`__BOOT_GATE__`) è una sorgente separata e resta
          // intatto: lo gestisce solo resolveLocal(), mai il remoto.
          try {
            await setBootGateRemoteMirror(remote);
          } catch {
            // no-op: la persistenza è best-effort.
          }
          return remote;
        } finally {
          clearTimeout(timer);
        }
      } catch {
        // Fetch del manifest fallito (offline/timeout): ricadi sull'ULTIMO valore
        // remoto noto, così lo stato remoto persiste tra gli avvii anche senza
        // rete. Mai visto un valore remoto → false (default spento).
        const mirror = await getBootGateRemoteMirror().catch(() => null);
        return mirror === true;
      }
    })();
  }
  return remotePromise;
}

// Decisione combinata per l'avvio CORRENTE: locale OPPURE remoto. Memoizzata e
// CONDIVISA con RootLayout (app/_layout.tsx) così c'è UN solo fetch del manifest
// per avvio e la stessa decisione vale per il Livello A (UI) e il Livello B.
export function resolveBootGateActive(): Promise<boolean> {
  if (!combinedPromise) {
    combinedPromise = (async () => {
      const [local, remote] = await Promise.all([resolveLocal(), resolveRemote()]);
      const active = local || remote;
      if (activeSnapshot === null) activeSnapshot = active;
      return active;
    })();
  }
  return combinedPromise;
}

async function drain(): Promise<void> {
  while (pending.length > 0) {
    const cp = pending.shift();
    if (!cp) break;
    // Status "reached": checkpoint raggiunto a module-load, PRIMA di React. Il
    // timestamp originale resta nel testo della nota per ricostruire la sequenza.
    await pingBootGate(cp.stepId, "reached", {
      note: `pre-react (module-load) @${cp.ts}`,
    });
  }
}

async function flushPending(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    // 1) Flag LOCALE (veloce): se è attivo, invia SUBITO senza attendere il remoto.
    const local = await resolveLocal();
    if (local) {
      activeSnapshot = true;
      await drain();
      return;
    }
    // 2) Locale spento: l'unica attivazione possibile è il remoto. Lo aspettiamo.
    const remote = await resolveRemote();
    if (remote) {
      activeSnapshot = true;
      await drain();
    } else {
      // Spento da entrambe le sorgenti: scarta il buffer, nessun ping di rete.
      activeSnapshot = false;
      pending.length = 0;
    }
  } finally {
    flushing = false;
  }
}

// Registra un checkpoint PRE-React raggiunto a module-load. Va chiamato in modo
// sincrono nel punto esatto del side-effect (vedi app/_layout.tsx).
//  - attivazione già nota attiva  → fire-and-forget IMMEDIATO (nessuna attesa).
//  - attivazione già nota spenta  → no-op totale.
//  - attivazione ancora ignota    → bufferizza e avvia la risoluzione: il flush
//    invia appena il flag locale (veloce) o quello remoto risulta attivo.
export function passiveCheckpoint(stepId: string): void {
  if (activeSnapshot === false) return;
  const ts = Date.now();
  if (activeSnapshot === true) {
    void pingBootGate(stepId, "reached", {
      note: `pre-react (module-load) @${ts}`,
    });
    return;
  }
  pending.push({ stepId, ts });
  void flushPending();
}
