/**
 * check-admin-map-exclusion.ts
 *
 * Regression guard for Task #1212 (admin exclusion from map and counts).
 *
 * Seeds one admin user + profile with an active location, then asserts that
 * every storage query and every in-memory OnlineTracker method excludes that
 * admin from results.  The seed row is deleted on exit regardless of outcome.
 *
 * Usage:  npx tsx scripts/check-admin-map-exclusion.ts
 * Exit 0 = all checks pass
 * Exit 1 = one or more checks failed
 */

import { db } from "../server/db";
import { users, userProfiles } from "../shared/schema";
import { eq } from "drizzle-orm";
import { DatabaseStorage } from "../server/storage";
import { OnlineTracker } from "../server/online-tracker";

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
const ADMIN_ID = "test-admin-exclusion-check-001";
const ADMIN_EMAIL = "test-admin-exclusion-check-001@bikerlink.internal";
// Milan coords — inside any generous "nearby" radius
const LAT = 45.4642;
const LNG = 9.19;

async function seedAdmin(): Promise<void> {
  await db.insert(users).values({
    id: ADMIN_ID,
    nickname: "test-admin-exclusion",
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

async function cleanupAdmin(): Promise<void> {
  // userProfiles is CASCADE-deleted when the user row is removed.
  await db.delete(users).where(eq(users.id, ADMIN_ID));
}

// ── Storage-layer checks ─────────────────────────────────────────────────────
async function checkStorageMethods(storage: DatabaseStorage): Promise<void> {
  // Measure counts BEFORE admin is present so we can detect any +1 leak.
  const countBefore = await storage.countAvailableUsers();

  // Seed the admin now (counts re-measured below).
  await seedAdmin();

  // --- countAvailableUsers ---
  const countAfter = await storage.countAvailableUsers();
  assert(
    countAfter === countBefore,
    `countAvailableUsers() unchanged after seeding admin (${countBefore} → ${countAfter})`,
    `countAvailableUsers() increased from ${countBefore} to ${countAfter} — admin leaked into available-user count`,
  );

  // --- getOnlineUsersList ---
  const onlineList = await storage.getOnlineUsersList(
    new Date(Date.now() - 60_000), // since 1 min ago
    LAT,
    LNG,
  );
  const adminInOnlineList = onlineList.some((r: any) => r.user?.id === ADMIN_ID);
  assert(
    !adminInOnlineList,
    "getOnlineUsersList() does not contain the admin",
    "getOnlineUsersList() returned an admin row — admin leaked into online list",
  );

  // --- getAvailableUsersList ---
  const availList = await storage.getAvailableUsersList(LAT, LNG);
  const adminInAvailList = availList.some((r: any) => r.user?.id === ADMIN_ID);
  assert(
    !adminInAvailList,
    "getAvailableUsersList() does not contain the admin",
    "getAvailableUsersList() returned an admin row — admin leaked into available list",
  );

  // --- getNearbyUsers ---
  const nearby = await storage.getNearbyUsers(LAT, LNG, 20_000); // 20 000 km — whole planet
  const adminInNearby = nearby.some((r: any) => r.user?.id === ADMIN_ID);
  assert(
    !adminInNearby,
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
    "tracker.size() === 0 — admin slot was rejected by setOnline()",
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

// ── Entry point ───────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  console.log("=== BikerLink — Admin map-exclusion regression check ===\n");

  // Ensure a clean slate (idempotent in case a prior run crashed mid-test).
  await cleanupAdmin().catch(() => {});

  try {
    const storage = new DatabaseStorage();

    console.log("--- Storage layer (DB queries) ---");
    // seedAdmin() is called inside checkStorageMethods so the before-count
    // snapshot is taken first, then the admin row is inserted.
    await checkStorageMethods(storage);

    console.log("\n--- In-memory OnlineTracker ---");
    // Use a fresh tracker instance so real server state doesn't interfere.
    checkTrackerMethods(new OnlineTracker());
  } finally {
    await cleanupAdmin();
    console.log("\n  (seed row cleaned up)");
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
