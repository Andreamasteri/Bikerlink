/**
 * DR Correction Engine — server core (Task #47).
 *
 * Deterministic, statistical correction of dead-reckoning estimates. This is NOT
 * an AI/LLM agent and is deliberately kept OUT of server/ai/* — it must never be
 * confused with the routing-health "Horus" analyzer/proposer/escalation agents,
 * which are about GraphHopper/Valhalla/Photon health, not physical DR correction.
 *
 * Update cadence (explicit, per the task):
 *  - PER-USER model: recomputed in REAL TIME on every ingestion batch. Cheap —
 *    a robust median over that user's recent deviation samples.
 *  - GLOBAL model: recomputed by a PERIODIC job (see server/jobs/dr-correction-global.ts),
 *    since it must scan all non-test users. Used only to bootstrap the blended
 *    model of users who don't yet have enough samples of their own.
 */

import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db, withDbRetry } from "../db";
import {
  drDeviationSamples,
  drCorrectionModel,
  drCorrectionGlobal,
  users,
  type InsertDrDeviationSample,
} from "@shared/db";
import {
  computeModelFromSamples,
  blendWithGlobal,
  IDENTITY_MODEL,
  type DrCorrectionModel,
  type DrDeviationSample,
} from "@shared/dr-correction";

/** Cap how many recent samples feed a per-user model — bounds query + keeps the
 *  model responsive to a rider's current hardware/behaviour. */
const USER_SAMPLE_WINDOW = 500;
/** Only samples from the last N days feed the global aggregate. */
const GLOBAL_WINDOW_DAYS = 90;

/**
 * Decide whether a user's data is test/synthetic and must be excluded from global
 * aggregates. Driven by the user's own flags — explicit and deterministic.
 */
export async function isTestUser(userId: string): Promise<boolean> {
  try {
    const rows = await withDbRetry(() => db
      .select({ isFake: users.isFake, isSystem: users.isSystem, mapTester: users.mapTester })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1));
    const u = rows[0];
    if (!u) return false;
    return Boolean(u.isFake || u.isSystem || u.mapTester);
  } catch {
    return false;
  }
}

/** Map a DB deviation row to the shared sample shape used by the math layer. */
function rowToSample(r: {
  session_id?: string; sessionId?: string;
  blackout_ms?: number; blackoutMs?: number;
  dr_distance_km?: number; drDistanceKm?: number;
  gps_distance_km?: number; gpsDistanceKm?: number;
  pos_error_m?: number; posErrorM?: number;
  est_speed_kmh?: number; estSpeedKmh?: number;
  obs_speed_kmh?: number; obsSpeedKmh?: number;
  heading_error_deg?: number | null; headingErrorDeg?: number | null;
  recovery_accuracy_m?: number; recoveryAccuracyM?: number;
  recovery_fix_count?: number; recoveryFixCount?: number;
}): DrDeviationSample {
  const num = (a: unknown, b: unknown) => Number((a ?? b) ?? 0);
  return {
    sessionId: String(r.sessionId ?? r.session_id ?? ""),
    blackoutMs: num(r.blackoutMs, r.blackout_ms),
    drDistanceKm: num(r.drDistanceKm, r.dr_distance_km),
    gpsDistanceKm: num(r.gpsDistanceKm, r.gps_distance_km),
    posErrorM: num(r.posErrorM, r.pos_error_m),
    estSpeedKmh: num(r.estSpeedKmh, r.est_speed_kmh),
    obsSpeedKmh: num(r.obsSpeedKmh, r.obs_speed_kmh),
    headingErrorDeg:
      (r.headingErrorDeg ?? r.heading_error_deg) == null
        ? null
        : Number(r.headingErrorDeg ?? r.heading_error_deg),
    recoveryAccuracyM: num(r.recoveryAccuracyM, r.recovery_accuracy_m),
    recoveryFixCount: num(r.recoveryFixCount, r.recovery_fix_count),
  };
}

/**
 * Insert a batch of deviation samples for a user, then recompute that user's model
 * in real time. Returns the number of rows actually stored.
 */
export async function ingestDeviationBatch(
  userId: string,
  samples: DrDeviationSample[],
): Promise<{ stored: number; isTest: boolean }> {
  if (samples.length === 0) return { stored: 0, isTest: false };
  const isTest = await isTestUser(userId);

  const rows: InsertDrDeviationSample[] = samples.map((s) => ({
    userId,
    sessionId: s.sessionId.slice(0, 64),
    blackoutMs: Math.max(0, Math.round(s.blackoutMs)),
    drDistanceKm: s.drDistanceKm,
    gpsDistanceKm: s.gpsDistanceKm,
    posErrorM: s.posErrorM,
    estSpeedKmh: s.estSpeedKmh,
    obsSpeedKmh: s.obsSpeedKmh,
    speedErrorKmh: s.obsSpeedKmh - s.estSpeedKmh,
    headingErrorDeg: s.headingErrorDeg,
    recoveryAccuracyM: s.recoveryAccuracyM,
    recoveryFixCount: Math.round(s.recoveryFixCount),
    isTest,
  }));

  await withDbRetry(() => db.insert(drDeviationSamples).values(rows));
  await recomputeUserModel(userId, isTest);
  return { stored: rows.length, isTest };
}

