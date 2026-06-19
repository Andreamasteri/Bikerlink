/**
 * scheduler.helpers.ts — companion di scheduler.ts
 *
 * Contiene helper self-contained estratti da scheduler.ts per mantenere
 * il file originale sotto la soglia di ~500 righe:
 *   - Funzioni di cleanup/pruning (runCleanup, pruneStale*, pruneOld*, runFakeZavorrineRotation)
 *   - Trigger fire-and-forget con debounce (triggerProposalProfileMatchingForZavorrina,
 *     triggerProposalCreatedMatching, triggerMatchingForUser)
 *
 * Regole:
 *   - NON modificare scheduler.ts per spostare codice qui: farlo in un task dedicato
 *   - Esportare tutto ciò che deve essere consumato da scheduler.ts o da altri moduli
 *   - Mantenere la stessa convenzione di naming e logging di scheduler.ts
 *
 * Riga 1 di scheduler.ts originale registrata al momento della creazione: 558
 */

import { db } from "../db";
import { storage } from "../storage";
import {
  proposals,
  proposalZoneNotifications,
  proposalProfileMatches,
  type Proposal,
} from "@shared/db";
import { eq, sql, lt } from "drizzle-orm";
import { runProposalToProfileMatching } from "./run-profile";
import { runProposalMatchingForUser, runProposalZoneNotifications } from "./run-proposals";
import { runMatchingForUser } from "./run-user";

// ─── Per-cycle timeout (Task #4374) ─────────────────────────────────────────
//
// Ogni fase di matching (runMatching, runWishlistMatching, runBikerZavorrinaBase,
// …) può bloccarsi su una query DB lenta o un dataset enorme. Senza un tetto di
// wall-clock il ciclo terrebbe il lock all'infinito, ritardando tutti i job
// successivi (cleanup, retry, pruning). withCycleTimeout() corre la fase contro
// un timer: se scade, la race rigetta con CycleTimeoutError e lo scheduler passa
// oltre. NB: Promise.race NON interrompe il lavoro sottostante (JS non ha
// cancellazione hard senza AbortSignal); smette solo di attenderlo.

export const DEFAULT_MATCHING_CYCLE_TIMEOUT_MS = 90_000;
// Clamp bounds: sotto 1s ogni fase fallirebbe subito; sopra ~30min non ha senso
// e valori enormi (> ~24.8gg) farebbero overfloware setTimeout → fire immediato.
const MIN_MATCHING_CYCLE_TIMEOUT_MS = 1_000;
const MAX_MATCHING_CYCLE_TIMEOUT_MS = 30 * 60 * 1000;

export class CycleTimeoutError extends Error {
  constructor(
    public readonly cycleName: string,
    public readonly elapsedMs: number,
    public readonly timeoutMs: number,
  ) {
    super(`Ciclo "${cycleName}" interrotto per timeout dopo ${elapsedMs}ms (limite ${timeoutMs}ms)`);
    this.name = "CycleTimeoutError";
  }
}

/**
 * Legge il timeout per-ciclo configurabile da AppSetting `matching_cycle_timeout_ms`.
 * Valori non numerici o <= 0 ricadono sul default (90s). Best-effort: qualsiasi
 * errore di lettura ritorna il default senza far fallire il ciclo.
 */
export async function getMatchingCycleTimeoutMs(): Promise<number> {
  try {
    const setting = await storage.getAppSetting("matching_cycle_timeout_ms");
    const parsed = setting?.value ? parseInt(setting.value, 10) : NaN;
    if (Number.isFinite(parsed) && parsed > 0) {
      // Clamp per evitare valori patologici (overflow setTimeout / fail immediato).
      return Math.min(MAX_MATCHING_CYCLE_TIMEOUT_MS, Math.max(MIN_MATCHING_CYCLE_TIMEOUT_MS, parsed));
    }
  } catch (err) {
    console.error("[Matching] Errore lettura matching_cycle_timeout_ms — uso default:", err);
  }
  return DEFAULT_MATCHING_CYCLE_TIMEOUT_MS;
}

/**
 * Esegue `fn` con un tetto di wall-clock. Se scade prima del completamento,
 * rigetta con CycleTimeoutError(name, elapsed, timeoutMs). Il timer è sempre
 * ripulito (anche su successo/errore) per non lasciare handle pendenti.
 */
