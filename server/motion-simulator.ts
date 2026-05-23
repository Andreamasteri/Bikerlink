/**
 * motion-simulator.ts
 * GPS motion simulator for fake users (Stregatti).
 *
 * - Each fake user gets a per-session schedule: alternating drive/rest slots
 *   summing to ~18h drive / 6h rest over 24h.
 * - Each drive slot is assigned a speed profile: city (30–60 km/h),
 *   highway (90–130 km/h), or mountain (20–50 km/h).
 * - Deltas are computed from speed × cycle_interval (physics-correct) rather
 *   than raw random degree offsets, eliminating impossible speed jumps.
 * - Speed varies smoothly within a slot via a per-cycle acceleration step,
 *   targeting a random speed within the profile range.
 * - 35% of users are grouped in convoys of 5/10/20; groups form at the START
 *   of each drive slot among users who just entered that slot. Users already
 *   mid-slot are NOT regrouped.
 * - Cron every 30 s: update coords + lastLoginAt for moving users.
 * - Toggle persisted in appSettings key "fake_motion_enabled".
 */

import { db } from "./db";
import { users, userProfiles } from "@shared/db";
import { eq, and, sql, inArray } from "drizzle-orm";
import { storage } from "./storage";

// ── Types ────────────────────────────────────────────────────────────────────

type SlotKind = "drive" | "rest";

interface Slot {
  kind: SlotKind;
  durationMs: number;
}

/** Italian road speed profiles */
export type SpeedProfile = "city" | "highway" | "mountain";

/**
 * Physical characteristics of each speed profile.
 * accelKphPerCycle: max speed change allowed in one 30 s tick (smooth curve).
 * fixedHeading: true for highways (straight), false for city/mountain (winding).
 */
export interface SpeedProfileConfig {
  minKph: number;
  maxKph: number;
  accelKphPerCycle: number;
  fixedHeading: boolean;
}

export const SPEED_PROFILES: Record<SpeedProfile, SpeedProfileConfig> = {
  city:     { minKph: 30,  maxKph: 60,  accelKphPerCycle: 10, fixedHeading: false },
  highway:  { minKph: 90,  maxKph: 130, accelKphPerCycle: 15, fixedHeading: true  },
  mountain: { minKph: 20,  maxKph: 50,  accelKphPerCycle: 8,  fixedHeading: false },
};

/**
 * Profile selection weights for Italian roads.
 * city 50 %, highway 30 %, mountain 20 %.
 */
const PROFILE_WEIGHTS: Array<{ profile: SpeedProfile; weight: number }> = [
  { profile: "city",     weight: 0.50 },
  { profile: "highway",  weight: 0.30 },
  { profile: "mountain", weight: 0.20 },
];

interface UserMotionState {
  userId: string;
  lat: number;
  lng: number;
  schedule: Slot[];
  scheduleStartMs: number;
  /** Index of the slot the user is currently in */
  currentSlotIdx: number;
  /** Speed profile for the current drive slot */
  speedProfile: SpeedProfile;
  /** Current speed in km/h (varies smoothly within profile range) */
  currentSpeedKph: number;
  /** Target speed the current cycle is accelerating/decelerating toward */
  targetSpeedKph: number;
  headingRad: number;
  /** Small positional offset within a convoy (~±0.001°) */
  offsetLat: number;
  offsetLng: number;
}

// ── State ────────────────────────────────────────────────────────────────────

let _enabled = false;
let _timer: ReturnType<typeof setInterval> | null = null;
let _userStates = new Map<string, UserMotionState>();
let _lastCycleAt: Date | null = null;
let _totalCycles = 0;

export const MOTION_CRON_INTERVAL_MS = 30_000;

/** Metres per degree of latitude (constant). */
const KM_PER_LAT_DEG = 111.32;

// ── Helpers ──────────────────────────────────────────────────────────────────

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function randInt(min: number, max: number): number {
  return Math.floor(rand(min, max + 1));
}

/**
 * Distribute `total` milliseconds into exactly `n` slots each in [minMs, maxMs].
 * Uses a constrained allocator: each slot gets a random value within the range
 * that still allows the remaining slots to be filled with valid values.
 * Precondition: n * minMs <= total <= n * maxMs (caller must ensure this).
 * Exported for unit testing.
 */
