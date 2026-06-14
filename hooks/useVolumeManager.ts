import { useEffect, useRef, useCallback } from "react";
import { Platform } from "react-native";
import { VolumeManager } from "react-native-volume-manager";
import * as Haptics from "expo-haptics";
import type { Phase } from "@/components/tracking/useTrackingState";

interface UseVolumeManagerOptions {
  phase: Phase;
  onVolumeButton?: () => void;
}

/**
 * Manages the native volume HUD visibility and intercepts hardware volume
 * button presses during active tracking sessions.
 *
 * - During "active" or "paused" phases: adds a listener so volume key presses
 *   trigger `onVolumeButton` with light haptic feedback instead of adjusting volume.
 * - Outside tracking: no listener is active and the native HUD behaves normally.
 * - Web / environments that don't support the native module are guarded silently.
 * - The listener is removed on phase change and on component unmount (no leaks).
 */
export function useVolumeManager({ phase, onVolumeButton }: UseVolumeManagerOptions) {
  // Keep the latest callback in a ref so the listener never goes stale
  // without needing to be re-added.
  const callbackRef = useRef(onVolumeButton);
  useEffect(() => {
    callbackRef.current = onVolumeButton;
  }, [onVolumeButton]);

  // Expose a stable helper for callers that need to toggle the HUD explicitly
  // (e.g. hands-off mode in useTrackingState).
  const setVolumeUI = useCallback((enabled: boolean) => {
    if (Platform.OS === "web") return;
    VolumeManager.showNativeVolumeUI({ enabled }).catch(() => undefined);
  }, []);

  // Add / remove the volume listener based on the current tracking phase.
  useEffect(() => {
    const isTracking = phase === "active" || phase === "paused";

    if (__DEV__) {
      console.log(`[VolumeManager] phase="${phase}" isTracking=${isTracking} platform=${Platform.OS}`);
    }

    if (!isTracking || Platform.OS === "web") return;

    let subscription: { remove: () => void } | null = null;

    try {
      subscription = VolumeManager.addVolumeListener(() => {
        if (__DEV__) {
          console.log("[VolumeManager] volume button pressed — firing onVolumeButton callback");
        }
        const cb = callbackRef.current;
        if (cb) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
          cb();
        }
      });
      if (__DEV__) {
        console.log("[VolumeManager] listener registered (phase active/paused)");
      }
    } catch (e) {
      console.warn("[useVolumeManager] addVolumeListener not supported in this environment:", e);
    }

    return () => {
      if (__DEV__) {
        console.log("[VolumeManager] listener removed (cleanup)");
      }
      subscription?.remove();
    };
  }, [phase]);

  return { setVolumeUI };
}
