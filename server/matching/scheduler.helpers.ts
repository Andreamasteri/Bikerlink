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
