// LARGE-FILE-LOCKED — limite: 936 righe (attuali: 936)
// Aggiungi nuove funzionalità in: server/motion-simulator-extra.ts
// Motivo: file delicato di dimensione media. Splittare ora introduce rischio.
//         Vedi Task #2584 (regola 600 righe) e Task "Lock dimensione file priorità media".

/**
 * motion-simulator.ts
 * GPS motion simulator for fake users (Stregatti).
 */

import { db } from "./db";
import { users, userProfiles } from "@shared/db";
import { eq, and, sql, inArray } from "drizzle-orm";
import { storage } from "./storage";
import { systemAccountConditions } from "./lib/system-account-filter";

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

export const MOTION_CRON_INTERVAL_MS = 30_000;

/** Metres per degree of latitude (constant). */
const KM_PER_LAT_DEG = 111.32;

// ── Helpers ──────────────────────────────────────────────────────────────────

export function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export function randInt(min: number, max: number): number {
  return Math.floor(rand(min, max + 1));
}

export function allocateBoundedSlots(total: number, n: number, minMs: number, maxMs: number): number[] {
  const out: number[] = [];
  let remaining = total;
  for (let i = 0; i < n; i++) {
    const slotsLeft = n - i;
    const lo = Math.max(minMs, remaining - (slotsLeft - 1) * maxMs);
    const hi = Math.min(maxMs, remaining - (slotsLeft - 1) * minMs);
    const dur = rand(lo, hi);
    out.push(dur);
    remaining -= dur;
  }
  return out;
}

