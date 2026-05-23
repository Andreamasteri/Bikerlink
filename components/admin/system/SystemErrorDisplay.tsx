import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

import { isAdminError } from "./systemUtils";

interface SystemErrorDisplayProps {
  error: any;
  sessionExpired: boolean;
  t: (key: string) => string;
  handleRefresh: () => void;
  goToLogin: () => void;
  topPadding?: number;
}

export function SystemErrorDisplay({
  error,
  sessionExpired,
  t,
  handleRefresh,
  goToLogin,
  topPadding = 0,
}: SystemErrorDisplayProps) {
  const code = isAdminError(error) ? (error as any).code : undefined;
  const status = isAdminError(error) ? (error as any).status : undefined;
  const reason = isAdminError(error) ? (error as any).reason : undefined;
  
  const isSessionGone = code === "session_expired" || sessionExpired;

  let title = t("admin.loadDataError");
  let hint = "";
  let iconColor = "#FF4444";
  
  if (isSessionGone) {
    title = "Sessione scaduta";
    hint = t("admin.sessionExpired");
    iconColor = "#FFA500";
  } else if (code === "forbidden") {
    title = t("admin.authError");
    const isNotAdmin = reason === "not-admin" || reason === "not_admin";
    hint = isNotAdmin
      ? "Il tuo account non ha i permessi di amministratore."
      : "Il server ha rifiutato la richiesta (403).";
  } else if (code === "server_error") {
    title = `Errore server (HTTP ${status ?? "?"})`;
    hint = "Il backend ha risposto con un errore. Riprova tra qualche secondo o controlla i log di produzione.";
  } else if (code === "network") {
    title = t("admin.serverUnreachable");
    hint = t("admin.checkConnection");
  } else if (error?.message) {
    hint = String(error.message);
  } else {
    hint = t("admin.emptyResponse");
  }

  return (
    <View style={[styles.center, { paddingTop: topPadding }]}>
      <Ionicons name="warning-outline" size={40} color={iconColor} />
      <Text style={styles.errorText}>{title}</Text>
      {hint ? (
        <Text style={[styles.loadingText, { textAlign: "center", paddingHorizontal: 24, marginTop: 4 }]}>
          {hint}
        </Text>
      ) : null}
      {isSessionGone ? (
        <>
          <TouchableOpacity style={styles.retryBtn} onPress={goToLogin}>
            <Text style={styles.retryBtnText}>Vai al login</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.retryBtn, { backgroundColor: "transparent", marginTop: 8 }]}
            onPress={handleRefresh}
          >
            <Text style={[styles.retryBtnText, { color: Colors.accent }]}>Riprova</Text>
          </TouchableOpacity>
        </>
      ) : (
        <TouchableOpacity style={styles.retryBtn} onPress={handleRefresh}>
          <Text style={styles.retryBtnText}>Riprova</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.background,
    gap: 12,
  },
  loadingText: {
    color: Colors.textMuted ?? "#888",
    fontFamily: "Inter_400Regular",
    fontSize: 14,
  },
  errorText: {
    color: "#FF4444",
    fontFamily: "Inter_500Medium",
    fontSize: 15,
    textAlign: "center",
  },
  retryBtn: {
    marginTop: 8,
    paddingHorizontal: 20,
    paddingVertical: 8,
    backgroundColor: Colors.accent,
    borderRadius: 8,
  },
  retryBtnText: {
    color: "#fff",
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
  },
});
