import React, { useState, useCallback, useEffect } from "react";
import { View, Text, Pressable, Switch, StyleSheet, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useMutation } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import { apiRequest, queryClient } from "@/lib/query-client";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { PUSH_NOTIFICATIONS_ENABLED_KEY } from "@/lib/push-prefs";

type NotifPrefs = {
  matches: boolean;
  zoneProposals: boolean;
  chat: boolean;
  motoclub: boolean;
  eventi: boolean;
};

type Props = {
  serverPushEnabled?: boolean;
  serverNotifPrefs?: Partial<NotifPrefs> | null;
};

export default function NotificationsPanel({ serverPushEnabled, serverNotifPrefs }: Props) {
  const [notifPrefsExpanded, setNotifPrefsExpanded] = useState(false);
  const [pushNotificationsEnabled, setPushNotificationsEnabled] = useState<boolean>(true);
  const [pushTogglePending, setPushTogglePending] = useState<boolean>(false);
  const [notifPrefs, setNotifPrefs] = useState<NotifPrefs>({
    matches: true,
    zoneProposals: true,
    chat: true,
    motoclub: true,
    eventi: true,
  });

  useEffect(() => {
    AsyncStorage.getItem(PUSH_NOTIFICATIONS_ENABLED_KEY).then((val) => {
      setPushNotificationsEnabled(val === null ? true : val === "true");
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (serverPushEnabled !== undefined) {
      setPushNotificationsEnabled(serverPushEnabled);
      AsyncStorage.setItem(PUSH_NOTIFICATIONS_ENABLED_KEY, serverPushEnabled ? "true" : "false").catch(() => {});
    }
  }, [serverPushEnabled]);

  useEffect(() => {
    if (serverNotifPrefs != null) {
      setNotifPrefs({
        matches: serverNotifPrefs.matches ?? true,
        zoneProposals: serverNotifPrefs.zoneProposals ?? true,
        chat: serverNotifPrefs.chat ?? true,
        motoclub: serverNotifPrefs.motoclub ?? true,
        eventi: serverNotifPrefs.eventi ?? true,
      });
    }
  }, [serverNotifPrefs]);

  const togglePushNotifications = useCallback(async (next: boolean) => {
    setPushTogglePending(true);
    setPushNotificationsEnabled(next);
    const getMessage = (e: unknown): string =>
      e instanceof Error ? e.message : typeof e === "string" ? e : "Operazione non riuscita";
    try {
      await AsyncStorage.setItem(PUSH_NOTIFICATIONS_ENABLED_KEY, next ? "true" : "false");
      await apiRequest("PUT", "/api/users/profile/dynamic", { pushNotificationsEnabled: next });
      if (next) {
        const Notifications = require("expo-notifications");
        const { status: existing } = await Notifications.getPermissionsAsync();
        let finalStatus = existing;
        if (existing !== "granted") {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }
        if (finalStatus !== "granted") {
          Alert.alert(
            "Permesso richiesto",
            "Abilita le notifiche dalle impostazioni del telefono per ricevere gli avvisi di match.",
          );
          return;
        }
        const tokenData = await Notifications.getExpoPushTokenAsync();
        const token = tokenData?.data;
        if (!token) {
          throw new Error("Impossibile ottenere il token di notifica");
        }
        await apiRequest("PUT", "/api/users/me/push-token", { token });
      } else {
        await apiRequest("PUT", "/api/users/me/push-token", { token: null });
      }
    } catch (e: unknown) {
      Alert.alert("Errore", getMessage(e));
      setPushNotificationsEnabled(!next);
      try {
        await AsyncStorage.setItem(PUSH_NOTIFICATIONS_ENABLED_KEY, !next ? "true" : "false");
      } catch {}
    } finally {
      setPushTogglePending(false);
    }
  }, []);

  const notifPrefsMutation = useMutation({
    mutationFn: async (updates: Partial<NotifPrefs>) => {
      await apiRequest("PUT", "/api/users/profile/dynamic", { notificationPreferences: updates });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users/me"] });
    },
    onError: (error: Error) => {
      Alert.alert("Errore", error.message);
    },
  });

  const toggleNotifPref = (key: keyof NotifPrefs, value: boolean) => {
    const previous = notifPrefs;
    setNotifPrefs(prev => ({ ...prev, [key]: value }));
    notifPrefsMutation.mutate({ [key]: value }, { onError: () => setNotifPrefs(previous) });
  };

  return (
    <View style={styles.section}>
      <Pressable style={styles.accordionHeader} onPress={() => setNotifPrefsExpanded(v => !v)}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Ionicons name="notifications-outline" size={20} color={Colors.accent} />
          <Text style={[styles.sectionTitle, { marginBottom: 0, color: Colors.text }]}>Notifiche</Text>
        </View>
        <Ionicons name={notifPrefsExpanded ? "chevron-up" : "chevron-down"} size={18} color={Colors.textSecondary} />
      </Pressable>
      {notifPrefsExpanded && (
        <View style={{ paddingTop: 8, gap: 2 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingVertical: 10,
              borderBottomWidth: 1.5,
              borderBottomColor: Colors.accent + "40",
              marginBottom: 6,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", flex: 1, marginRight: 12 }}>
              <Ionicons name="notifications" size={18} color={Colors.accent} style={{ marginRight: 8 }} />
              <Text style={{ flex: 1, fontSize: 13, fontFamily: "Inter_600SemiBold", color: Colors.text }}>
                Abilita notifiche push
              </Text>
            </View>
            <Switch
              testID="push-notifications-toggle"
              value={pushNotificationsEnabled}
              onValueChange={togglePushNotifications}
              trackColor={{ false: Colors.border, true: Colors.accent }}
              thumbColor="#fff"
              disabled={pushTogglePending}
            />
          </View>
          <Text style={{ fontSize: 11, color: Colors.textSecondary, fontFamily: "Inter_400Regular", marginBottom: 8 }}>
            Scegli quali notifiche push vuoi ricevere. Le notifiche disattivate non ti arriveranno sul telefono.
          </Text>
          {([
            { key: "matches" as const, label: "Match (nuovi abbinamenti)" },
            { key: "zoneProposals" as const, label: "Proposte nella tua zona" },
            { key: "chat" as const, label: "Messaggi in chat" },
            { key: "motoclub" as const, label: "MotoClub (inviti e aggiornamenti)" },
            { key: "eventi" as const, label: "Eventi in programma" },
          ]).map((item) => (
            <View
              key={item.key}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingVertical: 10,
                borderBottomWidth: 1,
                borderBottomColor: Colors.border,
              }}
            >
              <Text style={{ flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.text, marginRight: 12 }}>
                {item.label}
              </Text>
              <Switch
                value={notifPrefs[item.key]}
                onValueChange={(val) => toggleNotifPref(item.key, val)}
                trackColor={{ false: Colors.border, true: Colors.accent }}
                thumbColor="#fff"
                disabled={notifPrefsMutation.isPending}
              />
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    paddingHorizontal: 16,
    marginTop: 4,
  },
  accordionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
    marginBottom: 12,
  },
});