export function allocateBoundedSlots(total: number, n: number, minMs: number, maxMs: number): number[] {
  const out: number[] = [];
  let remaining = total;
  for (let i = 0; i < n; i++) {
    const slotsLeft = n - i;
    // Clamp draw range so remaining slots can still fill [minMs, maxMs] each
    const lo = Math.max(minMs, remaining - (slotsLeft - 1) * maxMs);
    const hi = Math.min(maxMs, remaining - (slotsLeft - 1) * minMs);
    const dur = rand(lo, hi);
    out.push(dur);
    remaining -= dur;
  }
  return out;
}

/**
 * Generate a 24 h schedule of drive/rest slots for a single user.
 *
 * Target totals: ~18 h drive / ~6 h rest.
 * Drive slots: strictly [30 min, 3 h]  →  6 ≤ nDrive ≤ 36
 * Rest slots:  strictly [15 min, 90 min] →  4 ≤ nRest  ≤ 24
 *
 * We pick nDrive in [6, 12] so both constraints are trivially satisfied
 * (nRest = nDrive also fits [4, 24]).  The allocator enforces per-slot bounds.
 */
export function generateSchedule(): Slot[] {
  const DRIVE_TOTAL = 18 * 60 * 60 * 1000;
  const REST_TOTAL  =  6 * 60 * 60 * 1000;
  const DRIVE_MIN   = 30 * 60 * 1000;
  const DRIVE_MAX   =  3 * 60 * 60 * 1000;
  const REST_MIN    = 15 * 60 * 1000;
  const REST_MAX    = 90 * 60 * 1000;

  // 6–12 drive slots (and same number of rest slots) keeps both budgets
  // within the feasible range of the bounded allocator.
  const n = randInt(6, 12);

  const driveSlots = allocateBoundedSlots(DRIVE_TOTAL, n, DRIVE_MIN, DRIVE_MAX);
  const restSlots  = allocateBoundedSlots(REST_TOTAL,  n, REST_MIN,  REST_MAX);

  const slots: Slot[] = [];
  const startWithDrive = Math.random() > 0.3;
  for (let i = 0; i < n; i++) {
    if (startWithDrive) {
      slots.push({ kind: "drive", durationMs: driveSlots[i] });
      slots.push({ kind: "rest",  durationMs: restSlots[i]  });
    } else {
      slots.push({ kind: "rest",  durationMs: restSlots[i]  });
      slots.push({ kind: "drive", durationMs: driveSlots[i] });
    }
  }
  return slots;
}

/**
 * Return the current slot index for a user given now.
 * The 24 h schedule repeats: elapsed wraps modulo totalDuration.
 */
function resolveSlotIdx(state: UserMotionState, nowMs: number): number {
  const totalMs = state.schedule.reduce((s, sl) => s + sl.durationMs, 0);
  const elapsed = (nowMs - state.scheduleStartMs) % totalMs;
  let acc = 0;
  for (let i = 0; i < state.schedule.length; i++) {
    acc += state.schedule[i].durationMs;
    if (elapsed < acc) return i;
  }
  return state.schedule.length - 1;
}

/** Pick a random heading (radians). */
function randHeading(): number {
  return Math.random() * 2 * Math.PI;
}

/**
 * Pick a speed profile using the configured weighted distribution.
 * Exported for unit testing.
 */
export function pickSpeedProfile(): SpeedProfile {
  const r = Math.random();
  let cumulative = 0;
  for (const { profile, weight } of PROFILE_WEIGHTS) {
    cumulative += weight;
    if (r < cumulative) return profile;
  }
  return "city";
}

/** Pick a random starting speed within the given profile range. */
function randSpeedForProfile(profile: SpeedProfile): number {
  const cfg = SPEED_PROFILES[profile];
  return rand(cfg.minKph, cfg.maxKph);
}

/** Assign a fresh speed profile, heading, and speed to a user entering a new drive slot. */
function assignFreshDriveParams(state: UserMotionState): void {
  state.speedProfile = pickSpeedProfile();
  state.headingRad = randHeading();
  state.offsetLat = 0;
  state.offsetLng = 0;
  state.currentSpeedKph = randSpeedForProfile(state.speedProfile);
  state.targetSpeedKph  = randSpeedForProfile(state.speedProfile);
}

