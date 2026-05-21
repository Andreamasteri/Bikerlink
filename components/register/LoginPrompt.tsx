import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import Colors from "@/constants/colors";
import { t } from "@/lib/i18n";

interface LoginPromptProps {
  onPress: () => void;
}

export function LoginPrompt({ onPress }: LoginPromptProps) {
  return (
    <View style={styles.loginRow}>
      <Text style={styles.loginPrompt}>{t("auth.hasAccount")}</Text>
      <TouchableOpacity onPress={onPress} testID="go-login">
        <Text style={styles.loginLink}>{t("auth.login")}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  loginRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    marginTop: 16,
  },
  loginPrompt: {
    color: Colors.textSecondary,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  loginLink: {
    color: Colors.accent,
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
});
