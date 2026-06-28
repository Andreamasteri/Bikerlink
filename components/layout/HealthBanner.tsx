import React from "react";
import { View, Text, StyleSheet, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth-context";

// Banner di salute backend (Task #5124). Si alimenta dalle primitive esposte
// dall'Health Arbiter via /api/health (poll 60s in auth-context). Reso nel
// fragment delle (tabs), FUORI da <Tabs>, così non tocca le options dei
// Tabs.Screen (nessuna cascata setOptions → nessun loop React Navigation).
//   • DEGRADED → banner ambra, non bloccante (alcune funzioni potrebbero
//     rispondere lentamente o a singhiozzo).
//   • BROKEN   → banner rosso (una parte del backend è ko; il riavvio non
//     risolve, l'app resta utilizzabile dove possibile).
export function HealthBanner() {
  const { healthState, healthReason } = useAuth();
  const insets = useSafeAreaInsets();

  if (healthState === "READY") return null;
  const broken = healthState === "BROKEN";

  const webTop = Platform.OS === "web" ? 67 : 0;
  return (
    <View
      style={[
        styles.banner,
        { backgroundColor: broken ? "#C62828" : "#ED6C02", paddingTop: insets.top + webTop + 8 },
      ]}
    >
      <Ionicons name={broken ? "alert-circle" : "warning"} size={20} color="#fff" />
      <View style={styles.textWrap}>
        <Text style={styles.title}>
          {broken ? "Servizio parzialmente non disponibile" : "Servizio rallentato"}
        </Text>
        <Text style={styles.text} numberOfLines={2}>
          {healthReason ||
            (broken
              ? "Alcune funzioni potrebbero non rispondere. Stiamo lavorando per ripristinarle."
              : "Alcune funzioni potrebbero essere più lente del solito.")}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
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
});
