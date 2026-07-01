// Task #5318 — Matching Coordinator (control plane unificato).
//
// Prima di questo modulo, la decisione "può girare un ciclo di matching ORA?"
// era sparsa in tre punti indipendenti: scheduler.cycle.ts (isPoolHealthy +
// auto_matching_enabled), il proposer AI del watchdog (server/ai/watchdog/
// proposer.ts, che proponeva azioni ma non aveva autorità diretta) e il
// kill-switch DB (bg-db-limiter.ts, che protegge le CONNESSIONI, non i cicli).
//
// Questo modulo diventa la SINGOLA fonte di verità per la gate "matching cycle
// può girare ora?", con Horus (AI self-hosted) che può emettere direttive
// esplicite con autorità reale (pause/resume/force_cycle), sempre auditate e
// SEMPRE con fallback automatico al comportamento deterministico se Horus/il
// ThinkCentre non sono raggiungibili — il sistema non deve mai restare bloccato
// in attesa di un'autorità irraggiungibile.
//
// Bowie (entry point utente) ha accesso SOLO in lettura + può relayare
// richieste in linguaggio naturale a Horus (coordinator-bridge.ts): non scrive
// mai lo stato direttamente.
//
// bg-db-limiter.ts NON viene toccato: resta il semaforo delle connessioni DB
// (concern distinto, vedi commento file-level lì). Il proposer del watchdog
// resta per le proposte generiche di sistema non legate al gating dei cicli.
import { isPoolHealthy } from "../db";
import { storage } from "../storage";
import { isThinkCentreOffline } from "../lib/thinkcentre-offline";
import { isOllamaReachable } from "../lib/ollama-client";
import { writeWatchdogLog } from "../ai/watchdog/log";
import { dedupWarn } from "../lib/dedup-logger";
import { z } from "zod";

export type CoordinatorState = "running" | "paused_by_killswitch" | "paused_by_ai" | "stopped";

/**
 * Fast-path sincrono per il pre-check pool DB — usato da scheduler.cycle.ts
 * al posto di importare isPoolHealthy direttamente da ../db, così il
 * coordinator resta l'UNICA superficie da cui il resto del sistema legge la
 * policy di kill-switch (nessuna decisione duplicata fuori da questo modulo).
 * Riflette esattamente lo stesso segnale usato da getCoordinatorState() per
 * derivare "paused_by_killswitch".
 */
export function isPoolSaturatedSync(): boolean {
  return !isPoolHealthy();
}

export type CoordinatorDirectiveKind = "pause" | "resume" | "force_cycle";

export interface CoordinatorDirective {
  kind: CoordinatorDirectiveKind;
  reason: string;
  issuedBy: "horus" | "admin_manual";
  issuedAt: string;
}

const APP_SETTING_KEY = "matching_coordinator_directive";

// ─── Direttiva Horus in-memory (rispecchiata su AppSetting per sopravvivere ai
// restart) ─────────────────────────────────────────────────────────────────
let currentDirective: CoordinatorDirective | null = null;
let directiveLoaded = false;

// One-shot: consumato dal primo triggerMatchingRun successivo alla direttiva.
let pendingForceCycle = false;

async function loadDirectiveIfNeeded(): Promise<void> {
  if (directiveLoaded) return;
  directiveLoaded = true;
  try {
    const row = await storage.getAppSetting(APP_SETTING_KEY);
    const val = row?.valueJson as CoordinatorDirective | undefined;
    if (val && (val.kind === "pause" || val.kind === "resume" || val.kind === "force_cycle")) {
      // Solo "pause" sopravvive al riavvio come stato persistente; resume/force_cycle
      // sono transitori e non vanno ri-applicati automaticamente al boot.
      if (val.kind === "pause") currentDirective = val;
    }
  } catch (err) {
    dedupWarn("matching-coordinator/load", "errore lettura direttiva persistita (non-fatal, riparto senza direttiva)", err);
  }
}

async function persistDirective(directive: CoordinatorDirective | null): Promise<void> {
  try {
    await storage.upsertAppSetting(APP_SETTING_KEY, undefined, directive as unknown);
  } catch (err) {
    dedupWarn("matching-coordinator/persist", "errore persistenza direttiva (non-fatal, resta in-memory)", err);
  }
}

// ─── Rilevamento fallback (Horus/ThinkCentre irraggiungibile) ───────────────
// Guardia anti-log-storm: logga la transizione di fallback solo una volta per
// finestra, non ad ogni singola canRunCycleNow().
let lastFallbackLoggedAt = 0;
const FALLBACK_LOG_THROTTLE_MS = 5 * 60_000;

