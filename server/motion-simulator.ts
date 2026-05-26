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

export interface UserMotionState {
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
  /**
   * Ramp transition sub-state:
   * - "ramp-out": rider is entering a rest stop, decelerating over several cycles
   * - "ramp-in":  rider is leaving a rest stop, accelerating up to cruising speed
   * - null: no active ramp
   */
  transitionPhase: "ramp-out" | "ramp-in" | null;
  /** Cycles remaining in the current ramp */
  transitionCyclesLeft: number;
  /** Total cycles planned for the current ramp (used to compute fractional speed) */
  transitionTotalCycles: number;
  /** Speed at the moment ramp-out began — used as the 100% reference for the decline */
  rampStartSpeedKph: number;
}

// ── Bounding Box ─────────────────────────────────────────────────────────────

export interface BoundingBox {
  latMin: number;
  latMax: number;
  lngMin: number;
  lngMax: number;
  enabled: boolean;
}

const DEFAULT_BBOX: BoundingBox = {
  latMin: 35,
  latMax: 71,
  lngMin: -25,
  lngMax: 45,
  enabled: true,
};

let _bbox: BoundingBox = { ...DEFAULT_BBOX };

export function getBoundingBox(): BoundingBox {
  return { ..._bbox };
}

export async function setBoundingBox(patch: Partial<BoundingBox>): Promise<void> {
  _bbox = { ..._bbox, ...patch };
  await storage.upsertAppSetting("motion_bbox", JSON.stringify(_bbox));
}

// ── State ────────────────────────────────────────────────────────────────────

let _enabled = false;
let _timer: ReturnType<typeof setInterval> | null = null;
let _userStates = new Map<string, UserMotionState>();
let _nicknames = new Map<string, string>();
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

/**
 * Compute how many ramp cycles to use for a transition into `slot`.
 * The ramp is capped so it cannot consume more than the slot's full duration.
 */
function rampCycles(slot: Slot): number {
  const maxFromSlot = Math.floor(slot.durationMs / MOTION_CRON_INTERVAL_MS);
  const desired = randInt(3, 5);
  return Math.max(1, Math.min(desired, maxFromSlot));
}

/**
 * Assign a fresh speed profile, heading, and speed to a user entering a new drive slot.
 * Starts a ramp-in so the rider accelerates from rest up to cruising speed.
 */
function assignFreshDriveParams(state: UserMotionState, driveSlot: Slot): void {
  state.speedProfile = pickSpeedProfile();
  state.headingRad = randHeading();
  state.offsetLat = 0;
  state.offsetLng = 0;
  // The ramp-in target is the full cruising speed; actual speed starts at 0
  state.targetSpeedKph  = randSpeedForProfile(state.speedProfile);
  state.currentSpeedKph = 0;
  // Begin ramp-in transition
  const cycles = rampCycles(driveSlot);
  state.transitionPhase      = "ramp-in";
  state.transitionTotalCycles = cycles;
  state.transitionCyclesLeft  = cycles;
  state.rampStartSpeedKph    = 0;
}

/**
 * Advance currentSpeedKph one step toward targetSpeedKph, capped by
 * the profile's accelKphPerCycle.  When close to target, pick a new target.
 * Exported for unit testing.
 */
