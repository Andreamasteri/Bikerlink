import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus, Platform } from "react-native";
import * as Battery from "expo-battery";
import * as Device from "expo-device";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiRequest } from "@/lib/query-client";
import { useAuth } from "@/lib/auth-context";

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

    const abnormalRestartsStr = await AsyncStorage.getItem(ABNORMAL_RESTARTS_KEY).catch(() => null);
    const abnormalRestarts = abnormalRestartsStr ? parseInt(abnormalRestartsStr, 10) : 0;

    if (abnormalRestarts > 0) {
      AsyncStorage.setItem(ABNORMAL_RESTARTS_KEY, "0").catch(() => {});
    }

    await apiRequest("POST", "/api/metrics/device", {
      sessionId: SESSION_ID,
      platform,
      memoryUsedMb: null,
      memoryTotalMb: totalMemoryMb,
      batteryLevel,
      batteryState,
      appUptimeSeconds: Math.floor(
        (Date.now() - parseInt(SESSION_ID.split("-")[0], 10)) / 1000
      ),
    });
  } catch {
    // non-fatal
  }
}

export function useDeviceMetrics(): void {
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
    if (!user?.id) {
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
  }, [user?.id]);
}
