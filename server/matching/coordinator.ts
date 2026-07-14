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
import { isQuebrachoUnreachable as isQuebrachoCoordinatorUnreachable } from "../ai/coordinator/job-gate";
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

/**
 * Task #9 — Quebracho diventa un'autorità di direttiva PARI a Horus (non la
 * sostituisce): admin_manual, horus e quebracho hanno ciascuno il proprio slot
 * di direttiva persistito su una chiave AppSetting separata. Questo evita che
 * l'uno sovrascriva silenziosamente la direttiva dell'altro (requisito
 * esplicito: nessuna direttiva persa se entrambi possono agire in parallelo).
 */
export type DirectiveIssuer = "horus" | "admin_manual" | "quebracho";
const DIRECTIVE_ISSUERS: readonly DirectiveIssuer[] = ["admin_manual", "horus", "quebracho"];

export interface CoordinatorDirective {
  kind: CoordinatorDirectiveKind;
  reason: string;
  issuedBy: DirectiveIssuer;
  issuedAt: string;
}

// Chiave legacy pre-#9 (un solo slot condiviso Horus/admin_manual) — letta una
// tantum in migrazione così una pausa emessa prima di questo cambiamento non
// va persa quando si passa agli slot per-issuer.
const LEGACY_APP_SETTING_KEY = "matching_coordinator_directive";
function settingKeyFor(issuer: DirectiveIssuer): string {
  return `matching_coordinator_directive:${issuer}`;
}

// ─── Direttive in-memory per issuer (rispecchiate su AppSetting per
// sopravvivere ai restart) ───────────────────────────────────────────────────
const directives: Record<DirectiveIssuer, CoordinatorDirective | null> = {
  admin_manual: null,
  horus: null,
  quebracho: null,
};
let directivesLoaded = false;

// One-shot: consumato dal primo triggerMatchingRun successivo alla direttiva.
// Condiviso tra issuer per costruzione (era già così pre-#9): chi lo emette è
// tracciato solo a scopo di log/audit, il bypass one-shot resta unico.
let pendingForceCycle = false;
let pendingForceCycleIssuedBy: DirectiveIssuer | null = null;

async function loadDirectiveIfNeeded(): Promise<void> {
  if (directivesLoaded) return;
  directivesLoaded = true;
  try {
    for (const issuer of DIRECTIVE_ISSUERS) {
      const row = await storage.getAppSetting(settingKeyFor(issuer));
      const val = row?.valueJson as CoordinatorDirective | undefined;
      // Solo "pause" sopravvive al riavvio come stato persistente; resume/force_cycle
      // sono transitori e non vanno ri-applicati automaticamente al boot.
      if (val?.kind === "pause") directives[issuer] = val;
    }

    // Migrazione one-shot dalla vecchia chiave condivisa, solo se lo slot
    // per-issuer corrispondente è ancora vuoto (non sovrascrive nulla).
    const legacyRow = await storage.getAppSetting(LEGACY_APP_SETTING_KEY);
    const legacyVal = legacyRow?.valueJson as CoordinatorDirective | undefined;
    if (legacyVal?.kind === "pause" && legacyVal.issuedBy && !directives[legacyVal.issuedBy]) {
      directives[legacyVal.issuedBy] = legacyVal;
      await persistDirective(legacyVal.issuedBy, legacyVal);
    }
  } catch (err) {
    dedupWarn("matching-coordinator/load", "errore lettura direttive persistite (non-fatal, riparto senza direttive)", err);
  }
}

