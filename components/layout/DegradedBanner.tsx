import React, { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { reasonsToMessages, GENERIC_MESSAGE_DEGRADED } from "@/lib/health-reason-messages";

// ──────────────────────────────────────────────────────────────────────
// DegradedBanner (Task #5123 / #5147)
//
// Rende VISIBILE lo stato "degraded" del backend, che prima era invisibile agli
// utenti. /api/health distingue tre stati (booting=503, degraded=200, ready=200):
// quando il server è READY ma un sottosistema non-critico è in errore (es. uno
// scheduler della Phase 5 non si è armato, drift-check non eseguito) risponde con
// status "degraded" + degradedReasons[].
//
// Banner non invasivo: una striscia sottile in alto, dismissibile. È pensato per
// l'utente standard, quindi NON mostra i nomi tecnici dei sottosistemi (quelli
// sono in /api/health e nella schermata admin "System Health"): solo un avviso
// generico che alcune funzioni potrebbero essere temporaneamente limitate.
//
// Mutuamente esclusivo di fatto con OfflineBanner: la query /api/health gira solo
// quando si è online, quindi i due banner non si sovrappongono.
//
// Task #5147: la mappa reason → messaggi è ora centralizzata in
// lib/health-reason-messages.ts (condivisa con HealthBanner).
// ──────────────────────────────────────────────────────────────────────

interface HealthResp {
  status: "booting" | "degraded" | "ready";
  initializing: boolean;
  degraded: boolean;
  degradedReasons?: string[];
}

export function DegradedBanner() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const [dismissed, setDismissed] = useState(false);

  const healthQ = useQuery<HealthResp>({
    queryKey: ["/api/health"],
    refetchInterval: 60_000,
    retry: false,
    // Non far lampeggiare il banner durante un refetch fallito: tieni l'ultimo
    // valore noto finché non arriva una risposta nuova.
    placeholderData: (prev) => prev,
  });

  const degraded = healthQ.data?.status === "degraded" || healthQ.data?.degraded === true;

  // Reset del dismiss per-episodio: quando il backend torna non-degraded, il
  // banner è di nuovo autorizzato a comparire al prossimo episodio di degrado
  // (stesso comportamento episode-reset di OfflineBanner).
  useEffect(() => {
    if (!degraded) setDismissed(false);
  }, [degraded]);

  if (!degraded || dismissed) return null;

  const topInset = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;

  // Avviso mirato quando i reason sono mappati a funzioni note; altrimenti generico.
  const message = reasonsToMessages(
    healthQ.data?.degradedReasons,
    GENERIC_MESSAGE_DEGRADED
  ).map((r) => r.message).join(" · ");

  return (
    <View style={[styles.wrap, { top: topInset }]} pointerEvents="box-none">
      <View style={[styles.banner, { backgroundColor: colors.surface, borderColor: colors.warning as string }]}>
        <Ionicons name="warning-outline" size={18} color={colors.warning as string} />
        <Text style={[styles.label, { color: colors.text as string }]} numberOfLines={3}>
          {message}
        </Text>

        <Pressable
          testID="degraded-dismiss"
          accessibilityRole="button"
          accessibilityLabel="Nascondi avviso"
          onPress={() => setDismissed(true)}
          hitSlop={8}
          style={styles.dismissBtn}
        >
          <Ionicons name="close" size={18} color={colors.textSecondary as string} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    paddingHorizontal: 12,
    zIndex: 9998,
  },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingLeft: 14,
    paddingRight: 8,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
    maxWidth: 520,
    width: "100%",
  },
  label: {
    flex: 1,
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
  },
  dismissBtn: {
    padding: 6,
  },
});
