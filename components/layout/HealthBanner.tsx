import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Platform,
  Pressable,
  Modal,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth-context";
import {
  reasonsToMessages,
  GENERIC_MESSAGE_BROKEN,
  GENERIC_MESSAGE_SLOW,
} from "@/lib/health-reason-messages";

// Banner di salute backend (Task #5124 / #5147). Si alimenta dalle primitive
// esposte dall'Health Arbiter via /api/health (poll 60s in auth-context). Reso
// nel fragment delle (tabs), FUORI da <Tabs>, così non tocca le options dei
// Tabs.Screen (nessuna cascata setOptions → nessun loop React Navigation).
//   • DEGRADED → banner ambra, non bloccante
//   • BROKEN   → banner rosso (una parte del backend è ko)
//
// Task #5147: banner dismissibile (×) + tap per dettaglio user-friendly.
// I reason watchdog raw vengono mappati a testo leggibile via health-reason-messages.ts.
export function HealthBanner() {
  const { healthState, healthReason, user } = useAuth();
  const insets = useSafeAreaInsets();
  const [dismissed, setDismissed] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);

  const isAdmin = user?.role === "admin";

  // Reset dismiss quando il backend torna READY (stesso pattern DegradedBanner)
  useEffect(() => {
    if (healthState === "READY") setDismissed(false);
  }, [healthState]);

  if (healthState === "READY" || dismissed) return null;

  const broken = healthState === "BROKEN";

  // Splitta il join " · " in array di reason individuali per la mappatura
  const rawReasons = healthReason ? healthReason.split(" · ").filter(Boolean) : [];
  const fallback = broken ? GENERIC_MESSAGE_BROKEN : GENERIC_MESSAGE_SLOW;
  const friendlyMessages = reasonsToMessages(rawReasons, fallback);
  const summaryText = friendlyMessages.join(" · ");

  const webTop = Platform.OS === "web" ? 67 : 0;
  const bgColor = broken ? "#C62828" : "#ED6C02";
  const iconName = broken ? "alert-circle" : "warning";

  return (
    <>
      <View
        style={[
          styles.banner,
          { backgroundColor: bgColor, paddingTop: insets.top + webTop + 8 },
        ]}
      >
        <Ionicons name={iconName} size={20} color="#fff" />

        {/* Tap sul corpo per aprire il dettaglio */}
        <Pressable
          style={styles.textWrap}
          onPress={() => setDetailVisible(true)}
          accessibilityRole="button"
          accessibilityLabel="Mostra dettagli stato servizio"
          hitSlop={4}
        >
          <Text style={styles.title}>
            {broken ? "Servizio parzialmente non disponibile" : "Servizio rallentato"}
          </Text>
          <Text style={styles.text} numberOfLines={2}>
            {summaryText}
          </Text>
        </Pressable>

        {/* Bottone ⓘ visibile — apre dettaglio */}
        <Pressable
          onPress={() => setDetailVisible(true)}
          accessibilityRole="button"
          accessibilityLabel="Dettagli"
          hitSlop={8}
          style={styles.iconBtn}
        >
          <Ionicons name="information-circle-outline" size={20} color="rgba(255,255,255,0.85)" />
        </Pressable>

        {/* Bottone × — chiude il banner */}
        <Pressable
          onPress={() => setDismissed(true)}
          accessibilityRole="button"
          accessibilityLabel="Nascondi avviso"
          hitSlop={8}
          style={styles.iconBtn}
        >
          <Ionicons name="close" size={20} color="rgba(255,255,255,0.85)" />
        </Pressable>
      </View>

      {/* Modal dettaglio */}
      <Modal
        visible={detailVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setDetailVisible(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setDetailVisible(false)} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 24 }]}>
          {/* Handle */}
          <View style={styles.handle} />

          {/* Header del modal */}
          <View style={styles.sheetHeader}>
            <Ionicons name={iconName} size={24} color={bgColor} />
            <Text style={[styles.sheetTitle, { color: bgColor }]}>
              {broken ? "Servizio parzialmente non disponibile" : "Servizio rallentato"}
            </Text>
            <Pressable
              onPress={() => setDetailVisible(false)}
              accessibilityRole="button"
              accessibilityLabel="Chiudi"
              hitSlop={8}
            >
              <Ionicons name="close" size={22} color="#666" />
            </Pressable>
          </View>

          <ScrollView
            style={styles.sheetScroll}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.sheetContent}
          >
            {/* Messaggi user-friendly */}
            {friendlyMessages.map((msg, i) => (
              <View key={i} style={styles.messageRow}>
                <Ionicons name="ellipse" size={6} color="#888" style={styles.bullet} />
                <Text style={styles.messageText}>{msg}</Text>
              </View>
            ))}

            <Text style={styles.reassurance}>
              {broken
                ? "Il nostro team è già al lavoro per ripristinare il servizio. Alcune sezioni dell'app potrebbero non rispondere temporaneamente."
                : "Il servizio è attivo. Alcune operazioni potrebbero richiedere più tempo del solito. Ci scusiamo per il disagio."}
            </Text>

            {/* Sezione tecnica — solo admin */}
            {isAdmin && rawReasons.length > 0 && (
              <View style={styles.techSection}>
                <Text style={styles.techTitle}>Dettagli tecnici (admin)</Text>
                {rawReasons.map((r, i) => (
                  <Text key={i} style={styles.techText}>{r}</Text>
                ))}
              </View>
            )}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
  textWrap: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: "#fff",
  },
  text: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: "rgba(255,255,255,0.9)",
    lineHeight: 16,
  },
  iconBtn: {
    padding: 4,
  },
  // Modal / bottom sheet
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12,
    maxHeight: "75%",
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#ddd",
    alignSelf: "center",
    marginBottom: 12,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#eee",
  },
  sheetTitle: {
    flex: 1,
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
  },
  sheetScroll: {
    flexShrink: 1,
  },
  sheetContent: {
    padding: 20,
    gap: 10,
  },
  messageRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  bullet: {
    marginTop: 6,
  },
  messageText: {
    flex: 1,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: "#333",
    lineHeight: 20,
  },
  reassurance: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: "#666",
    lineHeight: 19,
    marginTop: 8,
  },
  techSection: {
    marginTop: 16,
    padding: 12,
    backgroundColor: "#f5f5f5",
    borderRadius: 8,
    gap: 4,
  },
  techTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: "#888",
    marginBottom: 4,
  },
  techText: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: "#999",
    lineHeight: 16,
  },
});
