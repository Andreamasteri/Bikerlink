/**
 * check-admin-map-exclusion.ts
 *
 * Regression guard for Task #1212 (admin exclusion from map and counts).
 *
 * Seeds one admin user + one regular (biker) user, then asserts that every
 * storage query, every in-memory OnlineTracker method, and the three HTTP
 * endpoints all exclude the admin from results.  Both seed rows are deleted
 * on exit regardless of outcome.
 *
 * Usage:  npx tsx scripts/check-admin-map-exclusion.ts
 * Exit 0 = all checks pass
 * Exit 1 = one or more checks failed
 */

import { db } from "../server/db";
import { users, userProfiles } from "../shared/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { DatabaseStorage } from "../server/storage";
import { OnlineTracker } from "../server/online-tracker";

// ── Local row-shape interfaces (avoids any-casts on list results) ─────────────
interface UserRow {
  user: { id: string };
  profile: unknown;
  distance: number;
}

// ── Tiny reporter ────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;

function pass(msg: string): void {
  console.log(`  ✓  ${msg}`);
  passed++;
}

function fail(msg: string): void {
  console.error(`  ✗  ${msg}`);
  failed++;
}

function assert(condition: boolean, passMsg: string, failMsg: string): void {
  if (condition) pass(passMsg);
  else fail(failMsg);
}

// ── Test data ────────────────────────────────────────────────────────────────
const ADMIN_ID = "test-admin-excl-001";
const ADMIN_EMAIL = "test-admin-excl-001@bikerlink.internal";

const BIKER_ID = "test-biker-excl-001";
const BIKER_EMAIL = "test-biker-excl-001@bikerlink.internal";
const BIKER_PASSWORD = "Test1234!";

// Milan — inside any generous "nearby" radius
const LAT = 45.4642;
const LNG = 9.19;

const BASE_URL = "http://localhost:5000";

// ── Seed / cleanup helpers ────────────────────────────────────────────────────
async function seedAdmin(): Promise<void> {
  await db.insert(users).values({
    id: ADMIN_ID,
    nickname: "test-admin-excl",
    email: ADMIN_EMAIL,
    password: "unused",
    userType: "biker",
    role: "admin",
    status: "active",
    ghostMode: false,
    lastLoginAt: new Date(), // recently active — maximises leak surface
  });
  await db.insert(userProfiles).values({
    userId: ADMIN_ID,
    isAvailable: true,
    latitude: LAT,
    longitude: LNG,
  });
}

async function seedBiker(): Promise<void> {
  const hash = await bcrypt.hash(BIKER_PASSWORD, 10);
  await db.insert(users).values({
    id: BIKER_ID,
    nickname: "test-biker-excl",
    email: BIKER_EMAIL,
    password: hash,
    userType: "biker",
    role: "user",
    status: "active",
    ghostMode: false,
    emailVerified: true,
    lastLoginAt: new Date(),
  });
  await db.insert(userProfiles).values({
    userId: BIKER_ID,
    isAvailable: false,
    latitude: LAT,
    longitude: LNG,
  });
}

async function cleanup(): Promise<void> {
  // userProfiles rows are CASCADE-deleted when the user rows are removed.
  await db.delete(users).where(eq(users.id, ADMIN_ID));
  await db.delete(users).where(eq(users.id, BIKER_ID));
}

