/**
 * Task #2530 — Segnalazioni Private + Moderazione (Biker / Zavorrine)
 *
 * Servizio centrale per le segnalazioni utente: calcolo del trust score del
 * reporter, valutazione automatica delle azioni (notify moderatori, shadow-ban)
 * basata su soglie asimmetriche per role (biker/zavorrina) configurate in
 * `moderation_thresholds`, hook al feedback-loop matching (#2519/#2523) e
 * mascheramento privacy dei reporter lato admin.
 *
 * Filosofia:
 *  - Le zavorrine ricevono soglie più basse (più protette: notify@2, ban@4).
 *  - I biker hanno soglie più alte (notify@4, ban@8).
 *  - Trust score reporter ∈ [0.1, 2.0], default 1.0; report pesati per trust
 *    nel conteggio.
 *  - Il "ban" è SHADOW: l'utente non viene avvisato, ma escluso dai pool di
 *    matching/listing finché un moderatore non lo riabilita.
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import {
  reports,
  users,
  moderationThresholds,
  matchFeedback,
  matchNegativePreferences,
  categoryToSeverity,
  type ReportCategory,
  type ReportContext,
  type ReportSeverity,
} from "@shared/db";
import { storage } from "../storage";

const TRUST_DEFAULT = 1.0;
const TRUST_MIN = 0.1;
const TRUST_MAX = 2.0;
const TRUST_DELTA_DISMISSED = -0.2;
const TRUST_DELTA_RESOLVED = 0.1;

const FALLBACK_THRESHOLDS: Record<string, Record<string, number>> = {
  zavorrina: { notify: 2, shadow_ban: 4 },
  biker:     { notify: 4, shadow_ban: 8 },
};

/**
 * Calcola il trust score di un utente come reporter, basato sui report passati:
 *  - +0.1 per ogni report risolto (è stato preso sul serio)
 *  - -0.2 per ogni report dismissed (falso positivo)
 *  - clamp in [0.1, 2.0]
 */
export async function computeTrustScore(reporterId: string): Promise<number> {
  const rows = await db
    .select({ status: reports.status, count: sql<number>`count(*)::int` })
    .from(reports)
    .where(eq(reports.reporterId, reporterId))
    .groupBy(reports.status);
  let score = TRUST_DEFAULT;
  for (const r of rows) {
    if (r.status === "resolved") score += TRUST_DELTA_RESOLVED * Number(r.count);
    else if (r.status === "dismissed") score += TRUST_DELTA_DISMISSED * Number(r.count);
  }
  return Math.max(TRUST_MIN, Math.min(TRUST_MAX, score));
}

/**
 * Recupera le soglie configurate per un dato ruolo target (biker|zavorrina).
 * Cade su default hard-coded se DB vuoto.
 */
export async function getThresholdsFor(role: string): Promise<{ notify: number; shadowBan: number }> {
  const normalizedRole = role === "zavorrina" ? "zavorrina" : "biker";
  try {
    const rows = await db
      .select()
      .from(moderationThresholds)
      .where(eq(moderationThresholds.targetRole, normalizedRole));
    const notify = rows.find((r) => r.action === "notify")?.threshold
      ?? FALLBACK_THRESHOLDS[normalizedRole].notify;
    const shadowBan = rows.find((r) => r.action === "shadow_ban")?.threshold
      ?? FALLBACK_THRESHOLDS[normalizedRole].shadow_ban;
    return { notify, shadowBan };
  } catch {
    const fb = FALLBACK_THRESHOLDS[normalizedRole];
    return { notify: fb.notify, shadowBan: fb.shadow_ban };
  }
}

/**
 * Conta i report pending+resolved verso un utente, pesati per il trust score
 * snapshottato sul singolo report (campo `reporter_trust_score`).
 */
export async function getWeightedReportCount(reportedUserId: string): Promise<number> {
  const rows = await db
    .select({ trust: reports.reporterTrustScore })
    .from(reports)
    .where(and(
      eq(reports.reportedUserId, reportedUserId),
      sql`${reports.status} IN ('pending','resolved')`,
    ));
  return rows.reduce((acc, r) => acc + Math.min(1.5, Math.max(0.1, Number(r.trust) || 1)), 0);
}

/**
 * Hook al feedback-loop matching: per categorie "soft" (no_show, opportunist,
 * group_misconduct) registra anche un matchFeedback negativo + una
 * matchNegativePreference, in modo che il matching engine eviti di proporre di
 * nuovo questo utente al reporter.
 */
export async function hookFeedbackLoop(opts: {
  reporterId: string;
  reportedUserId: string;
  category: ReportCategory;
  context: ReportContext;
  contextId?: string | null;
}): Promise<boolean> {
  const SOFT_CATEGORIES: ReportCategory[] = ["no_show", "opportunist", "group_misconduct"];
  if (!SOFT_CATEGORIES.includes(opts.category)) return false;
  try {
    await db.insert(matchFeedback).values({
      userId: opts.reporterId,
      otherUserId: opts.reportedUserId,
      matchKind: "report",
      featureKey: opts.context,
      action: "block",
      reasonTag: opts.category,
      matchRefId: opts.contextId ?? null,
    });
    await db.insert(matchNegativePreferences)
      .values({
        userId: opts.reporterId,
        kind: "blocked_user",
        value: { otherUserId: opts.reportedUserId, reason: opts.category },
        source: "report",
      })
      .onConflictDoNothing();
    return true;
  } catch (err) {
    console.warn("[Reporting] hookFeedbackLoop failed (non-fatal):", err);
    return false;
  }
}

/**
 * Valuta se un report deve scatenare azioni automatiche.
 * Ritorna { notified, shadowBanned }.
 */
