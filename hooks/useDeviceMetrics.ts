import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus, Platform } from "react-native";
import * as Battery from "expo-battery";
import * as Device from "expo-device";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiRequest } from "@/lib/query-client";
import { useAuth } from "@/lib/auth-context";

let _getUsedMemory: (() => Promise<number>) | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const DeviceInfo = require("react-native-device-info");
  if (typeof DeviceInfo?.getUsedMemory === "function") {
    _getUsedMemory = DeviceInfo.getUsedMemory as () => Promise<number>;
  }
} catch {
  // native module not linked in this build — fall back to JS heap
}

const LAST_MOUNT_KEY = "@bikerlink/last_mount_ts";
const CLEAN_SHUTDOWN_KEY = "@bikerlink/clean_shutdown";
const ABNORMAL_RESTARTS_KEY = "@bikerlink/abnormal_restarts";
const REPORT_INTERVAL_MS = 60_000;
const SESSION_ID = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

async function checkRestartLoop(): Promise<void> {
  try {
    const now = Date.now();
    const [lastMountStr, cleanShutdown] = await Promise.all([
      AsyncStorage.getItem(LAST_MOUNT_KEY),
      AsyncStorage.getItem(CLEAN_SHUTDOWN_KEY),
    ]);

    const lastMount = lastMountStr ? parseInt(lastMountStr, 10) : null;
    const isRestartLoop =
      lastMount != null &&
      now - lastMount < 30_000 &&
      cleanShutdown !== "true";

    if (isRestartLoop) {
      const prevStr = await AsyncStorage.getItem(ABNORMAL_RESTARTS_KEY);
      const prev = prevStr ? parseInt(prevStr, 10) : 0;
      await AsyncStorage.setItem(ABNORMAL_RESTARTS_KEY, String(prev + 1));
    }

    await Promise.all([
      AsyncStorage.setItem(LAST_MOUNT_KEY, String(now)),
      AsyncStorage.removeItem(CLEAN_SHUTDOWN_KEY),
    ]);
  } catch {
    // non-fatal
  }
}

async function sendMetrics(userId: string): Promise<void> {
  try {
    const platform = Platform.OS === "ios" ? "ios" : Platform.OS === "android" ? "android" : "web";

    let batteryLevel: number | null = null;
    let batteryState: string | null = null;

    if (Platform.OS !== "web") {
      try {
        const [level, state] = await Promise.all([
          Battery.getBatteryLevelAsync(),
          Battery.getBatteryStateAsync(),
        ]);
        batteryLevel = Math.round(level * 100);
        const stateMap: Record<Battery.BatteryState, string> = {
          [Battery.BatteryState.CHARGING]: "charging",
          [Battery.BatteryState.FULL]: "full",
          [Battery.BatteryState.UNPLUGGED]: "unplugged",
          [Battery.BatteryState.UNKNOWN]: "unknown",
          [Battery.BatteryState.NOT_CHARGING]: "not_charging",
        };
        batteryState = stateMap[state] ?? "unknown";
      } catch {
        // expo-battery not available
      }
    }

    const totalMemoryMb = Device.totalMemory != null
      ? Math.round(Device.totalMemory / 1024 / 1024)
      : null;

    let memoryUsedMb: number | null = null;

    // Tier 1: native process RSS via react-native-device-info
    if (Platform.OS !== "web" && _getUsedMemory) {
      try {
        const rssBytes = await _getUsedMemory();
        if (typeof rssBytes === "number" && rssBytes > 0) {
          memoryUsedMb = Math.round(rssBytes / 1024 / 1024);
        }
      } catch {
        // native module unavailable at runtime — proceed to Hermes fallback
      }
    }

    // Tier 2: Hermes JS-engine heap (Expo Go / older APKs without native module)
    if (memoryUsedMb === null && Platform.OS !== "web") {
      try {
        type HermesGlobal = {
          HermesInternal?: {
            getInstrumentedStats?: () => Record<string, number>;
          };
        };
        const stats = (globalThis as unknown as HermesGlobal)
          .HermesInternal?.getInstrumentedStats?.();
        const allocBytes = stats?.hermes_allocatedBytes;
        if (typeof allocBytes === "number" && allocBytes > 0) {
          memoryUsedMb = Math.round(allocBytes / 1024 / 1024);
        }
      } catch {
        // Hermes API unavailable
      }
    }

    // Tier 3: web performance.memory
    if (memoryUsedMb === null && Platform.OS === "web") {
      try {
        type PerfWithMemory = typeof performance & {
          memory?: { usedJSHeapSize?: number };
        };
        const heapBytes = (performance as PerfWithMemory).memory?.usedJSHeapSize;
        if (typeof heapBytes === "number" && heapBytes > 0) {
          memoryUsedMb = Math.round(heapBytes / 1024 / 1024);
        }
      } catch {
        // performance.memory unavailable
      }
    }

    const abnormalRestartsStr = await AsyncStorage.getItem(ABNORMAL_RESTARTS_KEY).catch(() => null);
    const abnormalRestarts = abnormalRestartsStr ? parseInt(abnormalRestartsStr, 10) : 0;

    if (abnormalRestarts > 0) {
      AsyncStorage.setItem(ABNORMAL_RESTARTS_KEY, "0").catch(() => {});
    }

    await apiRequest("POST", "/api/metrics/device", {
      sessionId: SESSION_ID,
      platform,
      memoryUsedMb,
      memoryTotalMb: totalMemoryMb,
      batteryLevel,
      batteryState,
      appUptimeSeconds: Math.floor(
        (Date.now() - parseInt(SESSION_ID.split("-")[0], 10)) / 1000
      ),
      abnormalRestarts,
    });
  } catch {
    // non-fatal
  }
}

export function useDeviceMetrics(tokenReady = false): void {
  const { user } = useAuth();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const userIdRef = useRef<string | null>(null);

  useEffect(() => {
    userIdRef.current = user?.id ?? null;
  }, [user?.id]);

  useEffect(() => {
    checkRestartLoop().catch(() => {});

    const appStateSub = AppState.addEventListener("change", (nextState: AppStateStatus) => {
      if (nextState === "background" || nextState === "inactive") {
        AsyncStorage.setItem(CLEAN_SHUTDOWN_KEY, "true").catch(() => {});
      }
      appStateRef.current = nextState;
    });

    return () => {
      appStateSub.remove();
    };
  }, []);

  useEffect(() => {
    if (!tokenReady || !user?.id) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    sendMetrics(user.id).catch(() => {});

    intervalRef.current = setInterval(() => {
      if (
        appStateRef.current === "active" &&
        userIdRef.current
      ) {
        sendMetrics(userIdRef.current).catch(() => {});
      }
    }, REPORT_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [user?.id, tokenReady]);
}