export async function withCycleTimeout<T>(
  name: string,
  timeoutMs: number,
  fn: () => Promise<T>,
): Promise<T> {
  const start = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new CycleTimeoutError(name, Date.now() - start, timeoutMs)),
      timeoutMs,
    );
  });
  try {
    return await Promise.race([fn(), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// ─── Cleanup helpers ────────────────────────────────────────────────────────

export async function runCleanup(): Promise<number> {
  try {
    return await storage.expireOldProposals();
  } catch (error) {
    console.error("Cleanup error:", error);
    return 0;
  }
}

export async function pruneStaleProposalProfileMatches(): Promise<number> {
  try {
    const result = await db.execute<{ id: string }>(sql`
      DELETE FROM proposal_profile_matches
      WHERE NOT EXISTS (
        SELECT 1 FROM proposals
        WHERE proposals.id = proposal_profile_matches.proposal_id
          AND proposals.status = 'active'
      )
      RETURNING id
    `);
    return (result.rows ?? []).length;
  } catch (error) {
    console.error("[Cleanup] Errore pulizia proposal_profile_matches stale:", error);
    return 0;
  }
}

export async function pruneOldZoneNotifications(): Promise<number> {
  try {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const result = await db
      .delete(proposalZoneNotifications)
      .where(lt(proposalZoneNotifications.sentAt, cutoff))
      .returning({ id: proposalZoneNotifications.id });
    return result.length;
  } catch (error) {
    console.error("[Cleanup] Errore prune proposal_zone_notifications:", error);
    return 0;
  }
}

export async function runFakeZavorrineRotation(): Promise<void> {
  try {
    await storage.toggleFakeZavorrineAvailability();
  } catch (error) {
    console.error("Fake zavorrine rotation error:", error);
  }
}

// ─── Trigger fire-and-forget con debounce ───────────────────────────────────

const lastZavorrinaProfileMatchAt = new Map<string, number>();
const ZAVORRINA_PROFILE_MATCH_DEBOUNCE_MS = 2 * 60 * 1000;

/**
 * Trigger proposal-profile matching when a zavorrina updates her location.
 * Fire-and-forget with debounce to avoid hammering on rapid GPS updates.
 */
export function triggerProposalProfileMatchingForZavorrina(userId: string): void {
  const now = Date.now();
  const last = lastZavorrinaProfileMatchAt.get(userId) ?? 0;
  if (now - last < ZAVORRINA_PROFILE_MATCH_DEBOUNCE_MS) return;
  lastZavorrinaProfileMatchAt.set(userId, now);
  setImmediate(async () => {
    try {
      const count = await runProposalToProfileMatching(undefined, userId);
      if (count > 0) {
        console.log(`[ProposalProfileMatching] ${count} match per zavorrina ${userId}`);
      }
    } catch (err) {
      console.error("[ProposalProfileMatching] Errore zavorrina hook:", err);
    }
  });
}

/**
 * Trigger proposal matching + zone notifications immediately after a new proposal
 * is created. Fire-and-forget — does not block the HTTP response.
 */
export function triggerProposalCreatedMatching(proposal: Proposal): void {
  setImmediate(async () => {
    try {
      const matchCount = await runProposalMatchingForUser(proposal.userId);
      if (matchCount > 0) {
        console.log(`[ProposalCreated] ${matchCount} match trovati per proposta ${proposal.id}`);
      }
    } catch (err) {
      console.error("[ProposalCreated] Errore matching immediato:", err);
    }
    try {
      await runProposalToProfileMatching(proposal.id);
    } catch (err) {
      console.error("[ProposalCreated] Errore proposal-profile matching:", err);
    }
    try {
      await runProposalZoneNotifications(proposal);
    } catch (err) {
      console.error("[ProposalCreated] Errore zone notifications:", err);
    }
  });
}

export const lastUserMatchingAt = new Map<string, number>();
const USER_MATCH_DEBOUNCE_MS = 2 * 60 * 1000;

export function triggerMatchingForUser(userId: string): void {
  const now = Date.now();
  const last = lastUserMatchingAt.get(userId) ?? 0;
  if (now - last < USER_MATCH_DEBOUNCE_MS) return;
  lastUserMatchingAt.set(userId, now);
  (async () => {
    try {
      const { bikerBiker, zavorrina } = await runMatchingForUser(userId);
      if (bikerBiker > 0 || zavorrina > 0) {
        console.log(`[MatchingForUser] completato per ${userId}: ${bikerBiker} bb + ${zavorrina} zav`);
      }
    } catch (err) {
      console.error("[MatchingForUser] errore background:", err);
    }
  })();
}