export function stepSpeed(state: UserMotionState): void {
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
 * Exported for unit testing.
 *
 * Distance is derived from currentSpeedKph × cycle interval, converting
 * km/h → km/cycle → degrees via the local scale factors.
 * City and mountain profiles use a randomised heading each cycle (winding
 * roads).  Highway uses the fixed slot heading (straight corridor).
 *
 * Longitude degrees shrink toward the poles: 1° lng ≈ 111.32 × cos(lat) km.
 *
 * When the bounding box is enabled the position is clamped to it and the
 * heading is reflected so the user bounces back instead of escaping the box.
 * The returned `headingUsed` incorporates any reflection so fixed-heading
 * (highway) riders persist the corrected bearing on the next cycle.
 *
 * NOTE: the caller is responsible for updating state.currentSpeedKph
 * (via stepSpeed or ramp logic) before invoking this function.
 */
export function applyDelta(
  lat: number,
  lng: number,
  state: UserMotionState,
): { lat: number; lng: number; headingUsed: number } {
  const cfg = SPEED_PROFILES[state.speedProfile];
  const intervalSeconds = MOTION_CRON_INTERVAL_MS / 1000;

  // Physical distance covered this cycle (km)
  const distKm = (state.currentSpeedKph / 3600) * intervalSeconds;

  // Heading: highways keep a fixed bearing, city/mountain wind randomly
  let effectiveHeading = cfg.fixedHeading ? state.headingRad : randHeading();

  // Convert km → degrees (latitude is uniform; longitude depends on lat)
  const latRad = (lat * Math.PI) / 180;
  const kmPerLngDeg = KM_PER_LAT_DEG * Math.cos(latRad);

  const dlat = (distKm * Math.cos(effectiveHeading)) / KM_PER_LAT_DEG;
  const dlng = (distKm * Math.sin(effectiveHeading)) / (kmPerLngDeg || 1);

  let newLat = lat + dlat;
  let newLng = lng + dlng;

  if (_bbox.enabled) {
    // Clamp latitude; if we hit a lat boundary reflect the lat component
    // of the heading (flip across the horizontal axis: θ → -θ).
    if (newLat < _bbox.latMin || newLat > _bbox.latMax) {
      newLat = Math.max(_bbox.latMin, Math.min(_bbox.latMax, newLat));
      effectiveHeading = -effectiveHeading;
    }
    // Clamp longitude; if we hit a lng boundary reflect the lng component
    // of the heading (flip across the vertical axis: θ → π - θ).
    if (newLng < _bbox.lngMin || newLng > _bbox.lngMax) {
      newLng = Math.max(_bbox.lngMin, Math.min(_bbox.lngMax, newLng));
      effectiveHeading = Math.PI - effectiveHeading;
    }
  } else {
    // Global wrap-around fallback
    newLat = Math.max(-85, Math.min(85, newLat));
    newLng = ((newLng + 180) % 360 + 360) % 360 - 180;
  }

  return { lat: newLat, lng: newLng, headingUsed: effectiveHeading };
}

// ── Initialization ───────────────────────────────────────────────────────────

async function loadFakeUsers(): Promise<void> {
  const rows = await db
    .select({
      id: users.id,
      nickname: users.nickname,
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
  const newNicknames = new Map<string, string>();

  for (const row of rows) {
    if (row.nickname) newNicknames.set(row.id, row.nickname);
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
      transitionPhase: null,
      transitionCyclesLeft: 0,
      transitionTotalCycles: 0,
      rampStartSpeedKph: 0,
    });
  }

  _userStates = newStates;
  _nicknames = newNicknames;

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
      const prevSlot = state.schedule[state.currentSlotIdx];
      state.currentSlotIdx = newIdx;
      const newSlot = state.schedule[newIdx];

      if (newSlot.kind === "drive") {
        // Entering a new drive slot — assign fresh speed/heading and start ramp-in
        assignFreshDriveParams(state, newSlot);
        newDriveUsers.push(state);
      } else if (newSlot.kind === "rest" && prevSlot?.kind === "drive") {
        // Leaving a drive slot → entering rest: start deceleration ramp-out
        const cycles = rampCycles(newSlot);
        state.transitionPhase       = "ramp-out";
        state.transitionTotalCycles  = cycles;
        state.transitionCyclesLeft   = cycles;
        state.rampStartSpeedKph     = state.currentSpeedKph;
      }
    }
  }

  // Step 2: form convoys ONLY among users entering a new drive slot this cycle
  if (newDriveUsers.length >= 2) {
    formConvoysForNewSlot(newDriveUsers);
  }

  // Step 3: compute and apply physics-based deltas for moving users.
  //
  // A user moves if they are:
  //   a) in a drive slot (normal cruise or ramp-in acceleration), or
  //   b) in a rest slot but still in ramp-out (decelerating to a stop).
  const movingIds: string[] = [];
  const updates: Array<{ userId: string; lat: number; lng: number }> = [];

  for (const state of _userStates.values()) {
    const slot = state.schedule[state.currentSlotIdx];
    if (!slot) continue;

    if (slot.kind === "drive") {
      if (state.transitionPhase === "ramp-in") {
        // Accelerate linearly from 0 to targetSpeedKph over transitionTotalCycles
        const cyclesDone = state.transitionTotalCycles - state.transitionCyclesLeft + 1;
        state.currentSpeedKph = state.targetSpeedKph * (cyclesDone / state.transitionTotalCycles);
        state.transitionCyclesLeft--;
        if (state.transitionCyclesLeft <= 0) {
          state.transitionPhase = null;
          state.currentSpeedKph = state.targetSpeedKph;
        }
      } else {
        // Normal cruise: smooth speed variation within the profile
        stepSpeed(state);
      }
    } else if (slot.kind === "rest") {
      if (state.transitionPhase === "ramp-out") {
        // Decelerate linearly from rampStartSpeedKph to 0 over transitionTotalCycles
        state.currentSpeedKph =
          state.rampStartSpeedKph * (state.transitionCyclesLeft / state.transitionTotalCycles);
        state.transitionCyclesLeft--;
        if (state.transitionCyclesLeft <= 0) {
          state.transitionPhase = null;
          state.currentSpeedKph = 0;
        }
      } else {
        // Fully at rest — no movement
        continue;
      }
    } else {
      continue;
    }

    const effectiveLat = state.lat + state.offsetLat;
    const effectiveLng = state.lng + state.offsetLng;
    const { lat, lng, headingUsed } = applyDelta(effectiveLat, effectiveLng, state);

    // Move the base position (without offset) so future cycles are coherent.
    // For highway riders (fixedHeading), persist the (possibly reflected)
    // heading so they bounce back from the bounding box boundary correctly.
    state.lat = lat - state.offsetLat;
    state.lng = lng - state.offsetLng;
    if (SPEED_PROFILES[state.speedProfile].fixedHeading) {
      state.headingRad = headingUsed;
    }

    movingIds.push(state.userId);
    updates.push({ userId: state.userId, lat, lng });
  }

  if (updates.length === 0) {
    _lastCycleAt = new Date();
    _totalCycles++;
    return;
  }

  // Step 4: batch-update coordinates in DB using a single VALUES query per chunk.
  // This replaces N individual UPDATEs with one UPDATE … FROM (VALUES …) statement,
  // reducing round-trips from O(N) to O(N/CHUNK).
  const CHUNK = 500;
  const now = new Date();

  for (let i = 0; i < updates.length; i += CHUNK) {
    const batch = updates.slice(i, i + CHUNK);
    const valuesSql = sql.join(
      batch.map(({ userId, lat, lng }) => sql`(${userId}::uuid, ${lat}::float8, ${lng}::float8)`),
      sql`, `,
    );
    await db.execute(sql`
      UPDATE user_profiles AS up
      SET latitude = v.lat,
          longitude = v.lng,
          coordinates_updated_at = ${now}
      FROM (VALUES ${valuesSql}) AS v(user_id, lat, lng)
      WHERE up.user_id = v.user_id
    `);
  }

  // Step 5: single UPDATE for all moving users' lastLoginAt (heartbeat)
  if (movingIds.length > 0) {
    for (let i = 0; i < movingIds.length; i += CHUNK) {
      const chunk = movingIds.slice(i, i + CHUNK);
      await db
        .update(users)
        .set({ lastLoginAt: now })
        .where(and(eq(users.isFake, true), inArray(users.id, chunk)));
    }
  }

  _lastCycleAt = new Date();
  _totalCycles++;
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function startMotionSimulator(): Promise<void> {
  const setting = await storage.getAppSetting("fake_motion_enabled");
  _enabled = setting?.value === "true";

  const bboxSetting = await storage.getAppSetting("motion_bbox");
  if (bboxSetting?.value) {
    try {
      _bbox = { ...DEFAULT_BBOX, ...JSON.parse(bboxSetting.value) };
    } catch {
      _bbox = { ...DEFAULT_BBOX };
    }
  }

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

/**
 * Returns a per-user speed snapshot for all currently-moving fake users.
 * Used by the nearby users API to enrich map markers with live telemetry.
 */
export function getUserSpeedMap(): Map<string, { currentSpeedKph: number; speedProfile: SpeedProfile }> {
  const result = new Map<string, { currentSpeedKph: number; speedProfile: SpeedProfile }>();
  if (!_enabled) return result;
  for (const [userId, s] of _userStates.entries()) {
    const slot = s.schedule[s.currentSlotIdx];
    if (slot && slot.kind === "drive") {
      result.set(userId, {
        currentSpeedKph: Math.round(s.currentSpeedKph),
        speedProfile: s.speedProfile,
      });
    }
  }
  return result;
}

export function getMotionStatus() {
  let movingCount = 0;
  let convoiRiders = 0;
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
        // Convoy members have non-zero position offsets set by formConvoysForNewSlot
        if (s.offsetLat !== 0 || s.offsetLng !== 0) convoiRiders++;
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
    convoiRiders,
  };
}