async function isHorusUnreachable(): Promise<boolean> {
  if (await isThinkCentreOffline()) return true;
  return !(await isOllamaReachable("horus"));
}

function logFallbackTransition(reason: string): void {
  const now = Date.now();
  if (now - lastFallbackLoggedAt < FALLBACK_LOG_THROTTLE_MS) return;
  lastFallbackLoggedAt = now;
  console.warn(`[MatchingCoordinator] Fallback a comportamento deterministico — ${reason}`);
  void writeWatchdogLog({
    kind: "coordinator",
    scope: "matching_coordinator",
    status: "warn",
    summary: `Fallback automatico a deterministico — ${reason}`,
    details: { event: "fallback_transition", reason },
  });
}

/**
 * Calcola lo stato corrente del coordinator. Riproduce ESATTAMENTE la logica
 * pre-esistente quando nessuna direttiva Horus è mai stata emessa (nessuna
 * regressione): auto_matching_enabled=false → stopped, !isPoolHealthy() →
 * paused_by_killswitch, altrimenti running. La direttiva "pause" di Horus si
 * inserisce SOLO come gate aggiuntivo, e SOLO se Horus/TC sono raggiungibili
 * (altrimenti fallback trasparente, loggato).
 */
export async function getCoordinatorState(): Promise<{ state: CoordinatorState; reason: string }> {
  await loadDirectiveIfNeeded();

  const autoMatchSetting = await storage.getAppSetting("auto_matching_enabled");
  if (autoMatchSetting?.value === "false") {
    return { state: "stopped", reason: "auto_matching_enabled=false (admin)" };
  }

  if (currentDirective?.kind === "pause") {
    // Il fallback trasparente (ignora la pausa se irraggiungibile) si applica
    // SOLO alle direttive emesse da Horus: se Horus/il ThinkCentre sono giù,
    // non ha senso "richiedere conferma" a un'autorità assente. Una pausa
    // manuale di un admin umano (issuedBy="admin_manual") non dipende in alcun
    // modo da Horus/ThinkCentre e NON deve mai essere ignorata per quel motivo
    // — altrimenti uno stop di emergenza dell'admin verrebbe silenziosamente
    // bypassato proprio mentre il ThinkCentre è offline.
    if (currentDirective.issuedBy === "admin_manual") {
      return { state: "paused_by_ai", reason: currentDirective.reason };
    }
    if (await isHorusUnreachable()) {
      logFallbackTransition(`direttiva pause di Horus attiva ma Horus/ThinkCentre irraggiungibile — ignorata`);
      // fallthrough al gate deterministico sottostante
    } else {
      return { state: "paused_by_ai", reason: currentDirective.reason };
    }
  }

  if (!isPoolHealthy()) {
    return { state: "paused_by_killswitch", reason: "pool DB saturo" };
  }

  return { state: "running", reason: "nessun blocco attivo" };
}

export interface CanRunCycleDecision {
  allowed: boolean;
  state: CoordinatorState;
  reason: string;
  /**
   * Fonte della decisione — riflette ESATTAMENTE issuedBy della direttiva
   * attiva (mai un valore fisso), così log/scheduler distinguono sempre una
   * pausa applicata da Horus da una pausa manuale di un admin.
   */
  source: "deterministic" | "horus" | "admin_manual";
  /** true se questo run consuma un force_cycle one-shot di Horus. */
  forcedByHorus: boolean;
}

/**
 * Gate unico da interrogare prima di avviare un ciclo di matching. Va chiamato
 * DOPO le guardie sincrone hard-safety esistenti (cycleInFlight, debounce) —
 * quelle restano invariate perché proteggono l'integrità del processo, non la
 * policy. force_cycle bypassa SOLO il gate "paused_by_ai" (policy), mai
 * pool_saturated/cycleInFlight (safety).
 */
