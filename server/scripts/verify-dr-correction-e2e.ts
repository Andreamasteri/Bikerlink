/**
 * Task #67 — End-to-end verification of the deterministic DR/GPS correction engine
 * (Task #47) on a synthetic ("fittizia") route.
 *
 * This is a VERIFICATION harness, NOT a new feature and NOT an AI/LLM agent. It
 * exercises the real dead-reckoning correction engine introduced by Task #47:
 *
 *   synthetic route + telemetry (GPS fixes + a sensor-only DR blackout + a GPS
 *   reacquisition with a KNOWN injected deviation)
 *      → real HTTP upload (POST /api/telemetry/batch, POST /api/telemetry/dr-deviation)
 *      → real ingestion (server/dr-correction/engine.ts) + real-time per-user model recompute
 *      → periodic global aggregate job (server/jobs/dr-correction-global.ts)
 *      → admin read APIs + per-user JSON export
 *
 * The injected deviation is deterministic, so the engine's numeric output
 * (distanceScale/speedScale/speedBias/headingBias) can be compared against the
 * expected value. All synthetic data is marked test/synthetic (the user carries
 * isFake=true → the engine stamps is_test SERVER-SIDE) so it is excluded from the
 * global aggregate, and it is fully removed at the end.
 *
 * Run against a LOCAL running backend:  npx tsx server/scripts/verify-dr-correction-e2e.ts
 * The base URL defaults to http://localhost:5000 (override with DR_E2E_BASE_URL).
 */

import crypto from "node:crypto";
import cookieSignature from "cookie-signature";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { computeDestinationPoint } from "@shared/tracking-fusion";
import {
  haversineMeters,
  bearingDeg,
  angleDiffDeg,
  blendWithGlobal,
  type DrCorrectionModel,
} from "@shared/dr-correction";
import { recomputeDrCorrectionGlobal } from "../jobs/dr-correction-global";

const BASE_URL = process.env.DR_E2E_BASE_URL ?? "http://localhost:5000";
const SESSION_SECRET = process.env.SESSION_SECRET;

// ── Injected (KNOWN) deviation scenario ───────────────────────────────────────
// DR under-reports distance & speed by 10%; a small constant heading bias.
const N_DEVIATION_SAMPLES = 8;          // ≥ MIN_SAMPLES_FOR_USER_MODEL (5)
const DR_DISTANCE_KM = 0.4;             // what dead reckoning accumulated
const EXPECTED_DISTANCE_SCALE = 1.1;    // gps/dr ratio → true distance 10% longer
const GPS_DISTANCE_KM = DR_DISTANCE_KM * EXPECTED_DISTANCE_SCALE; // 0.44
const EST_SPEED_KMH = 50;               // DR-estimated speed at recovery
const OBS_SPEED_KMH = 55;               // GPS-observed speed → speedScale 1.10, bias +5
const EXPECTED_SPEED_SCALE = OBS_SPEED_KMH / EST_SPEED_KMH; // 1.10
const EXPECTED_SPEED_BIAS = OBS_SPEED_KMH - EST_SPEED_KMH;  // 5
const EXPECTED_HEADING_BIAS = 3;        // deg
const RECOVERY_ACCURACY_M = 5;          // ≤ RECOVERY_MAX_ACCURACY_M (35) → passes gate
const RECOVERY_FIX_COUNT = 3;           // = RECOVERY_FIXES_REQUIRED → passes gate
const BLACKOUT_MS = Math.round((DR_DISTANCE_KM / EST_SPEED_KMH) * 3_600_000); // ~28.8s

const EPS = 1e-6;