/**
 * Advance currentSpeedKph one step toward targetSpeedKph, capped by
 * the profile's accelKphPerCycle.  When close to target, pick a new target.
 */
function stepSpeed(state: UserMotionState): void {
  const cfg = SPEED_PROFILES[state.speedProfile];
  const diff = state.targetSpeedKph - state.currentSpeedKph;
  const step = Math.min(Math.abs(diff), cfg.accelKphPerCycle) * Math.sign(diff);
  state.currentSpeedKph = Math.max(cfg.minKph, Math.min(cfg.maxKph, state.currentSpeedKph + step));

  // When within 2 km/h of the target, pick a new random target
  if (Math.abs(state.targetSpeedKph - state.currentSpeedKph) < 2) {
    state.targetSpeedKph = randSpeedForProfile(state.speedProfile);
  }
}

/**
 * Form convoys among users who just entered a new drive slot.
 * 35% are grouped into convoys of 5/10/20.
 * Only the users in `newDriveUsers` are touched.
 */
function formConvoysForNewSlot(newDriveUsers: UserMotionState[]): void {
  const GROUP_SIZES = [5, 10, 20];
  const GROUP_FRACTION = 0.35;

  // Shuffle candidates
  const candidates = [...newDriveUsers].sort(() => Math.random() - 0.5);
  const poolSize = Math.floor(candidates.length * GROUP_FRACTION);

  let idx = 0;
  while (idx < poolSize) {
    const size = GROUP_SIZES[randInt(0, GROUP_SIZES.length - 1)];
    const members = candidates.slice(idx, idx + size);
    // Only form exact-sized convoys (5, 10, or 20). Skip leftover fragments.
    if (members.length < size) break;

    // Leader's state defines group profile, heading, and anchor position
    const leader = members[0];
    const groupProfile: SpeedProfile = leader.speedProfile;
    const groupHeading = leader.headingRad;
    const anchorLat = leader.lat;
    const anchorLng = leader.lng;

    for (const m of members) {
      m.speedProfile = groupProfile;
      m.headingRad = groupHeading;
      // Start convoy members at a random speed within the shared profile
      m.currentSpeedKph = randSpeedForProfile(groupProfile);
      m.targetSpeedKph  = randSpeedForProfile(groupProfile);
      // Cluster members tightly around leader anchor (~±0.001° ≈ 100 m).
      // The base position (m.lat/m.lng) is stored WITHOUT the offset so that
      // runCycle's "effectiveLat = state.lat + state.offsetLat" does not
      // double-apply it.
      m.offsetLat = rand(-0.001, 0.001);
      m.offsetLng = rand(-0.001, 0.001);
      m.lat = anchorLat;
      m.lng = anchorLng;
    }
    idx += size;
  }
}

/**
 * Apply a physics-correct movement delta to (lat, lng).
 *
 * Distance is derived from currentSpeedKph × cycle interval, converting
 * km/h → km/cycle → degrees via the local scale factors.
 * City and mountain profiles use a randomised heading each cycle (winding
 * roads).  Highway uses the fixed slot heading (straight corridor).
 *
 * Longitude degrees shrink toward the poles: 1° lng ≈ 111.32 × cos(lat) km.
 */
function applyDelta(
  lat: number,
  lng: number,
  state: UserMotionState,
): { lat: number; lng: number } {
  // Advance speed smoothly before computing the displacement
  stepSpeed(state);

  const cfg = SPEED_PROFILES[state.speedProfile];
  const intervalSeconds = MOTION_CRON_INTERVAL_MS / 1000;

  // Physical distance covered this cycle (km)
  const distKm = (state.currentSpeedKph / 3600) * intervalSeconds;

  // Heading: highways keep a fixed bearing, city/mountain wind randomly
  const effectiveHeading = cfg.fixedHeading ? state.headingRad : randHeading();

  // Convert km → degrees (latitude is uniform; longitude depends on lat)
  const latRad = (lat * Math.PI) / 180;
  const kmPerLngDeg = KM_PER_LAT_DEG * Math.cos(latRad);

  const dlat = (distKm * Math.cos(effectiveHeading)) / KM_PER_LAT_DEG;
  const dlng = (distKm * Math.sin(effectiveHeading)) / (kmPerLngDeg || 1);

  const newLat = Math.max(-85, Math.min(85, lat + dlat));
  const newLng = ((lng + dlng + 180) % 360 + 360) % 360 - 180;
  return { lat: newLat, lng: newLng };
}