export async function canRunCycleNow(): Promise<CanRunCycleDecision> {
  const { state, reason } = await getCoordinatorState();

  // force_cycle è SEMPRE one-shot: viene consumato dalla primissima valutazione
  // successiva alla sua emissione, qualunque sia lo stato in quel momento —
  // anche se non ha alcun effetto pratico (es. state="running", già in corso,
  // o state="stopped"/"paused_by_killswitch", non bypassabile). Se non lo
  // consumassimo qui in ogni ramo, un force_cycle emesso mentre il ciclo è già
  // "running" resterebbe pending indefinitamente e potrebbe poi far bypassare
  // a sorpresa una pausa AI applicata molto più tardi.
  const forceRequested = pendingForceCycle;
  pendingForceCycle = false;

  if (state === "running") {
    return { allowed: true, state, reason, source: "deterministic", forcedByHorus: false };
  }

  if (state === "paused_by_ai" && forceRequested) {
    void writeWatchdogLog({
      kind: "coordinator",
      scope: "matching_coordinator",
      status: "ok",
      summary: "force_cycle di Horus consumato — ciclo forzato nonostante pausa AI attiva",
    });
    return { allowed: true, state, reason: "force_cycle Horus", source: "horus", forcedByHorus: true };
  }

  // source riflette l'issuedBy REALE della direttiva attiva (mai un valore
  // fisso "horus"): una pausa manuale admin deve tracciarsi come admin_manual,
  // non venire attribuita a Horus nei log/decision metadata.
  const pauseSource: "deterministic" | "horus" | "admin_manual" =
    state === "paused_by_ai" ? (currentDirective?.issuedBy ?? "horus") : "deterministic";
  return { allowed: false, state, reason, source: pauseSource, forcedByHorus: false };
}

// ─── Direttive Horus ─────────────────────────────────────────────────────────

const directiveParamsSchema: Record<CoordinatorDirectiveKind, z.ZodTypeAny> = {
  pause: z.object({ reason: z.string().min(1, "reason obbligatorio") }),
  resume: z.object({ reason: z.string().min(1, "reason obbligatorio") }),
  force_cycle: z.object({ reason: z.string().min(1, "reason obbligatorio") }),
};

const DIRECTIVE_KINDS = new Set<string>(["pause", "resume", "force_cycle"]);

export function isValidCoordinatorDirectiveKind(kind: string): kind is CoordinatorDirectiveKind {
  return DIRECTIVE_KINDS.has(kind);
}

export type ApplyDirectiveResult =
  | { ok: true; state: CoordinatorState; summary: string }
  | { ok: false; error: string };

/**
 * Applica una direttiva. Chiamata SOLO da Horus (via coordinator-bridge.ts,
 * dopo decisione del modello) o da un admin umano per override manuale/test
 * (issuedBy="admin_manual"). Bowie NON deve mai chiamare questa funzione
 * direttamente — solo relayare a Horus.
 */
export async function applyCoordinatorDirective(
  kind: string,
  rawParams: unknown,
  issuedBy: "horus" | "admin_manual",
): Promise<ApplyDirectiveResult> {
  if (!isValidCoordinatorDirectiveKind(kind)) {
    return { ok: false, error: `Direttiva sconosciuta: "${kind}"` };
  }
  const parsed = directiveParamsSchema[kind].safeParse(rawParams ?? {});
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Parametri non validi" };
  }
  const { reason } = parsed.data as { reason: string };
  await loadDirectiveIfNeeded();

  const directive: CoordinatorDirective = { kind, reason, issuedBy, issuedAt: new Date().toISOString() };

  if (kind === "pause") {
    currentDirective = directive;
    await persistDirective(directive);
  } else if (kind === "resume") {
    currentDirective = null;
    await persistDirective(null);
  } else if (kind === "force_cycle") {
    pendingForceCycle = true;
    // force_cycle è transitorio: non sovrascrive una eventuale pausa persistita,
    // consuma solo il prossimo tick.
  }

  const { state } = await getCoordinatorState();
  const summary = `Direttiva "${kind}" applicata da ${issuedBy} — motivo: ${reason}`;
  await writeWatchdogLog({
    kind: "coordinator",
    scope: "matching_coordinator",
    status: "ok",
    summary,
    details: { directive: kind, reason, issuedBy, resultingState: state },
  });
  console.log(`[MatchingCoordinator] ${summary} — stato risultante: ${state}`);
  return { ok: true, state, summary };
}

/** Snapshot completo per l'admin panel / Bowie (sola lettura). */
export async function getCoordinatorSnapshot(): Promise<{
  state: CoordinatorState;
  reason: string;
  activeDirective: CoordinatorDirective | null;
  pendingForceCycle: boolean;
  horusReachable: boolean;
  thinkCentreOffline: boolean;
}> {
  await loadDirectiveIfNeeded();
  const { state, reason } = await getCoordinatorState();
  const [horusUnreachable, tcOffline] = await Promise.all([isHorusUnreachable(), isThinkCentreOffline()]);
  return {
    state,
    reason,
    activeDirective: currentDirective,
    pendingForceCycle,
    horusReachable: !horusUnreachable,
    thinkCentreOffline: tcOffline,
  };
}

/** Solo per test — reset dello stato in-memory del modulo. */
export function __resetCoordinatorForTests(): void {
  currentDirective = null;
  directiveLoaded = false;
  pendingForceCycle = false;
  lastFallbackLoggedAt = 0;
}
