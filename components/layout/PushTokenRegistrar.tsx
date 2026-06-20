import { useEffect } from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
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
          // Tutti i canali usati dal server (server/push-notifications.ts):
          // matches, motoclub, eventi. Devono esistere lato client o le push
          // inviate su quel channelId vengono silenziosamente scartate.
          await Notifications.setNotificationChannelAsync("matches", {
            name: "Match notifications",
            importance: Notifications.AndroidImportance.HIGH,
            sound: "default",
            vibrationPattern: [0, 250, 250, 250],
          });
          await Notifications.setNotificationChannelAsync("motoclub", {
            name: "MotoClub",
            importance: Notifications.AndroidImportance.HIGH,
            sound: "default",
            vibrationPattern: [0, 250, 250, 250],
          });
          await Notifications.setNotificationChannelAsync("eventi", {
            name: "Eventi e raduni",
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
        if (finalStatus !== "granted") {
          // Causa esplicita: permessi negati dall'utente/SO. Non è un errore FCM.
          console.error(
            `[PushTokenRegistrar] PERMESSI_NEGATI: notifiche non concesse (status=${finalStatus}) — token non registrato`,
          );
          return;
        }

        const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
        if (!projectId) {
          console.error(
            "[PushTokenRegistrar] PROJECT_ID_MANCANTE: Constants.expoConfig.extra.eas.projectId assente — token non registrato",
          );
          return;
        }

        let token: string | null = null;
        try {
          const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
          token = tokenData.data;
        } catch (tokenErr) {
          // Permessi OK ma il token non arriva: quasi sempre FCM non configurato
          // (google-services.json/credenziale FCM mancante) oppure offline.
          console.error(
            "[PushTokenRegistrar] TOKEN_NON_OTTENUTO: getExpoPushTokenAsync fallito nonostante i permessi concessi. " +
              "Causa probabile: FCM/APNs non configurato o dispositivo offline. Dettaglio:",
            tokenErr,
          );
          return;
        }
        if (!token) {
          console.error(
            "[PushTokenRegistrar] TOKEN_VUOTO: getExpoPushTokenAsync ha restituito un token vuoto nonostante i permessi concessi",
          );
          return;
        }

        await apiRequest("PUT", "/api/users/me/push-token", { token });
      } catch (err) {
        console.error("[PushTokenRegistrar] ERRORE_REGISTRAZIONE: registrazione token push fallita:", err);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  return null;
}
