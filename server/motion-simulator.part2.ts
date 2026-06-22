import { db } from "./db";
import { users, userProfiles } from "@shared/db";
import { eq, and, sql } from "drizzle-orm";
import { storage } from "./storage";
import { systemAccountConditions } from "./lib/system-account-filter";
import { 
  UserMotionState, 
  MOTION_CRON_INTERVAL_MS, 
  SPEED_PROFILES, 
  stepSpeed, 
  applyDelta,
  resolveSlotIdx,
  assignFreshDriveParams,
  rampCycles,
  formConvoysForNewSlot,
  pickSpeedProfile,
  generateSchedule,
  rand,
  randSpeedForProfile
} from "./motion-simulator";

let _userStates = new Map<string, UserMotionState>();
let _nicknames = new Map<string, string>();
let _lastCycleAt: Date | null = null;
let _totalCycles = 0;
let _lastCycleDurationMs = 0;
let _enabled = false;

export function setMotionStates(states: Map<string, UserMotionState>, nicknames: Map<string, string>) {
  _userStates = states;
  _nicknames = nicknames;
}

export function getMotionStates() {
  return { _userStates, _nicknames };
}

export function setMotionEnabled(enabled: boolean) {
  _enabled = enabled;
}

export function getMotionStats() {
  return { _lastCycleAt, _totalCycles, _lastCycleDurationMs };
}

export async function loadFakeUsers(): Promise<void> {
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
        ...systemAccountConditions(users),
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
      headingRad: Math.random() * 2 * Math.PI,
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

let _cycleRunning = false;

export async function runCycle(): Promise<void> {
  if (!_enabled || _userStates.size === 0) return;
  if (_cycleRunning) {
    console.warn("[MOTION] Previous cycle still running — skipping this tick");
    return;
  }
  _cycleRunning = true;
  const cycleStart = Date.now();
  try {
    await runCycleInner();
  } finally {
    _lastCycleDurationMs = Date.now() - cycleStart;
    _cycleRunning = false;
  }
}

async function runCycleInner(): Promise<void> {
  const nowMs = Date.now();
  const newDriveUsers: UserMotionState[] = [];

  for (const state of _userStates.values()) {
    const newIdx = resolveSlotIdx(state, nowMs);
    if (newIdx !== state.currentSlotIdx) {
      const prevSlot = state.schedule[state.currentSlotIdx];
      state.currentSlotIdx = newIdx;
      const newSlot = state.schedule[newIdx];

      if (newSlot.kind === "drive") {
        assignFreshDriveParams(state, newSlot);
        newDriveUsers.push(state);
      } else if (newSlot.kind === "rest" && prevSlot?.kind === "drive") {
        const cycles = rampCycles(newSlot);
        state.transitionPhase       = "ramp-out";
        state.transitionTotalCycles  = cycles;
        state.transitionCyclesLeft   = cycles;
        state.rampStartSpeedKph     = state.currentSpeedKph;
      }
    }
  }

  if (newDriveUsers.length >= 2) {
    formConvoysForNewSlot(newDriveUsers);
  }

  const movingIds: string[] = [];
  const updates: Array<{ userId: string; lat: number; lng: number }> = [];

  for (const state of _userStates.values()) {
    const slot = state.schedule[state.currentSlotIdx];
    if (!slot) continue;

    if (slot.kind === "drive") {
      if (state.transitionPhase === "ramp-in") {
        const cyclesDone = state.transitionTotalCycles - state.transitionCyclesLeft + 1;
        state.currentSpeedKph = state.targetSpeedKph * (cyclesDone / state.transitionTotalCycles);
        state.transitionCyclesLeft--;
        if (state.transitionCyclesLeft <= 0) {
          state.transitionPhase = null;
          state.currentSpeedKph = state.targetSpeedKph;
        }
      } else {
        stepSpeed(state);
      }
    } else if (slot.kind === "rest") {
      if (state.transitionPhase === "ramp-out") {
        state.currentSpeedKph =
          state.rampStartSpeedKph * (state.transitionCyclesLeft / state.transitionTotalCycles);
        state.transitionCyclesLeft--;
        if (state.transitionCyclesLeft <= 0) {
          state.transitionPhase = null;
          state.currentSpeedKph = 0;
        }
      } else {
        continue;
      }
    } else {
      continue;
    }

    const effectiveLat = state.lat + state.offsetLat;
    const effectiveLng = state.lng + state.offsetLng;
    const { lat, lng, headingUsed } = applyDelta(effectiveLat, effectiveLng, state);

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

  const CHUNK_SIZE = 100;
  for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
    const chunk = updates.slice(i, i + CHUNK_SIZE);
    const values = chunk.map((u) => sql`(${u.userId}::uuid, ${u.lat}::double precision, ${u.lng}::double precision)`);
    const valuesSql = sql.join(values, sql`, `);

    await db.execute(sql`
      UPDATE user_profiles AS up
      SET
        latitude = v.lat,
        longitude = v.lng,
        coordinates_updated_at = NOW()
      FROM (VALUES ${valuesSql}) AS v(id, lat, lng)
      WHERE up.user_id = v.id
    `);

    await db.execute(sql`
      UPDATE users
      SET last_login_at = NOW()
      WHERE id IN (${sql.join(chunk.map(u => sql`${u.userId}::uuid`), sql`, `)})
    `);
  }

  _lastCycleAt = new Date();
  _totalCycles++;
}