/** Recompute and upsert a single user's correction model from their recent samples. */
export async function recomputeUserModel(userId: string, isTest?: boolean): Promise<DrCorrectionModel> {
  const test = isTest ?? (await isTestUser(userId));
  const rows = await withDbRetry(() => db
    .select()
    .from(drDeviationSamples)
    .where(eq(drDeviationSamples.userId, userId))
    .orderBy(desc(drDeviationSamples.recordedAt))
    .limit(USER_SAMPLE_WINDOW));
  const model = computeModelFromSamples(rows.map(rowToSample));

  await withDbRetry(() => db
    .insert(drCorrectionModel)
    .values({
      userId,
      distanceScale: model.distanceScale,
      speedScale: model.speedScale,
      speedBiasKmh: model.speedBiasKmh,
      headingBiasDeg: model.headingBiasDeg,
      sampleCount: model.sampleCount,
      meanPosErrorM: model.meanPosErrorM,
      meanSpeedErrorKmh: model.meanSpeedErrorKmh,
      dataQuality: model.sampleCount,
      isTest: test,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: drCorrectionModel.userId,
      set: {
        distanceScale: model.distanceScale,
        speedScale: model.speedScale,
        speedBiasKmh: model.speedBiasKmh,
        headingBiasDeg: model.headingBiasDeg,
        sampleCount: model.sampleCount,
        meanPosErrorM: model.meanPosErrorM,
        meanSpeedErrorKmh: model.meanSpeedErrorKmh,
        dataQuality: model.sampleCount,
        isTest: test,
        updatedAt: new Date(),
      },
    }));
  return model;
}

/**
 * Recompute the GLOBAL cross-user aggregate from all NON-TEST samples in the
 * window. Called by the periodic job. Returns the computed global model.
 */
export async function recomputeGlobalModel(): Promise<DrCorrectionModel & { contributingUsers: number }> {
  const since = new Date(Date.now() - GLOBAL_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const rows = await withDbRetry(() => db
    .select()
    .from(drDeviationSamples)
    .where(and(eq(drDeviationSamples.isTest, false), gte(drDeviationSamples.recordedAt, since))));

  const model = computeModelFromSamples(rows.map(rowToSample));
  const contributingUsers = new Set(rows.map((r) => r.userId)).size;

  await withDbRetry(() => db
    .insert(drCorrectionGlobal)
    .values({
      id: "global",
      distanceScale: model.distanceScale,
      speedScale: model.speedScale,
      speedBiasKmh: model.speedBiasKmh,
      headingBiasDeg: model.headingBiasDeg,
      sampleCount: model.sampleCount,
      contributingUsers,
      meanPosErrorM: model.meanPosErrorM,
      meanSpeedErrorKmh: model.meanSpeedErrorKmh,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: drCorrectionGlobal.id,
      set: {
        distanceScale: model.distanceScale,
        speedScale: model.speedScale,
        speedBiasKmh: model.speedBiasKmh,
        headingBiasDeg: model.headingBiasDeg,
        sampleCount: model.sampleCount,
        contributingUsers,
        meanPosErrorM: model.meanPosErrorM,
        meanSpeedErrorKmh: model.meanSpeedErrorKmh,
        updatedAt: new Date(),
      },
    }));
  return { ...model, contributingUsers };
}

/** Load the stored global model (identity if none computed yet). */
export async function getGlobalModel(): Promise<DrCorrectionModel> {
  const rows = await withDbRetry(() => db.select().from(drCorrectionGlobal).where(eq(drCorrectionGlobal.id, "global")).limit(1));
  const g = rows[0];
  if (!g) return { ...IDENTITY_MODEL };
  return {
    distanceScale: g.distanceScale,
    speedScale: g.speedScale,
    speedBiasKmh: g.speedBiasKmh,
    headingBiasDeg: g.headingBiasDeg,
    meanPosErrorM: g.meanPosErrorM,
    meanSpeedErrorKmh: g.meanSpeedErrorKmh,
    sampleCount: g.sampleCount,
  };
}

/**
 * The effective correction model a client should apply for this user: the user's
 * own model blended with the global model (heavier on the user as they gather data).
 */
export async function getEffectiveModel(userId: string): Promise<DrCorrectionModel> {
  const [userRows, global] = await Promise.all([
    withDbRetry(() => db.select().from(drCorrectionModel).where(eq(drCorrectionModel.userId, userId)).limit(1)),
    getGlobalModel(),
  ]);
  const u = userRows[0];
  const userModel: DrCorrectionModel = u
    ? {
        distanceScale: u.distanceScale,
        speedScale: u.speedScale,
        speedBiasKmh: u.speedBiasKmh,
        headingBiasDeg: u.headingBiasDeg,
        meanPosErrorM: u.meanPosErrorM,
        meanSpeedErrorKmh: u.meanSpeedErrorKmh,
        sampleCount: u.sampleCount,
      }
    : { ...IDENTITY_MODEL };
  return blendWithGlobal(userModel, global);
}

/** Count of stored deviation samples (for lightweight stats/health). */
export async function getSampleCount(): Promise<number> {
  const res = await withDbRetry(() => db.execute<{ c: string }>(sql`SELECT COUNT(*)::text AS c FROM dr_deviation_samples`));
  return parseInt((res.rows ?? [])[0]?.c ?? "0", 10);
}