export function stopMotionSimulator(): void {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
  }
}

/**
 * Remove a single fake user from the in-memory simulator state.
 * Call this after deleting a user from the DB so the next cycle
 * does not try to update a non-existent row.
 */
export function removeUserFromSimulator(userId: string): void {
  _userStates.delete(userId);
  _nicknames.delete(userId);
}

/**
 * Clear ALL fake users from the in-memory simulator state.
 * Call this after a mass-delete so the cycle does not update
 * non-existent rows.
 */
export function clearSimulatorUsers(): void {
  _userStates.clear();
  _nicknames.clear();
}

/**
 * Add a single fake user to the in-memory simulator state immediately.
 * Call this right after inserting a new fake user in the DB so it starts
 * moving without requiring a server restart or motion toggle cycle.
 * No-op if the user is already tracked.
 */
export function addUserToSimulator(
  userId: string,
  nickname: string | null,
  lat: number,
  lng: number,
): void {
  if (_userStates.has(userId)) return;

  const nowMs = Date.now();
  const initProfile = pickSpeedProfile();
  const schedule = generateSchedule();
  const scheduleStartMs = nowMs - rand(0, 24 * 60 * 60 * 1000);
  const state: UserMotionState = {
    userId,
    lat,
    lng,
    schedule,
    scheduleStartMs,
    currentSlotIdx: 0,
    speedProfile: initProfile,
    currentSpeedKph: randSpeedForProfile(initProfile),
    targetSpeedKph: randSpeedForProfile(initProfile),
    headingRad: randHeading(),
    offsetLat: 0,
    offsetLng: 0,
    transitionPhase: null,
    transitionCyclesLeft: 0,
    transitionTotalCycles: 0,
    rampStartSpeedKph: 0,
  };
  state.currentSlotIdx = resolveSlotIdx(state, nowMs);
  _userStates.set(userId, state);
  if (nickname) _nicknames.set(userId, nickname);

  // Start the cron if the simulator is enabled but was previously idle (0 users)
  if (_enabled && !_timer) {
    _timer = setInterval(runCycle, MOTION_CRON_INTERVAL_MS);
    console.log("[MOTION] Cron started after addUserToSimulator (first user)");
  }
}

