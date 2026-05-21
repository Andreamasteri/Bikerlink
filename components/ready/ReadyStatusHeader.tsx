import React from "react";
import { View, Text, Pressable, ActivityIndicator, StyleSheet, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

interface ReadyStatusHeaderProps {
  isAvailable: boolean;
  t: (key: string) => string;
  handleToggle: () => void;
  isPending: boolean;
  toastMsg: string | null;
}

export function ReadyStatusHeader({
  isAvailable,
  t,
  handleToggle,
  isPending,
  toastMsg,
}: ReadyStatusHeaderProps) {
  return (
    <View style={styles.content}>
      <Text style={styles.statusText}>
        {isAvailable ? t("ready.statusAvailable") : t("map.unavailable")}
      </Text>
      <Text style={styles.statusSubtext}>
        {isAvailable
          ? t("ready.statusSubAvailable")
          : t("ready.statusSubUnavailable")}
      </Text>

      <Pressable
        style={[
          styles.toggleBtn,
          { backgroundColor: isAvailable ? Colors.success : Colors.accentRed },
        ]}
        onPress={handleToggle}
        disabled={isPending}
      >
        {isPending ? (
          <ActivityIndicator color="#fff" size="large" />
        ) : (
          <Ionicons
            name={isAvailable ? "checkmark-circle" : "close-circle"}
            size={48}
            color="#fff"
          />
        )}
      </Pressable>

      {toastMsg !== null && (
        <View style={styles.toastContainer}>
          <Text style={styles.toastText}>{toastMsg}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    alignItems: "center",
    padding: 24,
    gap: 8,
  },
  statusText: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    textAlign: "center",
    marginTop: 4,
  },
  statusSubtext: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    textAlign: "center",
    maxWidth: 280,
  },
  toggleBtn: {
    width: 140,
    height: 140,
    borderRadius: 70,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 16,
    elevation: 6,
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },
      android: {},
      web: { boxShadow: "0px 4px 8px rgba(0,0,0,0.3)" },
    }),
  },
  toastContainer: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: Colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  toastText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
    textAlign: "center",
  },
});