interface Check { name: string; ok: boolean; detail: string }
const checks: Check[] = [];
function record(name: string, ok: boolean, detail = "") {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "✅ PASS" : "❌ FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}
function near(a: number, b: number, tol = 1e-4) { return Math.abs(a - b) <= tol; }

// ── Auth: mint a valid connect.sid Bearer token for a DB-backed session ────────
async function createSession(userId: string): Promise<string> {
  const sid = crypto.randomBytes(24).toString("hex");
  const expire = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const sess = {
    cookie: {
      originalMaxAge: 24 * 60 * 60 * 1000,
      expires: expire.toISOString(),
      httpOnly: true,
      path: "/",
    },
    userId,
  };
  await db.execute(sql`
    INSERT INTO session (sid, sess, expire)
    VALUES (${sid}, ${JSON.stringify(sess)}::json, ${expire.toISOString()})
  `);
  return "s:" + cookieSignature.sign(sid, SESSION_SECRET!);
}

async function api(token: string, method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: unknown = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
  return { status: res.status, json: json as Record<string, unknown> | null, text };
}

// ── Fake user + fake route (with a track) ──────────────────────────────────────
async function createFakeUser(nickname: string, role: "user" | "admin"): Promise<string> {
  const id = crypto.randomUUID();
  const email = `${nickname.toLowerCase()}-${id.slice(0, 8)}@dr-e2e.test`;
  await db.execute(sql`
    INSERT INTO users (id, nickname, email, password, role, status, is_fake, email_verified)
    VALUES (${id}, ${nickname + "_" + id.slice(0, 6)}, ${email}, ${"x"}, ${role}, ${"active"}, ${true}, ${true})
  `);
  return id;
}

async function createFakeRoute(userId: string): Promise<string> {
  const id = crypto.randomUUID();
  await db.execute(sql`
    INSERT INTO routes (id, user_id, title, status, total_distance_km)
    VALUES (${id}, ${userId}, ${"DR E2E fake route"}, ${"completed"}, ${GPS_DISTANCE_KM})
  `);
  // A short, simple track (straight leg heading east) — also usable to drive the
  // red-strip navigation view (Task #48) on a device.
  const start = { lat: 45.5, lng: 9.0 };
  for (let i = 0; i < 8; i++) {
    const p = computeDestinationPoint(start.lat, start.lng, 0.05 * i, 90);
    await db.execute(sql`
      INSERT INTO route_points (route_id, latitude, longitude, altitude, speed_kmh, timestamp)
      VALUES (${id}, ${p.lat}, ${p.lng}, ${120}, ${50}, NOW())
    `);
  }
  return id;
}

// ── Synthetic telemetry: GPS fixes + sensor-only blackout + GPS reacquisition ──
function buildTelemetrySamples(): { samples: unknown[]; gpsCount: number; sensorOnly: number } {
  const start = { lat: 45.5, lng: 9.0 };
  const samples: unknown[] = [];
  let t = Date.now() - 600_000;
  let distKm = 0;

  // Phase A — regular GPS fixes (good accuracy), heading east at ~50 km/h.
  const A = 20;
  for (let i = 0; i < A; i++) {
    distKm += 0.015;
    const p = computeDestinationPoint(start.lat, start.lng, distKm, 90);
    t += 1000;
    samples.push({
      ts: t, lat: p.lat, lon: p.lng, speed_kmh: 50, heading: 90,
      lean_angle: 8, gforce_x: 0.1, altitude_m: 120,
    });
  }
  // Phase B — GPS blackout: sensor-only DR samples (lat/lon absent), same as a
  // tunnel. Matches the sensor-only shape shared/tracking-fusion classifies.
  const B = 6;
  for (let i = 0; i < B; i++) {
    t += 1000;
    samples.push({
      ts: t, lat: null, lon: null, speed_kmh: 50, heading: 90,
      lean_angle: 6, gforce_x: 0.05,
    });
  }
  // Phase C — GPS reacquisition (a few coherent good fixes).
  for (let i = 0; i < 4; i++) {
    distKm += 0.015;
    const p = computeDestinationPoint(start.lat, start.lng, distKm, 90);
    t += 1000;
    samples.push({
      ts: t, lat: p.lat, lon: p.lng, speed_kmh: 55, heading: 90,
      lean_angle: 8, gforce_x: 0.1, altitude_m: 120,
    });
  }
  return { samples, gpsCount: A + 4, sensorOnly: B };
}

// One deviation observation, exactly as the client computes it at a confirmed
// recovery (see hooks/tracking/useTrackingEffects.ts). Deterministic ⇒ the median
// over N identical samples equals the injected value exactly.
function buildDeviationSample(sessionId: string) {
  const anchor = { lat: 45.5, lng: 9.0 };
  // DR estimate: straight east by DR_DISTANCE_KM.
  const drEst = computeDestinationPoint(anchor.lat, anchor.lng, DR_DISTANCE_KM, 90);
  // GPS recovery: farther (ratio 1.10) and rotated by the heading bias.
  const recovery = computeDestinationPoint(
    anchor.lat, anchor.lng, GPS_DISTANCE_KM, 90 + EXPECTED_HEADING_BIAS,
  );
  const gpsDistanceKm = haversineMeters(anchor.lat, anchor.lng, recovery.lat, recovery.lng) / 1000;
  const posErrorM = haversineMeters(drEst.lat, drEst.lng, recovery.lat, recovery.lng);
  const headingErrorDeg = angleDiffDeg(
    bearingDeg(anchor.lat, anchor.lng, drEst.lat, drEst.lng),
    bearingDeg(anchor.lat, anchor.lng, recovery.lat, recovery.lng),
  );
  return {
    sessionId,
    blackoutMs: BLACKOUT_MS,
    drDistanceKm: DR_DISTANCE_KM,
    gpsDistanceKm,
    posErrorM,
    estSpeedKmh: EST_SPEED_KMH,
    obsSpeedKmh: OBS_SPEED_KMH,
    headingErrorDeg,
    recoveryAccuracyM: RECOVERY_ACCURACY_M,
    recoveryFixCount: RECOVERY_FIX_COUNT,
  };
}

async function main() {
  if (!SESSION_SECRET) throw new Error("SESSION_SECRET non impostato — impossibile firmare la sessione");

  console.log(`\n=== Task #67 — DR/GPS correction engine E2E (base: ${BASE_URL}) ===\n`);

  // Reachability
  const health = await fetch(`${BASE_URL}/api/health`).then((r) => r.text()).catch(() => "");
  record("backend raggiungibile", /booting|ready|degraded/i.test(health), health.slice(0, 60));
  if (!/booting|ready|degraded/i.test(health)) {
    console.error("Backend non raggiungibile — avvia il workflow 'Start Backend' e riprova.");
    process.exit(1);
  }

  let riderId = "", adminId = "";
  try {
    riderId = await createFakeUser("dr_e2e_rider", "user");
    adminId = await createFakeUser("dr_e2e_admin", "admin");
    const riderToken = await createSession(riderId);
    const adminToken = await createSession(adminId);
    const routeId = await createFakeRoute(riderId);
    record("utente fittizio + route fittizia creati", true, `rider=${riderId.slice(0, 8)} route=${routeId.slice(0, 8)}`);

    // ── Step 3: telemetry through the real batch pipeline ─────────────────────
    const { samples, gpsCount, sensorOnly } = buildTelemetrySamples();
    const batch = await api(riderToken, "POST", "/api/telemetry/batch", {
      session_id: routeId, session_type: "ride", samples,
    });
    const inserted = Number(batch.json?.inserted ?? -1);
    record("POST /api/telemetry/batch accettato", batch.status === 200 && inserted === gpsCount + sensorOnly,
      `status=${batch.status} inserted=${inserted} (atteso ${gpsCount + sensorOnly})`);

    const stats = await api(riderToken, "GET", "/api/telemetry/stats");
    const sc = Number(stats.json?.sample_count ?? -1);
    const soc = Number(stats.json?.sensor_only_count ?? -1);
    record("stats per-utente riflettono campioni + sensor-only", sc === gpsCount + sensorOnly && soc === sensorOnly,
      `sample_count=${sc} sensor_only_count=${soc} (atteso ${sensorOnly})`);

    // ── Step 2+3: deviation samples through the real ingestion pipeline ───────
    const dev = buildDeviationSample(routeId);
    console.log(`\n[injected] drDist=${dev.drDistanceKm} gpsDist=${dev.gpsDistanceKm.toFixed(5)} ` +
      `posErr=${dev.posErrorM.toFixed(2)}m headingErr=${dev.headingErrorDeg.toFixed(3)}°\n`);
    let stored = 0, dropped = 0, isTestFlag = false;
    // Upload as several incremental packets (as the client does — one per blackout).
    for (const chunk of [3, 3, 2]) {
      const r = await api(riderToken, "POST", "/api/telemetry/dr-deviation", {
        samples: Array.from({ length: chunk }, () => dev),
      });
      stored += Number(r.json?.stored ?? 0);
      dropped += Number(r.json?.dropped ?? 0);
      isTestFlag = Boolean(r.json?.isTest);
    }
    record("POST /api/telemetry/dr-deviation ingerito (marcato test)",
      stored === N_DEVIATION_SAMPLES && dropped === 0 && isTestFlag === true,
      `stored=${stored} dropped=${dropped} isTest=${isTestFlag}`);

    // ── Step 4: correction model produced & numerically correct ──────────────
    const eff = await api(riderToken, "GET", "/api/telemetry/dr-correction");
    const effModel = eff.json?.model as DrCorrectionModel | undefined;
    record("GET /api/telemetry/dr-correction restituisce un modello", !!effModel,
      effModel ? `distScale=${effModel.distanceScale.toFixed(4)}` : "nessun modello");

    // ── Step 5: admin panel data + per-user JSON export ──────────────────────
    const adminUsers = await api(adminToken, "GET", "/api/admin/dr-correction/users?limit=100");
    const usersArr = (adminUsers.json?.users as Array<Record<string, unknown>>) ?? [];
    const mine = usersArr.find((u) => u.userId === riderId);
    record("pannello admin elenca l'utente fittizio (stato modello)", !!mine && mine.isTest === true,
      mine ? `sampleCount=${mine.sampleCount} isTest=${mine.isTest} distScale=${Number(mine.distanceScale).toFixed(4)}` : "assente");

    const exp = await api(adminToken, "GET", `/api/admin/dr-correction/users/${riderId}/export`);
    const current = exp.json?.currentModel as (DrCorrectionModel & { dataQuality: number; isTest: boolean }) | null;
    const exportedSamples = (exp.json?.samples as unknown[]) ?? [];
    const exportEffective = exp.json?.effectiveModel as DrCorrectionModel | undefined;
    record("export JSON singolo utente contiene modello + serie campioni",
      !!current && exportedSamples.length === N_DEVIATION_SAMPLES,
      `samples=${exportedSamples.length} sampleCount=${current?.sampleCount}`);

    if (current) {
      record("distanceScale = scostamento iniettato",
        near(current.distanceScale, EXPECTED_DISTANCE_SCALE, EPS),
        `got=${current.distanceScale} atteso=${EXPECTED_DISTANCE_SCALE}`);
      record("speedScale = scostamento iniettato",
        near(current.speedScale, EXPECTED_SPEED_SCALE, EPS),
        `got=${current.speedScale} atteso=${EXPECTED_SPEED_SCALE}`);
      record("speedBiasKmh = scostamento iniettato",
        near(current.speedBiasKmh, EXPECTED_SPEED_BIAS, 1e-4),
        `got=${current.speedBiasKmh} atteso=${EXPECTED_SPEED_BIAS}`);
      record("headingBiasDeg ≈ scostamento iniettato",
        near(current.headingBiasDeg, EXPECTED_HEADING_BIAS, 0.05),
        `got=${current.headingBiasDeg?.toFixed(4)} atteso≈${EXPECTED_HEADING_BIAS}`);
      record("sampleCount corretto", current.sampleCount === N_DEVIATION_SAMPLES,
        `got=${current.sampleCount}`);
    }

    // Effective model must equal the documented blend(current, global).
    const globalRes = await api(adminToken, "GET", "/api/admin/dr-correction/global");
    const g = globalRes.json?.global as DrCorrectionModel | null;
    if (current && exportEffective) {
      const globalModel: DrCorrectionModel = g
        ? { distanceScale: g.distanceScale, speedScale: g.speedScale, speedBiasKmh: g.speedBiasKmh,
            headingBiasDeg: g.headingBiasDeg, meanPosErrorM: 0, meanSpeedErrorKmh: 0, sampleCount: g.sampleCount }
        : { distanceScale: 1, speedScale: 1, speedBiasKmh: 0, headingBiasDeg: 0, meanPosErrorM: 0, meanSpeedErrorKmh: 0, sampleCount: 0 };
      const expectedBlend = blendWithGlobal(current, globalModel);
      record("effectiveModel = blend(per-utente, globale)",
        near(exportEffective.distanceScale, expectedBlend.distanceScale, 1e-4) &&
        near(exportEffective.speedScale, expectedBlend.speedScale, 1e-4),
        `effDist=${exportEffective.distanceScale.toFixed(5)} attesoBlend=${expectedBlend.distanceScale.toFixed(5)}`);
    }

    // ── Step: global periodic job excludes test/synthetic data ───────────────
    await recomputeDrCorrectionGlobal();
    const testCount = await db.execute<{ c: string }>(sql`
      SELECT COUNT(*)::text AS c FROM dr_deviation_samples WHERE user_id = ${riderId} AND is_test = true`);
    const nonTestCount = await db.execute<{ c: string }>(sql`
      SELECT COUNT(*)::text AS c FROM dr_deviation_samples WHERE user_id = ${riderId} AND is_test = false`);
    record("campioni fittizi marcati is_test e ESCLUSI dal globale",
      Number(testCount.rows[0].c) === N_DEVIATION_SAMPLES && Number(nonTestCount.rows[0].c) === 0,
      `is_test=true:${testCount.rows[0].c} is_test=false:${nonTestCount.rows[0].c}`);

  } finally {
    // ── Step 7: cleanup — remove all synthetic data + sessions ───────────────
    if (riderId) {
      await db.execute(sql`DELETE FROM session WHERE sess->>'userId' IN (${riderId}, ${adminId})`);
      await db.execute(sql`DELETE FROM users WHERE id = ${riderId}`); // cascades telemetry/samples/model/route
      if (adminId) await db.execute(sql`DELETE FROM users WHERE id = ${adminId}`);
      const left = await db.execute<{ c: string }>(sql`
        SELECT COUNT(*)::text AS c FROM dr_correction_model WHERE user_id = ${riderId}`);
      record("pulizia: dati fittizi rimossi (nessun utente reale residuo)",
        Number(left.rows[0].c) === 0, `modelli residui=${left.rows[0].c}`);
      await recomputeDrCorrectionGlobal(); // refresh global after removal
    }
  }

  const failed = checks.filter((c) => !c.ok);
  console.log(`\n=== RISULTATO: ${checks.length - failed.length}/${checks.length} check superati ===`);
  if (failed.length) {
    console.log("FALLITI:\n" + failed.map((c) => `  - ${c.name}: ${c.detail}`).join("\n"));
    process.exit(1);
  }
  console.log("Tutti i check superati. ✅");
  process.exit(0);
}

main().catch((err) => {
  console.error("Errore fatale nella verifica DR E2E:", err);
  process.exit(1);
});