// ── Initialization ───────────────────────────────────────────────────────────

async function loadFakeUsers(): Promise<void> {
  const rows = await db
    .select({
      id: users.id,
      lat: userProfiles.latitude,
      lng: userProfiles.longitude,
    })
    .from(users)
    .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
    .where(
      and(
        eq(users.isFake, true),
        sql`${users.nickname} != 'BikerLink_Official'`,
      ),
    );

  if (rows.length === 0) {
    console.log("[MOTION] No fake users found, simulator will be idle.");
    return;
  }

  const nowMs = Date.now();
  const newStates = new Map<string, UserMotionState>();

  for (const row of rows) {
    const lat = row.lat ?? rand(37, 47); // fallback: Italy bounding box
    const lng = row.lng ?? rand(7, 18);
    const schedule = generateSchedule();
    // Stagger start times so not all users are in the same slot phase
    const scheduleStartMs = nowMs - rand(0, 24 * 60 * 60 * 1000);
    const initProfile = pickSpeedProfile();
    newStates.set(row.id, {
      userId: row.id,
      lat,
      lng,
      schedule,
      scheduleStartMs,
      currentSlotIdx: 0, // resolved on first cycle
      speedProfile: initProfile,
      currentSpeedKph: randSpeedForProfile(initProfile),
      targetSpeedKph:  randSpeedForProfile(initProfile),
      headingRad: randHeading(),
      offsetLat: 0,
      offsetLng: 0,
    });
  }

  _userStates = newStates;

  // Resolve initial slot indices
  const nowMs2 = Date.now();
  for (const state of _userStates.values()) {
    state.currentSlotIdx = resolveSlotIdx(state, nowMs2);
  }

  // Form initial convoys for users already in a drive slot at startup
  const startupDriveUsers: UserMotionState[] = [];
  for (const state of _userStates.values()) {
    const slot = state.schedule[state.currentSlotIdx];
    if (slot && slot.kind === "drive") startupDriveUsers.push(state);
  }
  if (startupDriveUsers.length >= 2) {
    formConvoysForNewSlot(startupDriveUsers);
    console.log(`[MOTION] Formed startup convoys for ${startupDriveUsers.length} users already in drive slot`);
  }

  console.log(`[MOTION] Loaded ${_userStates.size} fake users`);
}

// ── Cron cycle ───────────────────────────────────────────────────────────────

let _cycleRunning = false;

async function runCycle(): Promise<void> {
  if (!_enabled || _userStates.size === 0) return;
  if (_cycleRunning) {
    console.warn("[MOTION] Previous cycle still running — skipping this tick");
    return;
  }
  _cycleRunning = true;
  try {
    await runCycleInner();
  } finally {
    _cycleRunning = false;
  }
}

