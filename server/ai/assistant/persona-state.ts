// Task #5322 — Stato "persona attiva" persistito (multi-persona Bowie/Horus/Ares).
//
// Wrappa la tabella ai_conversation_state per dare all'handoff una MEMORIA tra i
// turni: senza, ogni messaggio ripartirebbe da Bowie. Le letture ignorano le
// righe scadute (TTL); le scritture sono upsert sulla chiave (userId, sourceApp).
//
// Robustezza: ogni operazione è best-effort e non deve MAI far fallire un turno
// di chat. In caso di errore DB (blip transitorio, pool saturo) degradiamo su
// "nessuno stato" → il turno riparte da Bowie, comportamento sicuro di default.
import { and, eq, lt } from "drizzle-orm";
import { db } from "../../db";
import { aiConversationState } from "@shared/db";
import {
  resolveTurnPersona,
  type AiPersonaId,
  type PersonaResolution,
} from "./roster";

// TTL: dopo 30 minuti di inattività lo stato scade e la conversazione riparte da
// Bowie. Tiene viva la stickiness per una sessione di chat reale senza incollare
// l'utente su una persona per sempre.
export const PERSONA_STATE_TTL_MS = 30 * 60 * 1000;

interface ConversationStateRow {
  activePersona: AiPersonaId | null;
  introShownPersonas: AiPersonaId[];
}

const EMPTY_STATE: ConversationStateRow = { activePersona: null, introShownPersonas: [] };

function normalizePersonaList(raw: unknown): AiPersonaId[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (p): p is AiPersonaId => p === "bowie" || p === "horus" || p === "ares",
  );
}

/**
 * Legge lo stato NON scaduto per (userId, sourceApp): persona attiva (sticky)
 * + elenco delle persone la cui intro è già stata mostrata in questa
 * conversazione. Ritorna stato vuoto se la riga non esiste, è scaduta, o in
 * caso di errore DB (fallback sicuro → Bowie, nessuna intro segnata).
 */
async function getConversationState(
  userId: string,
  sourceApp: string,
): Promise<ConversationStateRow> {
  try {
    const rows = await db
      .select({
        activePersona: aiConversationState.activePersona,
        introShownPersonas: aiConversationState.introShownPersonas,
        expiresAt: aiConversationState.expiresAt,
      })
      .from(aiConversationState)
      .where(
        and(
          eq(aiConversationState.userId, userId),
          eq(aiConversationState.sourceApp, sourceApp),
        ),
      )
      .limit(1);
    const row = rows[0];
    if (!row) return EMPTY_STATE;
    if (row.expiresAt.getTime() <= Date.now()) return EMPTY_STATE;
    const p = row.activePersona;
    const activePersona =
      p === "bowie" || p === "horus" || p === "ares" ? p : null;
    return { activePersona, introShownPersonas: normalizePersonaList(row.introShownPersonas) };
  } catch {
    return EMPTY_STATE;
  }
}

/**
 * Legge la persona attiva NON scaduta per (userId, sourceApp). Ritorna null se
 * non esiste, è scaduta, o in caso di errore DB (fallback sicuro → Bowie).
 */
export async function getActivePersona(
  userId: string,
  sourceApp: string,
): Promise<AiPersonaId | null> {
  const state = await getConversationState(userId, sourceApp);
  return state.activePersona;
}

/**
 * Upsert dello stato conversazione con TTL rinnovato. Best-effort.
 *  - `activePersona`: persona sticky per il prossimo turno ("bowie" = nessuno
 *    stato sticky, ma la riga NON viene cancellata: serve a preservare
 *    `introShownPersonas` quando l'utente torna a Bowie).
 *  - `markIntroShown`: se presente, viene AGGIUNTA (unione, mai rimossa)
 *    all'elenco delle persone già presentate in questa conversazione.
 */
