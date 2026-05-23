/**
 * Tests: motion-simulator schedule generation invariants
 *
 * Imports production helpers directly from motion-simulator.ts so that regressions
 * in the real implementation are caught (not just in a test-only copy).
 *
 * Verifies that generateSchedule() produces schedules where:
 *   1. Every drive slot is in [30 min, 3 h]
 *   2. Every rest  slot is in [15 min, 90 min]
 *   3. Total drive time = exactly 18 h (allocator guarantees this)
 *   4. Total rest  time = exactly  6 h (allocator guarantees this)
 *   5. Slots strictly alternate in kind
 *   6. At least 6 drive slots and 6 rest slots per schedule
 *   7. allocateBoundedSlots never produces a value outside [minMs, maxMs]
 */

import { describe, it, expect } from "vitest";
import { generateSchedule, allocateBoundedSlots } from "../motion-simulator";

const DRIVE_TOTAL = 18 * 60 * 60 * 1000;
const REST_TOTAL  =  6 * 60 * 60 * 1000;
const DRIVE_MIN   = 30 * 60 * 1000;
const DRIVE_MAX   =  3 * 60 * 60 * 1000;
const REST_MIN    = 15 * 60 * 1000;
const REST_MAX    = 90 * 60 * 1000;
const EPSILON_MS  = 1; // floating-point tolerance
const SEEDS       = 500;

describe("motion-simulator: allocateBoundedSlots", () => {
  it("all slots are within [min, max] bounds", () => {
    for (let i = 0; i < SEEDS; i++) {
      const slots = allocateBoundedSlots(DRIVE_TOTAL, 8, DRIVE_MIN, DRIVE_MAX);
      for (const s of slots) {
        expect(s).toBeGreaterThanOrEqual(DRIVE_MIN - EPSILON_MS);
        expect(s).toBeLessThanOrEqual(DRIVE_MAX + EPSILON_MS);
      }
    }
  });

  it("slot values sum to total", () => {
    for (let i = 0; i < SEEDS; i++) {
      const slots = allocateBoundedSlots(REST_TOTAL, 6, REST_MIN, REST_MAX);
      const sum = slots.reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(REST_TOTAL, 0);
    }
  });
});

describe("motion-simulator: generateSchedule invariants", () => {
  it(`drive slots are in [30 min, 3 h] across ${SEEDS} random schedules`, () => {
    for (let i = 0; i < SEEDS; i++) {
      const schedule = generateSchedule();
      for (const slot of schedule) {
        if (slot.kind !== "drive") continue;
        expect(slot.durationMs).toBeGreaterThanOrEqual(DRIVE_MIN - EPSILON_MS);
        expect(slot.durationMs).toBeLessThanOrEqual(DRIVE_MAX + EPSILON_MS);
      }
    }
  });

  it(`rest slots are in [15 min, 90 min] across ${SEEDS} random schedules`, () => {
    for (let i = 0; i < SEEDS; i++) {
      const schedule = generateSchedule();
      for (const slot of schedule) {
        if (slot.kind !== "rest") continue;
        expect(slot.durationMs).toBeGreaterThanOrEqual(REST_MIN - EPSILON_MS);
        expect(slot.durationMs).toBeLessThanOrEqual(REST_MAX + EPSILON_MS);
      }
    }
  });

  it(`total drive time equals 18 h across ${SEEDS} random schedules`, () => {
    for (let i = 0; i < SEEDS; i++) {
      const schedule = generateSchedule();
      const total = schedule
        .filter(s => s.kind === "drive")
        .reduce((sum, s) => sum + s.durationMs, 0);
      expect(total).toBeCloseTo(DRIVE_TOTAL, 0);
    }
  });

  it(`total rest time equals 6 h across ${SEEDS} random schedules`, () => {
    for (let i = 0; i < SEEDS; i++) {
      const schedule = generateSchedule();
      const total = schedule
        .filter(s => s.kind === "rest")
        .reduce((sum, s) => sum + s.durationMs, 0);
      expect(total).toBeCloseTo(REST_TOTAL, 0);
    }
  });

  it(`slots strictly alternate drive/rest across ${SEEDS} random schedules`, () => {
    for (let i = 0; i < SEEDS; i++) {
      const schedule = generateSchedule();
      for (let j = 1; j < schedule.length; j++) {
        expect(schedule[j].kind).not.toBe(schedule[j - 1].kind);
      }
    }
  });

  it(`each schedule has at least 6 drive and 6 rest slots`, () => {
    for (let i = 0; i < SEEDS; i++) {
      const schedule = generateSchedule();
      const nDrive = schedule.filter(s => s.kind === "drive").length;
      const nRest  = schedule.filter(s => s.kind === "rest").length;
      expect(nDrive).toBeGreaterThanOrEqual(6);
      expect(nRest).toBeGreaterThanOrEqual(6);
    }
  });
});
