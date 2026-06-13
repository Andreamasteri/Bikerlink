import React, { useCallback } from "react";
import { View, Text, StyleSheet, Pressable, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Colors from "@/constants/colors";
import { queryClient } from "@/lib/query-client";

interface ProfileFooterProps {
  handleLogout: () => void;
  t: (key: string) => string;
}

export const ProfileFooter: React.FC<ProfileFooterProps> = ({
  handleLogout,
  t,
}) => {
  const handleClearCache = useCallback(() => {
    const doClear = async () => {
      try {
        const allKeys = await AsyncStorage.getAllKeys();
        const appKeys = ([...allKeys] as string[]).filter(
          (k) =>
            k.startsWith("@bikerlink/") ||
            k.startsWith("bikerlink:") ||
            k.startsWith("bikerlink_") ||
            k === "user_ghost_mode"
        );
        if (appKeys.length > 0) {
          await AsyncStorage.removeMany(appKeys);
        }
        queryClient.clear();
        Alert.alert(t("profile.cacheClearedTitle"), t("profile.cacheClearedMsg"));
      } catch {
        Alert.alert(t("common.error"), t("profile.cacheError"));
      }
    };
    Alert.alert(t("profile.clearCacheTitle"), t("profile.clearCacheMsg"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("profile.clearCacheConfirm"), style: "destructive", onPress: doClear },
    ]);
  }, [t]);

  return (
    <View style={[styles.section, { marginTop: 32, gap: 10 }]}>
      <Pressable style={styles.clearCacheBtn} onPress={handleClearCache}>
        <Ionicons name="trash-bin-outline" size={20} color={Colors.textSecondary} />
        <Text style={styles.clearCacheBtnText}>Cancella cache locale</Text>
      </Pressable>
      <Pressable style={styles.logoutBtn} onPress={handleLogout}>
        <Ionicons name="log-out" size={22} color="#fff" />
        <Text style={styles.logoutBtnText}>{t("auth.logout") || t("profile.logout")}</Text>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  section: {
    paddingHorizontal: 16,
    marginTop: 4,
  },
  clearCacheBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingVertical: 13,
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  clearCacheBtnText: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
  },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.accentRed,
    borderRadius: 12,
    paddingVertical: 16,
    gap: 10,
  },
  logoutBtnText: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
});