// ── HTTP helper ───────────────────────────────────────────────────────────────
async function httpGet(path: string, bearer: string): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${bearer}` },
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

// ── Storage-layer checks ─────────────────────────────────────────────────────
async function checkStorageMethods(storage: DatabaseStorage): Promise<void> {
  // Snapshot count BEFORE admin exists so we can detect any +1 leak.
  const countBefore = await storage.countAvailableUsers();

  await seedAdmin();

  // --- countAvailableUsers ---
  const countAfter = await storage.countAvailableUsers();
  assert(
    countAfter === countBefore,
    `countAvailableUsers() unchanged after seeding admin (${countBefore} → ${countAfter})`,
    `countAvailableUsers() increased from ${countBefore} to ${countAfter} — admin leaked into available-user count`,
  );

  // --- getOnlineUsersList ---
  const onlineList: UserRow[] = await storage.getOnlineUsersList(
    new Date(Date.now() - 60_000), // since 1 min ago
    LAT,
    LNG,
  );
  assert(
    !onlineList.some((r) => r.user?.id === ADMIN_ID),
    "getOnlineUsersList() does not contain the admin",
    "getOnlineUsersList() returned an admin row — admin leaked into online list",
  );

  // --- getAvailableUsersList ---
  const availList: UserRow[] = await storage.getAvailableUsersList(LAT, LNG);
  assert(
    !availList.some((r) => r.user?.id === ADMIN_ID),
    "getAvailableUsersList() does not contain the admin",
    "getAvailableUsersList() returned an admin row — admin leaked into available list",
  );

  // --- getNearbyUsers ---
  // 20 000 km radius ensures the admin would appear if the filter were missing.
  const nearby = await storage.getNearbyUsers(LAT, LNG, 20_000);
  assert(
    !nearby.some((r) => r.user.id === ADMIN_ID),
    "getNearbyUsers() does not contain the admin",
    "getNearbyUsers() returned an admin row — admin leaked into nearby list",
  );
}

// ── In-memory OnlineTracker checks ───────────────────────────────────────────
function checkTrackerMethods(tracker: OnlineTracker): void {
  // Attempt to register the admin — setOnline must silently reject it.
  tracker.setOnline(ADMIN_ID, {
    role: "admin",
    status: "active",
    userType: "biker",
    isAvailable: true,
    ghostMode: false,
    country: "IT",
  });

  assert(
    tracker.size() === 0,
    "tracker.size() === 0 — admin slot rejected by setOnline()",
    `tracker.size() === ${tracker.size()} — admin is occupying a tracker slot`,
  );
  assert(
    tracker.countOnlineUsers() === 0,
    "countOnlineUsers() === 0 (admin not counted)",
    `countOnlineUsers() === ${tracker.countOnlineUsers()} — admin leaked into count`,
  );
  assert(
    tracker.countAvailableBikers() === 0,
    "countAvailableBikers() === 0",
    `countAvailableBikers() === ${tracker.countAvailableBikers()} — admin leaked`,
  );
  assert(
    tracker.countAvailableZavorrine() === 0,
    "countAvailableZavorrine() === 0",
    `countAvailableZavorrine() === ${tracker.countAvailableZavorrine()} — admin leaked`,
  );
  assert(
    !tracker.getOnlineUserIds().includes(ADMIN_ID),
    "getOnlineUserIds() does not include the admin",
    "getOnlineUserIds() includes admin — leaked from tracker",
  );
  assert(
    !tracker.getAvailableBikerIds().includes(ADMIN_ID),
    "getAvailableBikerIds() does not include the admin",
    "getAvailableBikerIds() includes admin — leaked",
  );
  assert(
    !tracker.getAvailableZavorrinaIds().includes(ADMIN_ID),
    "getAvailableZavorrinaIds() does not include the admin",
    "getAvailableZavorrinaIds() includes admin — leaked",
  );
}

// ── HTTP-layer checks ─────────────────────────────────────────────────────────
async function checkHttpEndpoints(): Promise<void> {
  // 1. Obtain a session cookie by logging in as the non-admin biker.
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: BIKER_EMAIL, password: BIKER_PASSWORD }),
  });

  if (loginRes.status !== 200) {
    fail(`HTTP login for test biker failed (${loginRes.status}) — skipping HTTP checks`);
    return;
  }

  const loginBody = (await loginRes.json().catch(() => null)) as { sessionToken?: string } | null;
  const bearer = loginBody?.sessionToken ?? "";
  if (!bearer) {
    fail("HTTP login succeeded but no sessionToken in response — skipping HTTP checks");
    return;
  }
  pass("Login as test biker succeeded (Bearer token obtained)");

  // 2. GET /api/users/online-count
  // This endpoint reads from the in-memory tracker which already excludes
  // admins at setOnline() time.  Seed admin has a recent lastLoginAt but was
  // never accepted by the tracker, so the count must not increase.
  const countRes1 = await httpGet("/api/users/online-count", bearer);
  const count1: number = (countRes1.body as { count: number })?.count ?? -1;
  assert(
    countRes1.status === 200,
    `GET /api/users/online-count responded 200`,
    `GET /api/users/online-count responded ${countRes1.status}`,
  );
  // Sanity: count must be a non-negative integer (not NaN from a leaked admin).
  assert(
    Number.isInteger(count1) && count1 >= 0,
    `GET /api/users/online-count returned a valid count (${count1})`,
    `GET /api/users/online-count returned invalid count: ${count1}`,
  );

  // 3. GET /api/users/online-list — standard (online users only)
  const listRes = await httpGet("/api/users/online-list", bearer);
  assert(
    listRes.status === 200,
    "GET /api/users/online-list responded 200",
    `GET /api/users/online-list responded ${listRes.status}`,
  );
  const list = Array.isArray(listRes.body) ? (listRes.body as { id: string }[]) : [];
  assert(
    !list.some((u) => u.id === ADMIN_ID),
    "GET /api/users/online-list does not contain admin",
    "GET /api/users/online-list contains admin row — leaked through route",
  );

  // 4. GET /api/users/online-list?includeOffline=true
  // This route branch has its own inline SQL with notInArr(role,["admin"])
  // that is separate from storage.getOnlineUsersList().
  const offlineListRes = await httpGet("/api/users/online-list?includeOffline=true", bearer);
  assert(
    offlineListRes.status === 200,
    "GET /api/users/online-list?includeOffline=true responded 200",
    `GET /api/users/online-list?includeOffline=true responded ${offlineListRes.status}`,
  );
  const offlineList = Array.isArray(offlineListRes.body)
    ? (offlineListRes.body as { id: string }[])
    : [];
  assert(
    !offlineList.some((u) => u.id === ADMIN_ID),
    "GET /api/users/online-list?includeOffline=true does not contain admin",
    "GET /api/users/online-list?includeOffline=true contains admin row — inline SQL leaked admin",
  );

  // 5. GET /api/users/nearby — admin has a location seeded at Milan
  const nearbyRes = await httpGet(
    `/api/users/nearby?lat=${LAT}&lng=${LNG}&radius=20000`,
    bearer,
  );
  assert(
    nearbyRes.status === 200,
    "GET /api/users/nearby responded 200",
    `GET /api/users/nearby responded ${nearbyRes.status}`,
  );
  const nearbyList = Array.isArray(nearbyRes.body)
    ? (nearbyRes.body as { id: string }[])
    : [];
  assert(
    !nearbyList.some((u) => u.id === ADMIN_ID),
    "GET /api/users/nearby does not contain admin",
    "GET /api/users/nearby contains admin row — leaked through route",
  );
}

// ── Entry point ───────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  console.log("=== BikerLink — Admin map-exclusion regression check ===\n");

  // Ensure a clean slate (idempotent if a prior run crashed mid-test).
  await cleanup().catch(() => {});

  // Seed the biker now so HTTP checks can use it; admin is seeded inside
  // checkStorageMethods() after the before-count snapshot.
  await seedBiker();

  try {
    const storage = new DatabaseStorage();

    console.log("--- Storage layer (DB queries) ---");
    await checkStorageMethods(storage); // also calls seedAdmin() internally

    console.log("\n--- In-memory OnlineTracker ---");
    checkTrackerMethods(new OnlineTracker()); // isolated instance

    console.log("\n--- HTTP endpoints (authenticated) ---");
    await checkHttpEndpoints();
  } finally {
    await cleanup();
    console.log("\n  (seed rows cleaned up)");
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
