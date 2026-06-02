/**
 * BikerLink — Data Export: SQL query builders + row iterators
 * Companion module for export-data.ts
 */

import { Pool } from "pg";

export const ALL_TABLES = [
  "users",
  "user_profiles",
  "user_motorcycles",
  "routes",
  "route_points",
  "planned_routes",
  "sprint_results",
] as const;
export type TableName = (typeof ALL_TABLES)[number];

export const TABLE_COLUMNS: Record<TableName, string[]> = {
  users:            ["id","nickname","email","password","role","status","isFake","country","region","birthYear","createdAt","lastLoginAt"],
  user_profiles:    ["userId","bio","totalKm","totalRides","latitude","longitude","isAvailable"],
  user_motorcycles: ["userId","brand","model","year","displacement","motorcycleType","ridingStyle","createdAt"],
  routes:           ["id","userId","title","status","totalDistanceKm","maxSpeedKmh","avgSpeedKmh","maxAltitude","durationSeconds","idleTimeSeconds","maxTiltDeg","maxAccelerationG","maxDecelerationG","maxLateralG","isSprint","sprint0to100Ms","gpsBlackoutCount","gpsBlackoutSeconds","likes","startedAt","stoppedAt","createdAt"],
  route_points:     ["routeId","lat","lng","altitude","speedKmh","accelG","tiltDeg","timestamp"],
  planned_routes:   ["id","userId","title","distanceKm","style","bikerScore","curvatureScore","waypoints","createdAt"],
  sprint_results:   ["userId","routeId","sprint0to100Ms","maxAccelerationG","maxTiltDeg","createdAt"],
};

const FAKE_USER_SUBQUERY = "SELECT id FROM users WHERE is_fake = true";

export interface QuerySpec { sql: string; params: unknown[] }

export function buildUsersQuery(excludeFake: boolean, since: string | null): QuerySpec {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (excludeFake) conditions.push("is_fake = false");
  if (since) { params.push(since); conditions.push(`created_at >= $${params.length}::date`); }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  return { sql: `SELECT id, nickname, email, password, role, status, is_fake AS "isFake", country, region, birth_year AS "birthYear", created_at AS "createdAt", last_login_at AS "lastLoginAt" FROM users ${where} ORDER BY created_at`, params };
}

export function buildUserProfilesQuery(excludeFake: boolean, since: string | null): QuerySpec {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (excludeFake) conditions.push(`user_id NOT IN (${FAKE_USER_SUBQUERY})`);
  if (since) { params.push(since); conditions.push(`updated_at >= $${params.length}::date`); }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  return { sql: `SELECT user_id AS "userId", bio, total_km AS "totalKm", total_rides AS "totalRides", latitude, longitude, is_available AS "isAvailable" FROM user_profiles ${where} ORDER BY user_id`, params };
}

export function buildUserMotorcyclesQuery(excludeFake: boolean, since: string | null): QuerySpec {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (excludeFake) conditions.push(`user_id NOT IN (${FAKE_USER_SUBQUERY})`);
  if (since) { params.push(since); conditions.push(`created_at >= $${params.length}::date`); }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  return { sql: `SELECT user_id AS "userId", brand, model, year, displacement, motorcycle_type AS "motorcycleType", riding_style AS "ridingStyle", created_at AS "createdAt" FROM user_motorcycles ${where} ORDER BY created_at`, params };
}

export function buildRoutesQuery(excludeFake: boolean, since: string | null): QuerySpec {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (excludeFake) conditions.push(`user_id NOT IN (${FAKE_USER_SUBQUERY})`);
  if (since) { params.push(since); conditions.push(`created_at >= $${params.length}::date`); }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  return {
    sql: `SELECT id, user_id AS "userId", title, status, total_distance_km AS "totalDistanceKm", max_speed_kmh AS "maxSpeedKmh", avg_speed_kmh AS "avgSpeedKmh", max_altitude AS "maxAltitude", duration_seconds AS "durationSeconds", idle_time_seconds AS "idleTimeSeconds", max_tilt_deg AS "maxTiltDeg", max_acceleration_g AS "maxAccelerationG", max_deceleration_g AS "maxDecelerationG", max_lateral_g AS "maxLateralG", is_sprint AS "isSprint", sprint_0to100_ms AS "sprint0to100Ms", gps_blackout_count AS "gpsBlackoutCount", gps_blackout_seconds AS "gpsBlackoutSeconds", likes, started_at AS "startedAt", stopped_at AS "stoppedAt", created_at AS "createdAt" FROM routes ${where} ORDER BY created_at`,
    params,
  };
}

export function buildRoutePointsQuery(excludeFake: boolean, since: string | null): QuerySpec {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (excludeFake) conditions.push(`route_id IN (SELECT id FROM routes WHERE user_id NOT IN (${FAKE_USER_SUBQUERY}))`);
  if (since) { params.push(since); conditions.push(`timestamp >= $${params.length}::date`); }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  return { sql: `SELECT route_id AS "routeId", latitude AS "lat", longitude AS "lng", altitude, speed_kmh AS "speedKmh", accel_g AS "accelG", tilt_deg AS "tiltDeg", timestamp FROM route_points ${where} ORDER BY route_id, timestamp`, params };
}

export function buildPlannedRoutesQuery(excludeFake: boolean, since: string | null): QuerySpec {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (excludeFake) conditions.push(`user_id NOT IN (${FAKE_USER_SUBQUERY})`);
  if (since) { params.push(since); conditions.push(`created_at >= $${params.length}::date`); }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  return { sql: `SELECT id, user_id AS "userId", title, distance_km AS "distanceKm", style, biker_score AS "bikerScore", real_curvature_score AS "curvatureScore", waypoints, created_at AS "createdAt" FROM planned_routes ${where} ORDER BY created_at`, params };
}

export function buildSprintResultsQuery(excludeFake: boolean, since: string | null): QuerySpec {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (excludeFake) conditions.push(`user_id NOT IN (${FAKE_USER_SUBQUERY})`);
  if (since) { params.push(since); conditions.push(`created_at >= $${params.length}::date`); }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  return { sql: `SELECT user_id AS "userId", route_id AS "routeId", sprint_0to100_ms AS "sprint0to100Ms", max_acceleration_g AS "maxAccelerationG", max_tilt_deg AS "maxTiltDeg", created_at AS "createdAt" FROM sprint_results ${where} ORDER BY created_at`, params };
}

export async function* simpleQuery(pool: Pool, sql: string, params: unknown[]): AsyncIterable<Record<string, unknown>> {
  const client = await pool.connect();
  try {
    const result = await client.query(sql, params);
    for (const row of result.rows) yield row as Record<string, unknown>;
  } finally {
    client.release();
  }
}

export async function* chunkedQuery(pool: Pool, sql: string, params: unknown[], chunkSize = 10_000): AsyncIterable<Record<string, unknown>> {
  const client = await pool.connect();
  try {
    let offset = 0;
    while (true) {
      const result = await client.query(`${sql} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, chunkSize, offset]);
      for (const row of result.rows) yield row as Record<string, unknown>;
      if (result.rows.length < chunkSize) break;
      offset += chunkSize;
    }
  } finally {
    client.release();
  }
}