async function runCycleInner(): Promise<void> {

  const nowMs = Date.now();

  // Step 1: detect slot transitions and collect users entering NEW drive slots
  const newDriveUsers: UserMotionState[] = [];

  for (const state of _userStates.values()) {
    const newIdx = resolveSlotIdx(state, nowMs);
    if (newIdx !== state.currentSlotIdx) {
      state.currentSlotIdx = newIdx;
      const newSlot = state.schedule[newIdx];
      if (newSlot.kind === "drive") {
        // Entering a new drive slot — assign fresh speed profile and heading
        assignFreshDriveParams(state);
        newDriveUsers.push(state);
      }
    }
  }

  // Step 2: form convoys ONLY among users entering a new drive slot this cycle
  if (newDriveUsers.length >= 2) {
    formConvoysForNewSlot(newDriveUsers);
  }

  // Step 3: compute and apply physics-based deltas for all currently-in-drive users
  const movingIds: string[] = [];
  const updates: Array<{ userId: string; lat: number; lng: number }> = [];

  for (const state of _userStates.values()) {
    const slot = state.schedule[state.currentSlotIdx];
    if (!slot || slot.kind !== "drive") continue;

    const effectiveLat = state.lat + state.offsetLat;
    const effectiveLng = state.lng + state.offsetLng;
    const { lat, lng } = applyDelta(effectiveLat, effectiveLng, state);

    // Move the base position (without offset) so future cycles are coherent.
    state.lat = lat - state.offsetLat;
    state.lng = lng - state.offsetLng;

    movingIds.push(state.userId);
    updates.push({ userId: state.userId, lat, lng });
  }

  if (updates.length === 0) {
    _lastCycleAt = new Date();
    _totalCycles++;
    return;
  }

  // Step 4: batch-update coordinates in DB (chunked)
  const CHUNK = 200;
  for (let i = 0; i < updates.length; i += CHUNK) {
    const chunk = updates.slice(i, i + CHUNK);
    await Promise.allSettled(
      chunk.map(({ userId, lat, lng }) =>
        db
          .update(userProfiles)
          .set({ latitude: lat, longitude: lng, coordinatesUpdatedAt: new Date() })
          .where(eq(userProfiles.userId, userId)),
      ),
    );
  }

  // Step 5: batch-update lastLoginAt for moving users (heartbeat)
  for (let i = 0; i < movingIds.length; i += CHUNK) {
    const chunk = movingIds.slice(i, i + CHUNK);
    await db
      .update(users)
      .set({ lastLoginAt: new Date() })
      .where(and(eq(users.isFake, true), inArray(users.id, chunk)));
  }

  _lastCycleAt = new Date();
  _totalCycles++;
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function startMotionSimulator(): Promise<void> {
  const setting = await storage.getAppSetting("fake_motion_enabled");
  _enabled = setting?.value === "true";
  await loadFakeUsers();

  if (_enabled && _userStates.size > 0) {
    _timer = setInterval(runCycle, MOTION_CRON_INTERVAL_MS);
    console.log(
      `[MOTION] Simulator STARTED — ${_userStates.size} users, cron every ${MOTION_CRON_INTERVAL_MS / 1000}s`,
    );
  } else if (_enabled && _userStates.size === 0) {
    console.log("[MOTION] Toggle is ON but no fake users found — cron not started");
  } else {
    console.log("[MOTION] Simulator loaded but PAUSED (toggle is OFF)");
  }
}

export async function setMotionEnabled(enabled: boolean): Promise<void> {
  _enabled = enabled;
  await storage.upsertAppSetting("fake_motion_enabled", enabled ? "true" : "false");

  if (enabled) {
    if (_userStates.size === 0) await loadFakeUsers();
    if (_userStates.size > 0 && !_timer) {
      _timer = setInterval(runCycle, MOTION_CRON_INTERVAL_MS);
      console.log("[MOTION] Simulator RESUMED");
    } else if (_userStates.size === 0) {
      console.log("[MOTION] Toggle ON but still no fake users — cron not started");
    }
  } else {
    if (_timer) {
      clearInterval(_timer);
      _timer = null;
    }
    console.log("[MOTION] Simulator PAUSED");
  }
}

export function getMotionStatus() {
  let movingCount = 0;
  const profileCounts: Record<SpeedProfile, number> = { city: 0, highway: 0, mountain: 0 };
  let speedSum = 0;
  let speedCount = 0;

  if (_enabled) {
    for (const s of _userStates.values()) {
      const slot = s.schedule[s.currentSlotIdx];
      if (slot && slot.kind === "drive") {
        movingCount++;
        profileCounts[s.speedProfile]++;
        speedSum += s.currentSpeedKph;
        speedCount++;
      }
    }
  }

  const restingNow = _userStates.size - movingCount;

  return {
    enabled: _enabled,
    totalFakeUsers: _userStates.size,
    movingNow: movingCount,
    restingNow,
    lastCycleAt: _lastCycleAt?.toISOString() ?? null,
    totalCycles: _totalCycles,
    speedDistribution: {
      city: profileCounts.city,
      highway: profileCounts.highway,
      mountain: profileCounts.mountain,
    },
    averageSpeedKph: speedCount > 0 ? Math.round(speedSum / speedCount) : 0,
  };
}

export function stopMotionSimulator(): void {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
  }
}