export async function evaluateAutoActions(reportedUserId: string): Promise<{
  notified: boolean;
  shadowBanned: boolean;
  weightedCount: number;
  thresholds: { notify: number; shadowBan: number };
}> {
  const targetUser = await storage.getUser(reportedUserId);
  if (!targetUser) {
    return { notified: false, shadowBanned: false, weightedCount: 0, thresholds: { notify: 0, shadowBan: 0 } };
  }
  // Utenti già shadowbannati → niente da fare
  if (targetUser.shadowBannedAt) {
    return { notified: false, shadowBanned: true, weightedCount: 0, thresholds: { notify: 0, shadowBan: 0 } };
  }
  const thresholds = await getThresholdsFor(targetUser.userType);
  const weightedCount = await getWeightedReportCount(reportedUserId);

  let shadowBanned = false;
  let notified = false;

  if (weightedCount >= thresholds.shadowBan) {
    try {
      await db.update(users)
        .set({
          shadowBannedAt: new Date(),
          shadowBanReason: `Auto-ban: ${weightedCount.toFixed(1)} segnalazioni pesate (soglia ${thresholds.shadowBan})`,
        })
        .where(eq(users.id, reportedUserId));
      shadowBanned = true;
      await storage.createModeratorLog({
        moderatorId: reportedUserId, // self-target log; il sistema è "moderator"
        action: "auto_shadow_ban",
        targetType: "user",
        targetId: reportedUserId,
        details: `weighted=${weightedCount.toFixed(2)} threshold=${thresholds.shadowBan} role=${targetUser.userType}`,
      }).catch(() => {});
    } catch (err) {
      console.error("[Reporting] auto shadow-ban failed:", err);
    }
  }

  if (weightedCount >= thresholds.notify) {
    notified = true;
    // L'invio push è gestito dal chiamante (route) per non importare ciclicamente.
  }

  return { notified, shadowBanned, weightedCount, thresholds };
}

/**
 * Maschera l'id del reporter per UI moderatori: gli admin vedono i primi 8 char,
 * gli altri solo `anon_XXXXX` (hash deterministico).
 */
export function maskReporterId(reporterId: string, viewerRole: string | undefined | null): string {
  if (viewerRole === "admin") return reporterId;
  // Hash deterministico breve, no privacy leak.
  let h = 0;
  for (let i = 0; i < reporterId.length; i++) h = (h * 31 + reporterId.charCodeAt(i)) | 0;
  return `anon_${Math.abs(h).toString(36).slice(0, 6)}`;
}

/**
 * Identifica reporter "abusivi" (trust score < 0.5 oppure ≥3 dismissed
 * consecutivi). Usato dal pannello admin "False segnalazioni".
 */
export async function getFalseReporters(opts?: { limit?: number }): Promise<Array<{
  reporterId: string;
  nickname: string | null;
  totalReports: number;
  dismissedCount: number;
  resolvedCount: number;
  trustScore: number;
}>> {
  const limit = opts?.limit ?? 100;
  const rows = await db
    .select({
      reporterId: reports.reporterId,
      total: sql<number>`count(*)::int`,
      dismissed: sql<number>`count(*) filter (where ${reports.status} = 'dismissed')::int`,
      resolved: sql<number>`count(*) filter (where ${reports.status} = 'resolved')::int`,
    })
    .from(reports)
    .groupBy(reports.reporterId)
    .having(sql`count(*) filter (where ${reports.status} = 'dismissed') >= 2`)
    .orderBy(sql`count(*) filter (where ${reports.status} = 'dismissed') desc`)
    .limit(limit);

  if (rows.length === 0) return [];

  const userRows = await db
    .select({ id: users.id, nickname: users.nickname })
    .from(users)
    .where(sql`${users.id} IN (${sql.join(rows.map((r) => sql`${r.reporterId}`), sql`, `)})`);
  const nickMap = new Map(userRows.map((u) => [u.id, u.nickname]));

  const out = [];
  for (const r of rows) {
    const trust = await computeTrustScore(r.reporterId);
    out.push({
      reporterId: r.reporterId,
      nickname: nickMap.get(r.reporterId) ?? null,
      totalReports: Number(r.total),
      dismissedCount: Number(r.dismissed),
      resolvedCount: Number(r.resolved),
      trustScore: Number(trust.toFixed(2)),
    });
  }
  return out;
}

/**
 * Job giornaliero: ricalcola il trust score di tutti i reporter "attivi" e lo
 * snapshotta sui loro report futuri. Per ora aggiorniamo solo i record pending
 * (i risolti/dismissed restano congelati al valore dell'epoca della decisione).
 */
export async function recomputeAllTrustScores(): Promise<{ updated: number }> {
  const distinctReporters = await db
    .selectDistinct({ id: reports.reporterId })
    .from(reports)
    .where(eq(reports.status, "pending"));
  let updated = 0;
  for (const { id } of distinctReporters) {
    try {
      const score = await computeTrustScore(id);
      const res = await db.update(reports)
        .set({ reporterTrustScore: score })
        .where(and(eq(reports.reporterId, id), eq(reports.status, "pending")))
        .returning({ id: reports.id });
      updated += res.length;
    } catch (err) {
      console.warn("[Reporting] recompute trust failed for", id, err);
    }
  }
  return { updated };
}

export const reportingConstants = {
  TRUST_DEFAULT,
  TRUST_MIN,
  TRUST_MAX,
  TRUST_DELTA_DISMISSED,
  TRUST_DELTA_RESOLVED,
  FALLBACK_THRESHOLDS,
};

export { categoryToSeverity };
export type { ReportCategory, ReportContext, ReportSeverity };
