import { storage } from "./storage";
import {
  setMotionEnabled,
  startMotionSimulator,
  isMotionEnabled,
} from "./motion-simulator";
import {
  startFakeZavorrineRotation,
  stopFakeZavorrineRotation,
} from "./matching/scheduler.helpers";

/**
 * Unified "attività stregatti" controller.
 *
 * Motion GPS simulation and fake-availability rotation are ONE conceptual
 * function controlled by a single source of truth in app_settings:
 * `fake_motion_enabled`. This module is the only place that starts/stops
 * both timers together, so the toggle works without a server restart and
 * leaves no ghost interval behind on disable.
 *
 * `fake_users_enabled` is the separate master "Visibilità Globale" switch.
 * When it is OFF, activity is forced OFF and cannot be re-enabled.
 */

/** Master visibility switch. Absent setting = ON (master default). */
export async function isGlobalVisibilityOn(): Promise<boolean> {
  const s = await storage.getAppSetting("fake_users_enabled");
  return s?.value !== "false";
}

/**
 * Enable/disable the unified activity (motion + availability rotation).
 * Persists `fake_motion_enabled` (via setMotionEnabled) and starts/stops
 * both the motion cron and the rotation interval in lockstep.
 *
 * Returns the effective enabled state (false when blocked by global OFF).
 */
export async function setFakeActivityEnabled(enabled: boolean): Promise<boolean> {
  // Cascade guard: cannot turn activity ON while global visibility is OFF.
  const effective = enabled && (await isGlobalVisibilityOn());

  await setMotionEnabled(effective);
  if (effective) {
    startFakeZavorrineRotation();
  } else {
    stopFakeZavorrineRotation();
  }
  return effective;
}

/**
 * Boot init: start the motion simulator (reads `fake_motion_enabled`) and,
 * only when activity is ON *and* global visibility is ON, start the rotation.
 * Absent settings → everything stays OFF (no implicit "on").
 */
export async function initFakeActivityOnBoot(): Promise<void> {
  await startMotionSimulator();
  const visible = await isGlobalVisibilityOn();
  if (!visible) {
    // Cascade invariant at boot: sub-options cannot remain active while global
    // visibility is OFF. Force activity OFF even if a stale `fake_motion_enabled`
    // is true in the DB, so no motion cron / rotation leaks past a global-OFF state.
    if (isMotionEnabled()) {
      await setMotionEnabled(false);
    }
    stopFakeZavorrineRotation();
    return;
  }
  if (isMotionEnabled()) {
    startFakeZavorrineRotation();
  }
}

/**
 * Cascade applied when "Visibilità Globale" is switched OFF: force every
 * sub-option OFF (unified activity + chatbot) and tear down their timers.
 */
export async function cascadeGlobalVisibilityOff(): Promise<void> {
  await setMotionEnabled(false);
  stopFakeZavorrineRotation();
  await storage.upsertAppSetting("chatbot_enabled", "false");
}
