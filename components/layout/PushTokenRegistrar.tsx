import React, { useEffect } from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/query-client";
import { PUSH_NOTIFICATIONS_ENABLED_KEY } from "@/lib/push-prefs";

let Notifications: typeof import("expo-notifications") | null = null;
try {
  Notifications = require("expo-notifications");
} catch {
  // no-op: expo-notifications is optional or missing
}

export function PushTokenRegistrar() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user || !Notifications) return;

    (async () => {
      try {
        // Check server-side master toggle first (survives reinstalls),
        // then fall back to local AsyncStorage for instant offline response.
        let pushEnabled = true;
        try {
          const profileResp = await apiRequest("GET", "/api/users/profile");
          const profileData = await profileResp.json() as { pushNotificationsEnabled?: boolean };
          if (profileData?.pushNotificationsEnabled === false) {
            pushEnabled = false;
          }
        } catch {
          // If server unreachable, fall back to local pref
          const localPref = await AsyncStorage.getItem(PUSH_NOTIFICATIONS_ENABLED_KEY);
          if (localPref === "false") pushEnabled = false;
        }

        if (!pushEnabled) {
          try {
            await apiRequest("PUT", "/api/users/me/push-token", { token: null });
          } catch {
            // no-op: ignore failures when clearing token
          }
          return;
        }

        if (Platform.OS === "android") {
          await Notifications.setNotificationChannelAsync("matches", {
            name: "Match notifications",
            importance: Notifications.AndroidImportance.HIGH,
            sound: "default",
            vibrationPattern: [0, 250, 250, 250],
          });
        }

        const { status: existing } = await Notifications.getPermissionsAsync();
        let finalStatus = existing;
        if (existing !== "granted") {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }
        if (finalStatus !== "granted") return;

        const tokenData = await Notifications.getExpoPushTokenAsync();
        const token = tokenData.data;
        if (!token) return;

        await apiRequest("PUT", "/api/users/me/push-token", { token });
      } catch {
        // no-op: ignore push token registration failures
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  return null;
}