async function upsertConversationState(
  userId: string,
  sourceApp: string,
  activePersona: AiPersonaId,
  handoffReason: string,
  markIntroShown: AiPersonaId | null,
  existingIntroShown: AiPersonaId[],
): Promise<void> {
  try {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + PERSONA_STATE_TTL_MS);
    const introShownPersonas = markIntroShown && !existingIntroShown.includes(markIntroShown)
      ? [...existingIntroShown, markIntroShown]
      : existingIntroShown;
    await db
      .insert(aiConversationState)
      .values({ userId, sourceApp, activePersona, handoffReason, introShownPersonas, updatedAt: now, expiresAt })
      .onConflictDoUpdate({
        target: [aiConversationState.userId, aiConversationState.sourceApp],
        set: { activePersona, handoffReason, introShownPersonas, updatedAt: now, expiresAt },
      });
  } catch {
    /* best-effort: se non riusciamo a persistere, il prossimo turno riparte da Bowie */
  }
}

/** Ripulisce le righe scadute (chiamato dal job di manutenzione). Ritorna il numero rimosso. */
export async function purgeExpiredPersonaState(): Promise<number> {
  try {
    const res = await db
      .delete(aiConversationState)
      .where(lt(aiConversationState.expiresAt, new Date()))
      .returning({ id: aiConversationState.id });
    return res.length;
  } catch {
    return 0;
  }
}

// Task #5331 — Risoluzione del turno arricchita con `personaFirstTurn`: true se
// questa è la VERA prima apparizione della persona in questa conversazione
// (mai mostrata prima), calcolato su `introShownPersonas` — che sopravvive ai
// cicli Bowie ⇄ Horus/Ares ⇄ Bowie, a differenza della persona sticky.
export interface ResolvedPersonaTurn extends PersonaResolution {
  personaFirstTurn: boolean;
}

/**
 * Risolve la persona del turno combinando lo stato persistito con il messaggio.
 * Se userId manca (non dovrebbe, ma difesa) risolve senza stickiness e senza
 * memoria di intro già mostrate (personaFirstTurn sempre true per non-Bowie).
 */
export async function resolvePersonaForTurn(input: {
  userId?: string | null;
  sourceApp: string;
  message: string;
  isAdmin: boolean;
}): Promise<ResolvedPersonaTurn> {
  const state = input.userId
    ? await getConversationState(input.userId, input.sourceApp)
    : EMPTY_STATE;
  const resolution = resolveTurnPersona({
    message: input.message,
    isAdmin: input.isAdmin,
    activePersona: state.activePersona,
  });
  const personaFirstTurn =
    resolution.persona !== "bowie" && !state.introShownPersonas.includes(resolution.persona);
  return { ...resolution, personaFirstTurn };
}

/**
 * Persiste lo stato dopo un turno. Regole:
 *  - la riga NON viene mai cancellata (solo su scadenza TTL): serve a
 *    ricordare quali persone hanno già mostrato la loro intro in questa
 *    conversazione, anche dopo un ritorno a Bowie o un congedo.
 *  - farewell o persona effettiva "bowie" → activePersona torna a "bowie"
 *    (nessuna stickiness), ma introShownPersonas resta invariato.
 *  - persona non-Bowie → activePersona sticky + persona aggiunta a
 *    introShownPersonas (idempotente, non duplica).
 */
export async function commitPersonaAfterTurn(input: {
  userId?: string | null;
  sourceApp: string;
  persona: AiPersonaId;
  reason: string;
  farewell: boolean;
}): Promise<void> {
  if (!input.userId) return;
  const goingSticky = !input.farewell && input.persona !== "bowie";
  const nextActive: AiPersonaId = goingSticky ? input.persona : "bowie";
  // Task #5331 (fix code review) — l'intro va segnata come mostrata ogni volta
  // che la persona non è Bowie, ANCHE se il turno si chiude subito con un
  // congedo (farewell=true). Prima era condizionata a `goingSticky`, quindi un
  // primo turno di Horus/Ares che finiva con la stessa risposta in congedo
  // (comune: il prompt istruisce a congedarsi appena il compito è concluso)
  // non veniva mai marcato → l'intro si ripeteva al turno successivo.
  const markIntroShown = input.persona !== "bowie" ? input.persona : null;

  const existing = await getConversationState(input.userId, input.sourceApp);
  if (!markIntroShown && existing.activePersona === null && existing.introShownPersonas.length === 0) {
    // Turno Bowie puro (nessuno stato per questa conversazione, Horus/Ares mai
    // intervenuti): non creare una riga inutile.
    return;
  }
  await upsertConversationState(
    input.userId,
    input.sourceApp,
    nextActive,
    input.reason,
    markIntroShown,
    existing.introShownPersonas,
  );
}
