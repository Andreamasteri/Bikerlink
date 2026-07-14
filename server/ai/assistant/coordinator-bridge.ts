// Task #5318 — Ponte Bowie → Horus per il Matching Coordinator.
//
// Bowie (persona di default, entry point utente) NON ha mai autorità di
// scrittura sullo stato del matching coordinator. Quando un utente fa una
// richiesta in linguaggio naturale legata al matching (es. "il matching
// sembra fermo, puoi controllare?" / "metti in pausa il matching"), Bowie:
//  1. la riconosce con isCoordinatorRelatedRequest() (classificatore keyword,
//     zero costo, stesso pattern di classifyRoutingIntent in roster.ts);
//  2. relaya la richiesta a Horus via askHorusForCoordinatorDirective(), che
//     decide SOLO tramite Ollama locale (Horus è per definizione il modello
//     self-hosted sul ThinkCentre — NIENTE fallback cloud per questa
//     decisione: un LLM cloud non è Horus e non ha autorità sul coordinator);
//  3. SOLO Horus (dentro questa funzione) chiama applyCoordinatorDirective().
//     Se Horus/ThinkCentre è irraggiungibile, la richiesta NON viene applicata
//     da nessun'altra fonte — fallback fail-safe: nessuna azione.
import { z } from "zod";
import { generateObject } from "ai";
import { getOllamaModel, isOllamaReachable } from "../../lib/ollama-client";
import { applyCoordinatorDirective, getCoordinatorSnapshot, type CoordinatorState } from "../../matching/coordinator";