export function generateSchedule(): Slot[] {
  const DRIVE_TOTAL = 18 * 60 * 60 * 1000;
  const REST_TOTAL  =  6 * 60 * 60 * 1000;
  const DRIVE_MIN   = 30 * 60 * 1000;
  const DRIVE_MAX   =  3 * 60 * 60 * 1000;
  const REST_MIN    = 15 * 60 * 1000;
  const REST_MAX    = 90 * 60 * 1000;

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

export function resolveSlotIdx(state: UserMotionState, nowMs: number): number {
  const totalMs = state.schedule.reduce((s, sl) => s + sl.durationMs, 0);
  const elapsed = (nowMs - state.scheduleStartMs) % totalMs;
  let acc = 0;
  for (let i = 0; i < state.schedule.length; i++) {
    acc += state.schedule[i].durationMs;
    if (elapsed < acc) return i;
  }
  return state.schedule.length - 1;
}

export function randHeading(): number {
  return Math.random() * 2 * Math.PI;
}

export function pickSpeedProfile(): SpeedProfile {
  const r = Math.random();
  let cumulative = 0;
  for (const { profile, weight } of PROFILE_WEIGHTS) {
    cumulative += weight;
    if (r < cumulative) return profile;
  }
  return "city";
}

export function randSpeedForProfile(profile: SpeedProfile): number {
  const cfg = SPEED_PROFILES[profile];
  return rand(cfg.minKph, cfg.maxKph);
}

export function rampCycles(slot: Slot): number {
  const maxFromSlot = Math.floor(slot.durationMs / MOTION_CRON_INTERVAL_MS);
  const desired = randInt(3, 5);
  return Math.max(1, Math.min(desired, maxFromSlot));
}

export function assignFreshDriveParams(state: UserMotionState, driveSlot: Slot): void {
  state.speedProfile = pickSpeedProfile();
  state.headingRad = randHeading();
  state.offsetLat = 0;
  state.offsetLng = 0;
  state.targetSpeedKph  = randSpeedForProfile(state.speedProfile);
  state.currentSpeedKph = 0;
  const cycles = rampCycles(driveSlot);
  state.transitionPhase      = "ramp-in";
  state.transitionTotalCycles = cycles;
  state.transitionCyclesLeft  = cycles;
  state.rampStartSpeedKph    = 0;
}

export function stepSpeed(state: UserMotionState): void {
  const cfg = SPEED_PROFILES[state.speedProfile];
  const diff = state.targetSpeedKph - state.currentSpeedKph;
  const step = Math.min(Math.abs(diff), cfg.accelKphPerCycle) * Math.sign(diff);
  state.currentSpeedKph = Math.max(cfg.minKph, Math.min(cfg.maxKph, state.currentSpeedKph + step));
  if (Math.abs(state.targetSpeedKph - state.currentSpeedKph) < 2) {
    state.targetSpeedKph = randSpeedForProfile(state.speedProfile);
  }
}

export function formConvoysForNewSlot(newDriveUsers: UserMotionState[]): void {
  const GROUP_SIZES = [5, 10, 20];
  const GROUP_FRACTION = 0.35;
  const candidates = [...newDriveUsers].sort(() => Math.random() - 0.5);
  const poolSize = Math.floor(candidates.length * GROUP_FRACTION);
  let idx = 0;
  while (idx < poolSize) {
    const size = GROUP_SIZES[randInt(0, GROUP_SIZES.length - 1)];
    const members = candidates.slice(idx, idx + size);
    if (members.length < size) break;
    const leader = members[0];
    const groupProfile: SpeedProfile = leader.speedProfile;
    const groupHeading = leader.headingRad;
    const anchorLat = leader.lat;
    const anchorLng = leader.lng;
    for (const m of members) {
      m.speedProfile = groupProfile;
      m.headingRad = groupHeading;
      m.currentSpeedKph = randSpeedForProfile(groupProfile);
      m.targetSpeedKph  = randSpeedForProfile(groupProfile);
      m.offsetLat = rand(-0.001, 0.001);
      m.offsetLng = rand(-0.001, 0.001);
      m.lat = anchorLat;
      m.lng = anchorLng;
    }
    idx += size;
  }
}

export function applyDelta(lat: number, lng: number, state: UserMotionState): { lat: number; lng: number; headingUsed: number } {
  const cfg = SPEED_PROFILES[state.speedProfile];
  const intervalSeconds = MOTION_CRON_INTERVAL_MS / 1000;
  const distKm = (state.currentSpeedKph / 3600) * intervalSeconds;
  let effectiveHeading = cfg.fixedHeading ? state.headingRad : randHeading();
  const latRad = (lat * Math.PI) / 180;
  const kmPerLngDeg = KM_PER_LAT_DEG * Math.cos(latRad);
  const dlat = (distKm * Math.cos(effectiveHeading)) / KM_PER_LAT_DEG;
  const dlng = (distKm * Math.sin(effectiveHeading)) / (kmPerLngDeg || 1);
  let newLat = lat + dlat;
  let newLng = lng + dlng;
  if (_bbox.enabled) {
    if (newLat < _bbox.latMin || newLat > _bbox.latMax) {
      newLat = Math.max(_bbox.latMin, Math.min(_bbox.latMax, newLat));
      effectiveHeading = -effectiveHeading;
    }
    if (newLng < _bbox.lngMin || newLng > _bbox.lngMax) {
      newLng = Math.max(_bbox.lngMin, Math.min(_bbox.lngMax, newLng));
      effectiveHeading = Math.PI - effectiveHeading;
    }
  } else {
    newLat = Math.max(-85, Math.min(85, newLat));
    newLng = ((newLng + 180) % 360 + 360) % 360 - 180;
  }
  return { lat: newLat, lng: newLng, headingUsed: effectiveHeading };
}

// ── Part 2 exports ───────────────────────────────────────────────────────────

export async function loadFakeUsers() {
  const { loadFakeUsers } = await import("./motion-simulator.part2");
  return loadFakeUsers();
}

export async function runCycle() {
  const { runCycle } = await import("./motion-simulator.part2");
  return runCycle();
}

export async function startMotionSimulator() {
  const { setMotionEnabled, loadFakeUsers: load } = await import("./motion-simulator.part2");
  const setting = await storage.getAppSetting("fake_motion_enabled");
  const enabled = setting?.value === "true";
  
  const bboxSetting = await storage.getAppSetting("motion_bbox");
  if (bboxSetting?.value) {
    try {
      _bbox = { ...DEFAULT_BBOX, ...JSON.parse(bboxSetting.value) };
    } catch {
      _bbox = { ...DEFAULT_BBOX };
    }
  }

  setMotionEnabled(enabled);
  await load();
  // Part 2 should probably handle the interval to keep it consistent
  // but for now keeping it here as a minimal bridge
}

export async function setMotionEnabled(enabled: boolean) {
  const { setMotionEnabled } = await import("./motion-simulator.part2");
  await storage.upsertAppSetting("fake_motion_enabled", enabled ? "true" : "false");
  setMotionEnabled(enabled);
}

export function getUserSpeedMap() {
  const { getMotionStates } = require("./motion-simulator.part2");
  const { _userStates } = getMotionStates();
  const result = new Map<string, { currentSpeedKph: number; speedProfile: SpeedProfile }>();
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

export function isMotionEnabled(): boolean {
  const { isMotionEnabled: _isEnabled } = require("./motion-simulator.part2") as { isMotionEnabled: () => boolean };
  return _isEnabled();
}

export function getMotionStatus() {
  const { getMotionStates, getMotionStats } = require("./motion-simulator.part2");
  const { _userStates } = getMotionStates();
  const { _lastCycleAt, _totalCycles, _lastCycleDurationMs } = getMotionStats();
  
  let movingCount = 0;
  let convoiRiders = 0;
  const profileCounts: Record<SpeedProfile, number> = { city: 0, highway: 0, mountain: 0 };
  let speedSum = 0;
  let speedCount = 0;

  for (const s of _userStates.values()) {
    const slot = s.schedule[s.currentSlotIdx];
    if (slot && slot.kind === "drive") {
      movingCount++;
      profileCounts[(s as UserMotionState).speedProfile]++;
      speedSum += s.currentSpeedKph;
      speedCount++;
      if (s.offsetLat !== 0 || s.offsetLng !== 0) convoiRiders++;
    }
  }

  return {
    totalFakeUsers: _userStates.size,
    movingNow: movingCount,
    lastCycleAt: _lastCycleAt?.toISOString() ?? null,
    totalCycles: _totalCycles,
    lastCycleDurationMs: _lastCycleDurationMs,
    speedDistribution: profileCounts,
    averageSpeedKph: speedCount > 0 ? Math.round(speedSum / speedCount) : 0,
    convoiRiders,
  };
}

export function removeUserFromSimulator(userId: string) {
  const { getMotionStates } = require("./motion-simulator.part2");
  getMotionStates()._userStates.delete(userId);
  getMotionStates()._nicknames.delete(userId);
}

export function clearSimulatorUsers() {
  const { getMotionStates } = require("./motion-simulator.part2");
  getMotionStates()._userStates.clear();
  getMotionStates()._nicknames.clear();
}

export function addUserToSimulator(userId: string, nickname: string | null, lat: number, lng: number) {
  const { getMotionStates } = require("./motion-simulator.part2");
  const { _userStates, _nicknames } = getMotionStates();
  if (_userStates.has(userId)) return;

  const nowMs = Date.now();
  const initProfile = pickSpeedProfile();
  const schedule = generateSchedule();
  const scheduleStartMs = nowMs - rand(0, 24 * 60 * 60 * 1000);
  const state: UserMotionState = {
    userId, lat, lng, schedule, scheduleStartMs,
    currentSlotIdx: 0, speedProfile: initProfile,
    currentSpeedKph: randSpeedForProfile(initProfile),
    targetSpeedKph: randSpeedForProfile(initProfile),
    headingRad: randHeading(),
    offsetLat: 0, offsetLng: 0, transitionPhase: null,
    transitionCyclesLeft: 0, transitionTotalCycles: 0, rampStartSpeedKph: 0,
  };
  state.currentSlotIdx = resolveSlotIdx(state, nowMs);
  _userStates.set(userId, state);
  if (nickname) _nicknames.set(userId, nickname);
}

export async function reloadSimulatorUsers() {
  const { loadFakeUsers } = await import("./motion-simulator.part2");
  return loadFakeUsers();
}

export function getPositions() {
  const { getMotionStates } = require("./motion-simulator.part2");
  const { _userStates, _nicknames } = getMotionStates();
  const nowMs = Date.now();
  return (Array.from(_userStates.values()) as UserMotionState[]).map((state) => {
    const slotIdx = resolveSlotIdx(state, nowMs);
    const slot = state.schedule[slotIdx];
    const isMoving = !!slot && slot.kind === "drive";
    return {
      userId: state.userId,
      nickname: _nicknames.get(state.userId) ?? null,
      lat: state.lat + state.offsetLat,
      lng: state.lng + state.offsetLng,
      isMoving,
      currentSpeedKph: isMoving ? Math.round(state.currentSpeedKph) : null,
      speedProfile: isMoving ? state.speedProfile : null,
    };
  });
}

export function stopMotionSimulator() {
  // implemented via setMotionEnabled(false) usually
}