/**
 * Incrementally sync the in-memory simulator state with the DB.
 * Queries all fake users and adds only those NOT already tracked.
 * Existing user states are left untouched (positions/schedules preserved).
 * Call this after a mass-seed completes so newly created users start moving
 * without a server restart.
 */
export async function reloadSimulatorUsers(): Promise<void> {
  const rows = await db
    .select({
      id: users.id,
      nickname: users.nickname,
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

  if (rows.length === 0) return;

  const nowMs = Date.now();
  let added = 0;

  for (const row of rows) {
    if (_userStates.has(row.id)) continue; // already tracked — preserve state

    if (row.nickname) _nicknames.set(row.id, row.nickname);
    const lat = row.lat ?? rand(37, 47);
    const lng = row.lng ?? rand(7, 18);
    const schedule = generateSchedule();
    const scheduleStartMs = nowMs - rand(0, 24 * 60 * 60 * 1000);
    const initProfile = pickSpeedProfile();
    const state: UserMotionState = {
      userId: row.id,
      lat,
      lng,
      schedule,
      scheduleStartMs,
      currentSlotIdx: 0,
      speedProfile: initProfile,
      currentSpeedKph: randSpeedForProfile(initProfile),
      targetSpeedKph: randSpeedForProfile(initProfile),
      headingRad: randHeading(),
      offsetLat: 0,
      offsetLng: 0,
      transitionPhase: null,
      transitionCyclesLeft: 0,
      transitionTotalCycles: 0,
      rampStartSpeedKph: 0,
    };
    state.currentSlotIdx = resolveSlotIdx(state, nowMs);
    _userStates.set(row.id, state);
    added++;
  }

  if (added > 0) {
    console.log(`[MOTION] reloadSimulatorUsers: +${added} new users (total: ${_userStates.size})`);
    // Start the cron if enabled but previously idle (had 0 users)
    if (_enabled && !_timer) {
      _timer = setInterval(runCycle, MOTION_CRON_INTERVAL_MS);
      console.log("[MOTION] Cron started after reloadSimulatorUsers");
    }
  }
}

export interface RiderPosition {
  userId: string;
  nickname: string | null;
  lat: number;
  lng: number;
  isMoving: boolean;
  currentSpeedKph: number | null;
  speedProfile: SpeedProfile | null;
}

export function getPositions(): RiderPosition[] {
  const nowMs = Date.now();
  const out: RiderPosition[] = [];
  for (const state of _userStates.values()) {
    const slotIdx = resolveSlotIdx(state, nowMs);
    const slot = state.schedule[slotIdx];
    const isMoving = _enabled && !!slot && slot.kind === "drive";
    out.push({
      userId: state.userId,
      nickname: _nicknames.get(state.userId) ?? null,
      lat: state.lat + state.offsetLat,
      lng: state.lng + state.offsetLng,
      isMoving,
      currentSpeedKph: isMoving ? Math.round(state.currentSpeedKph) : null,
      speedProfile: isMoving ? state.speedProfile : null,
    });
  }
  return out;
}
