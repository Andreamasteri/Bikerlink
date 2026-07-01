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

/**
 * Legge la persona attiva NON scaduta per (userId, sourceApp). Ritorna null se
 * non esiste, è scaduta, o in caso di errore DB (fallback sicuro → Bowie).
 */
export async function getActivePersona(
  userId: string,
  sourceApp: string,
): Promise<AiPersonaId | null> {
  try {
    const rows = await db
      .select({
        activePersona: aiConversationState.activePersona,
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
    if (!row) return null;
    if (row.expiresAt.getTime() <= Date.now()) return null;
    const p = row.activePersona;
    if (p === "bowie" || p === "horus" || p === "ares") return p;
    return null;
  } catch {
    return null;
  }
}

/**
 * Upsert dello stato "persona attiva" con TTL rinnovato. Best-effort.
 * Non persiste Bowie (default): usa clearActivePersona per tornare al default.
 */
export async function setActivePersona(
  userId: string,
  sourceApp: string,
  persona: AiPersonaId,
  handoffReason: string,
): Promise<void> {
  try {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + PERSONA_STATE_TTL_MS);
    await db
      .insert(aiConversationState)
      .values({ userId, sourceApp, activePersona: persona, handoffReason, updatedAt: now, expiresAt })
      .onConflictDoUpdate({
        target: [aiConversationState.userId, aiConversationState.sourceApp],
        set: { activePersona: persona, handoffReason, updatedAt: now, expiresAt },
      });
  } catch {
    /* best-effort: se non riusciamo a persistere, il prossimo turno riparte da Bowie */
  }
}

/** Cancella lo stato "persona attiva" (ritorno a Bowie). Best-effort. */
export async function clearActivePersona(userId: string, sourceApp: string): Promise<void> {
  try {
    await db
      .delete(aiConversationState)
      .where(
        and(
          eq(aiConversationState.userId, userId),
          eq(aiConversationState.sourceApp, sourceApp),
        ),
      );
  } catch {
    /* best-effort */
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

/**
 * Risolve la persona del turno combinando lo stato persistito con il messaggio.
 * Se userId manca (non dovrebbe, ma difesa) risolve senza stickiness.
 */
export async function resolvePersonaForTurn(input: {
  userId?: string | null;
  sourceApp: string;
  message: string;
  isAdmin: boolean;
}): Promise<PersonaResolution> {
  const active = input.userId
    ? await getActivePersona(input.userId, input.sourceApp)
    : null;
  return resolveTurnPersona({
    message: input.message,
    isAdmin: input.isAdmin,
    activePersona: active,
  });
}

/**
 * Persiste lo stato dopo un turno. Regole:
 *  - farewell (marcatore di congedo emesso) → torna a Bowie (clear).
 *  - persona effettiva "bowie" → clear (il default non si persiste).
 *  - altrimenti → upsert della persona attiva con TTL rinnovato.
 */
export async function commitPersonaAfterTurn(input: {
  userId?: string | null;
  sourceApp: string;
  persona: AiPersonaId;
  reason: string;
  farewell: boolean;
}): Promise<void> {
  if (!input.userId) return;
  if (input.farewell || input.persona === "bowie") {
    await clearActivePersona(input.userId, input.sourceApp);
    return;
  }
  await setActivePersona(input.userId, input.sourceApp, input.persona, input.reason);
}
