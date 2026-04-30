import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Linking,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/lib/theme-context";

interface UpdateNudgeModalProps {
  onDismiss: () => void;
}

const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.bikerlink.app";
const APP_STORE_URL = "https://apps.apple.com/search?term=BikerLink";

export default function UpdateNudgeModal({ onDismiss }: UpdateNudgeModalProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  function handleOpenStore() {
    const url = Platform.OS === "android" ? PLAY_STORE_URL : APP_STORE_URL;
    Linking.openURL(url).catch(() => {});
  }

  return (
    <View
      style={styles.overlay}
      pointerEvents="box-none"
    >
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.surface,
            marginBottom: insets.bottom + 16,
          },
        ]}
      >
        <View style={styles.iconRow}>
          <Ionicons name="cloud-download-outline" size={28} color={colors.primary} />
        </View>
        <Text style={[styles.title, { color: colors.text }]}>
          Aggiornamento disponibile
        </Text>
        <Text style={[styles.body, { color: colors.textSecondary }]}>
          È disponibile un aggiornamento, scaricalo ora.
        </Text>
        <TouchableOpacity
          style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
          onPress={handleOpenStore}
          activeOpacity={0.8}
        >
          <Text style={styles.primaryBtnText}>Scarica ora</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={onDismiss}
          activeOpacity={0.7}
        >
          <Text style={[styles.secondaryBtnText, { color: colors.textSecondary }]}>
            Ricordamelo dopo
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    zIndex: 9998,
    justifyContent: "flex-end",
  },
  card: {
    borderRadius: 16,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  iconRow: {
    alignItems: "center",
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: "700" as const,
    textAlign: "center",
    marginBottom: 8,
  },
  body: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 20,
  },
  primaryBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 10,
  },
  primaryBtnText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600" as const,
  },
  secondaryBtn: {
    alignItems: "center",
    paddingVertical: 10,
  },
  secondaryBtnText: {
    fontSize: 14,
  },
});