async function persistDirective(issuer: DirectiveIssuer, directive: CoordinatorDirective | null): Promise<void> {
  try {
    await storage.upsertAppSetting(settingKeyFor(issuer), undefined, directive as unknown);
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

/** Riusa lo stesso check di raggiungibilità del job-gate di Quebracho, così
 * le due superfici (job-gate per i loop, coordinator per il matching) non
 * possono divergere su cosa significhi "Quebracho irraggiungibile". */
async function isQuebrachoUnreachable(): Promise<boolean> {
  return isQuebrachoCoordinatorUnreachable();
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
/**
 * Risolve quali direttive di pausa sono attualmente EFFICACI (non solo
 * presenti): admin_manual è sempre efficace; horus/quebracho lo sono solo se
 * la rispettiva autorità è raggiungibile (altrimenti fallback trasparente,
 * loggato una tantum per finestra). Nessuna delle due sovrascrive l'altra —
 * possono essere entrambe attive in parallelo.
 */
async function resolveEffectivePauses(): Promise<{
  admin: CoordinatorDirective | null;
  horus: CoordinatorDirective | null;
  quebracho: CoordinatorDirective | null;
}> {
  const admin = directives.admin_manual?.kind === "pause" ? directives.admin_manual : null;

  let horus: CoordinatorDirective | null = null;
  if (directives.horus?.kind === "pause") {
    if (await isHorusUnreachable()) {
      logFallbackTransition("direttiva pause di Horus attiva ma Horus/ThinkCentre irraggiungibile — ignorata");
    } else {
      horus = directives.horus;
    }
  }

  let quebracho: CoordinatorDirective | null = null;
  if (directives.quebracho?.kind === "pause") {
    if (await isQuebrachoUnreachable()) {
      logFallbackTransition("direttiva pause di Quebracho attiva ma Quebracho irraggiungibile — ignorata");
    } else {
      quebracho = directives.quebracho;
    }
  }

  return { admin, horus, quebracho };
}

/** Priorità di visualizzazione quando più direttive sono attive insieme:
 * admin_manual (sicurezza umana) > horus > quebracho. Usata SOLO per il campo
 * di compatibilità "activeDirective"/"source" — lo stato paused_by_ai risulta
 * comunque se ALMENO una è efficace, indipendentemente dalla priorità. */
function pickActiveDirective(effective: {
  admin: CoordinatorDirective | null;
  horus: CoordinatorDirective | null;
  quebracho: CoordinatorDirective | null;
}): CoordinatorDirective | null {
  return effective.admin ?? effective.horus ?? effective.quebracho ?? null;
}

export async function getCoordinatorState(): Promise<{ state: CoordinatorState; reason: string }> {
  await loadDirectiveIfNeeded();

  const autoMatchSetting = await storage.getAppSetting("auto_matching_enabled");
  if (autoMatchSetting?.value === "false") {
    return { state: "stopped", reason: "auto_matching_enabled=false (admin)" };
  }

  const effective = await resolveEffectivePauses();
  const activePauses = [effective.admin, effective.horus, effective.quebracho].filter(
    (d): d is CoordinatorDirective => d !== null,
  );
  if (activePauses.length > 0) {
    const reason =
      activePauses.length === 1
        ? activePauses[0].reason
        : activePauses.map((d) => `${d.issuedBy}: ${d.reason}`).join(" | ");
    return { state: "paused_by_ai", reason };
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
  source: "deterministic" | DirectiveIssuer;
  /** true se questo run consuma un force_cycle one-shot (di Horus o Quebracho). */
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
  const forceIssuedBy = pendingForceCycleIssuedBy;
  pendingForceCycle = false;
  pendingForceCycleIssuedBy = null;

  if (state === "running") {
    return { allowed: true, state, reason, source: "deterministic", forcedByHorus: false };
  }

  if (state === "paused_by_ai" && forceRequested) {
    const source = forceIssuedBy ?? "horus";
    void writeWatchdogLog({
      kind: "coordinator",
      scope: "matching_coordinator",
      status: "ok",
      summary: `force_cycle di ${source} consumato — ciclo forzato nonostante pausa AI attiva`,
    });
    return { allowed: true, state, reason: `force_cycle ${source}`, source, forcedByHorus: true };
  }

  // source riflette l'issuedBy REALE della direttiva attiva (mai un valore
  // fisso "horus"): una pausa manuale admin deve tracciarsi come admin_manual,
  // e una pausa Quebracho come "quebracho", non venire attribuita a Horus nei
  // log/decision metadata.
  let pauseSource: "deterministic" | DirectiveIssuer = "deterministic";
  if (state === "paused_by_ai") {
    const effective = await resolveEffectivePauses();
    pauseSource = pickActiveDirective(effective)?.issuedBy ?? "horus";
  }
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
  issuedBy: DirectiveIssuer,
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
    // Scrive SOLO il proprio slot — non tocca la direttiva di un altro issuer,
    // così una pause di Horus e una di Quebracho possono coesistere ed
    // entrambe restano attive finché il rispettivo issuer non fa resume.
    directives[issuedBy] = directive;
    await persistDirective(issuedBy, directive);
  } else if (kind === "resume") {
    directives[issuedBy] = null;
    await persistDirective(issuedBy, null);
  } else if (kind === "force_cycle") {
    pendingForceCycle = true;
    pendingForceCycleIssuedBy = issuedBy;
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
  /** Compat: la direttiva "in evidenza" quando ne è attiva più di una insieme
   * (priorità admin_manual > horus > quebracho) — vedi anche `directives`. */
  activeDirective: CoordinatorDirective | null;
  /** Direttive per-issuer complete (nuovo in #9): admin_manual/horus/quebracho
   * possono essere attive contemporaneamente. */
  directives: Record<DirectiveIssuer, CoordinatorDirective | null>;
  pendingForceCycle: boolean;
  horusReachable: boolean;
  quebrachoReachable: boolean;
  thinkCentreOffline: boolean;
}> {
  await loadDirectiveIfNeeded();
  const { state, reason } = await getCoordinatorState();
  // Sequenziale (non Promise.all): snapshot di stato non è nel path critico e
  // le 4 chiamate condividono letture DB cache-friendly (isThinkCentreOffline);
  // un burst a 4 apre più connessioni pool simultanee senza reale beneficio di
  // latenza qui. Vedi .agents/memory/pool-promise-all-setup-burst.md.
  const effective = await resolveEffectivePauses();
  const horusUnreachable = await isHorusUnreachable();
  const quebrachoUnreachable = await isQuebrachoUnreachable();
  const tcOffline = await isThinkCentreOffline();
  return {
    state,
    reason,
    activeDirective: pickActiveDirective(effective),
    directives: { ...directives },
    pendingForceCycle,
    horusReachable: !horusUnreachable,
    quebrachoReachable: !quebrachoUnreachable,
    thinkCentreOffline: tcOffline,
  };
}

/** Solo per test — reset dello stato in-memory del modulo. */
export function __resetCoordinatorForTests(): void {
  directives.admin_manual = null;
  directives.horus = null;
  directives.quebracho = null;
  directivesLoaded = false;
  pendingForceCycle = false;
  pendingForceCycleIssuedBy = null;
  lastFallbackLoggedAt = 0;
}