// ── Classificatore intent (italiano) — conservativo: meglio un falso negativo
// (Bowie risponde in modo generico) che un falso positivo (Horus interviene su
// una domanda innocua). Mirror di classifyRoutingIntent (roster.ts).
const MATCHING_NOUNS = /\b(match(ing)?|abbinament\w+|ciclo\s+di\s+match\w*)\b/;
const CONTROL_VERBS = /\b(ferm\w+|paus\w+|sospend\w+|blocc\w+|riprend\w+|riattiv\w+|riavvi\w+|forz\w+|sblocc\w+)\b/;
const STATUS_QUESTIONS = /\b(perch[eé]|com[e']|stato|funzion\w+|va\s+(bene|lento)|(non\s+)?(gira|parte))\b/;

/**
 * Richiesta di CONTROLLO (write-intent): "metti in pausa", "forza un ciclo
 * ora", ecc. SOLO questa categoria arriva a Horus e può risultare in una
 * scrittura (applyCoordinatorDirective) — va quindi invocata SOLO da contesti
 * autorizzati (chat admin), mai dalla chat utente ordinaria, o qualunque
 * utente potrebbe mettere in pausa il matching dell'intera piattaforma
 * scrivendo un messaggio in linguaggio naturale.
 */
export function isCoordinatorControlRequest(message: string): boolean {
  const m = (message ?? "").toLowerCase();
  if (!m.trim()) return false;
  return MATCHING_NOUNS.test(m) && CONTROL_VERBS.test(m);
}

/**
 * Richiesta puramente informativa ("il matching è fermo?", "come va il
 * matching?") — nessuna scrittura, nessuna chiamata a Horus/Ollama: risposta
 * SEMPRE disponibile (anche a Horus/ThinkCentre offline) via lettura diretta
 * dello snapshot. Aperta a qualsiasi utente perché è una lettura, non richiede
 * autorizzazione elevata.
 */
export function isCoordinatorStatusRequest(message: string): boolean {
  const m = (message ?? "").toLowerCase();
  if (!m.trim()) return false;
  if (CONTROL_VERBS.test(m)) return false; // i verbi di controllo sono gestiti da isCoordinatorControlRequest
  return MATCHING_NOUNS.test(m) && STATUS_QUESTIONS.test(m);
}

/** @deprecated usa isCoordinatorControlRequest / isCoordinatorStatusRequest separatamente in base al contesto di autorizzazione. */
export function isCoordinatorRelatedRequest(message: string): boolean {
  return isCoordinatorControlRequest(message) || isCoordinatorStatusRequest(message);
}

/**
 * Lettura diretta e sempre disponibile dello stato del coordinator — NON
 * passa MAI da Horus/Ollama (funziona anche a ThinkCentre offline) e non
 * applica alcuna direttiva. Usata per rispondere alle domande informative di
 * QUALSIASI utente (Bowie read-only).
 */
export async function getCoordinatorStatusNote(): Promise<string> {
  const snapshot = await getCoordinatorSnapshot();
  const directiveInfo = snapshot.activeDirective
    ? `, direttiva attiva="${snapshot.activeDirective.kind}" (emessa da ${snapshot.activeDirective.issuedBy}: "${snapshot.activeDirective.reason}")`
    : "";
  return `[Nota di sistema — stato attuale del Matching Coordinator: state="${snapshot.state}" (${snapshot.reason})${directiveInfo}. Rispondi all'utente in modo naturale su questa base, senza esporre dettagli tecnici interni.]`;
}

const directiveDecisionSchema = z.object({
  directive: z.enum(["pause", "resume", "force_cycle", "none"]),
  reason: z.string(),
});

const SYSTEM_PROMPT = `Sei Horus, l'autorità decisionale del Matching Coordinator di BikerLink (sistema che
abbina moto/biker/eventi). Ricevi una richiesta in linguaggio naturale (relayata da Bowie, l'assistente
utente) e lo stato corrente del coordinator. Decidi se applicare una direttiva:
- "pause": sospendi i cicli di matching (es. sospetta anomalia, richiesta esplicita di fermare).
- "resume": riprendi i cicli (es. richiesta esplicita di riattivare dopo una pausa).
- "force_cycle": forza subito un ciclo di matching fuori dal normale schedule (es. "controlla ora").
- "none": nessuna azione — la richiesta non richiede un cambio di stato (es. semplice domanda informativa).
Sii CONSERVATIVO: in caso di dubbio o richiesta ambigua, rispondi "none". reason: breve spiegazione in italiano.`;

export interface HorusCoordinatorRelayResult {
  directive: "pause" | "resume" | "force_cycle" | "none";
  reason: string;
  applied: boolean;
  resultingState?: CoordinatorState;
  error?: string;
}

/**
 * Relaya una richiesta (già filtrata da isCoordinatorRelatedRequest) a Horus.
 * Horus decide E applica (via applyCoordinatorDirective) — Bowie non scrive
 * mai direttamente. Horus è per definizione il modello self-hosted (Ollama)
 * sul ThinkCentre: NESSUN fallback su un LLM cloud per questa decisione — un
 * modello cloud non è Horus e non ha autorità sul coordinator. Se Horus/il
 * ThinkCentre è irraggiungibile, la richiesta NON viene applicata da nessuna
 * fonte (fail-safe: nessuna azione > azione presa sotto falsa identità).
 */
export async function askHorusForCoordinatorDirective(
  userMessage: string,
  timeoutMs = 1500,
): Promise<HorusCoordinatorRelayResult> {
  const snapshot = await getCoordinatorSnapshot();
  const prompt = JSON.stringify({ userMessage, coordinatorState: snapshot });

  let decision: { directive: "pause" | "resume" | "force_cycle" | "none"; reason: string } | null = null;

  try {
    if (await isOllamaReachable("horus")) {
      const model = getOllamaModel(undefined, "horus");
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        // check-ai-direct-generateobject: safe — Ollama supports json_schema natively
        const { object } = await generateObject({
          model,
          schema: directiveDecisionSchema,
          instructions: SYSTEM_PROMPT,
          prompt,
          temperature: 0,
          abortSignal: controller.signal,
        });
        decision = object;
      } finally {
        clearTimeout(timer);
      }
    }
  } catch (err) {
    console.warn("[coordinator-bridge] Horus (Ollama) fallito:", (err as Error)?.message ?? err);
  }

  if (!decision) {
    return {
      directive: "none",
      reason: "Horus non raggiungibile (ThinkCentre/Ollama offline) — nessuna azione, richiesta non applicata",
      applied: false,
    };
  }

  if (decision.directive === "none") {
    return { directive: "none", reason: decision.reason, applied: false };
  }

  const result = await applyCoordinatorDirective(decision.directive, { reason: decision.reason }, "horus");
  if (!result.ok) {
    return { directive: decision.directive, reason: decision.reason, applied: false, error: result.error };
  }
  return { directive: decision.directive, reason: decision.reason, applied: true, resultingState: result.state };
}
