/**
 * Task #2824 — Hub Routing.
 *
 * Dashboard di ingresso al gruppo "Sistema Routing" del pannello admin. Mostra
 * lo stato del kill-switch, l'engine attivo, un riepilogo salute degli engine e
 * i quick links a Controllo e Health.
 */
import React from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { ValhallaBenchCard } from "@/components/admin/ValhallaBenchCard";
import { AiDecisionsCard } from "@/components/admin/AiDecisionsCard";
import type { RoutingStatus } from "./routing-control/types";

interface QuickLink {
  key: string;
  label: string;
  icon: string;
  route: string;
  color: string;
}

const QUICK_LINKS: QuickLink[] = [
  { key: "control", label: "Controllo", icon: "tune-variant", route: "/admin/routing-control", color: "#9C27B0" },
  { key: "health", label: "Health", icon: "heart-pulse", route: "/admin/routing-health", color: "#4CAF50" },
  { key: "areas", label: "Aree di routing", icon: "map-marker-radius", route: "/admin/routing-areas", color: "#FF8A00" },
  { key: "functions", label: "Funzioni per engine", icon: "function-variant", route: "/admin/routing-functions", color: "#2196F3" },
];

export default function RoutingHubScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { data, isLoading } = useQuery<RoutingStatus>({
    queryKey: ["/api/admin/routing/status"],
    refetchInterval: 30000,
    staleTime: 10000,
  });

  const enabled = data?.killSwitch.enabled ?? false;
  const ghDown = data?.graphhopper.down ?? false;
  const valhallaDown = data?.valhalla.down ?? false;
  const m = data?.metrics;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
    >
      {/* Kill-switch state */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Stato Routing</Text>
        <View style={styles.killCard}>
          <MaterialCommunityIcons
            name={enabled ? "power-plug" : "power-plug-off"}
            size={26}
            color={enabled ? Colors.success : Colors.error}
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.killTitle}>{enabled ? "ATTIVO" : "DISABILITATO"}</Text>
            <Text style={styles.killSub}>
              {enabled ? "Routing operativo (toggle soft)" : "Routing bloccato (toggle soft)"}
            </Text>
          </View>
          {isLoading && <ActivityIndicator color={Colors.accent} />}
        </View>
      </View>

      {/* Engine attivo + salute */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Engine</Text>
        <View style={styles.cardRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{data?.activeEngine ?? "—"}</Text>
            <Text style={styles.statLabel}>Attivo</Text>
          </View>
          <View style={styles.statCard}>
            <MaterialCommunityIcons
              name={ghDown ? "alert-circle" : "check-circle"}
              size={20}
              color={ghDown ? Colors.error : Colors.success}
            />
            <Text style={styles.statLabel}>GraphHopper</Text>
          </View>
          <View style={styles.statCard}>
            <MaterialCommunityIcons
              name={!data?.valhalla.configured ? "minus-circle-outline" : valhallaDown ? "alert-circle" : "check-circle"}
              size={20}
              color={!data?.valhalla.configured ? Colors.textSecondary : valhallaDown ? Colors.error : Colors.success}
            />
            <Text style={styles.statLabel}>Valhalla</Text>
          </View>
        </View>
      </View>

      {/* Metriche live */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Metriche (5 min)</Text>
        <View style={styles.cardRow}>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: Colors.success }]}>{m?.successes ?? "—"}</Text>
            <Text style={styles.statLabel}>Successi</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: Colors.warning }]}>{m?.fallbacks ?? "—"}</Text>
            <Text style={styles.statLabel}>Fallback</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: Colors.error }]}>{m?.failures ?? "—"}</Text>
            <Text style={styles.statLabel}>Errori</Text>
          </View>
        </View>
      </View>

      {/* Bench Valhalla */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Bench Valhalla</Text>
        <ValhallaBenchCard />
      </View>

      {/* Decisioni AI Engine Selector */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Decisioni AI Engine Selector</Text>
        <AiDecisionsCard />
      </View>

      {/* Quick links */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Sezioni Routing</Text>
        <View style={styles.linksGrid}>
          {QUICK_LINKS.map((link) => (
            <TouchableOpacity
              key={link.key}
              style={styles.linkCard}
              onPress={() => router.push(link.route as never)}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons name={link.icon as never} size={22} color={link.color} />
              <Text style={styles.linkLabel}>{link.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  section: { marginHorizontal: 12, marginTop: 16 },
  sectionTitle: {
    fontFamily: "Inter_700Bold", fontSize: 13, color: Colors.textSecondary,
    textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10,
  },
  killCard: {
    flexDirection: "row", alignItems: "center", gap: 12, padding: 14,
    backgroundColor: Colors.surface, borderRadius: 12, borderWidth: 1, borderColor: Colors.border,
  },
  killTitle: { fontFamily: "Inter_700Bold", fontSize: 16, color: Colors.text },
  killSub: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  cardRow: { flexDirection: "row", gap: 8 },
  statCard: {
    flex: 1, backgroundColor: Colors.surface, borderRadius: 12, padding: 14,
    alignItems: "center", gap: 4, borderWidth: 1, borderColor: Colors.border,
  },
  statValue: { fontFamily: "Inter_700Bold", fontSize: 18, color: Colors.text, textTransform: "capitalize" },
  statLabel: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  linksGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  linkCard: {
    width: "31%", aspectRatio: 1, backgroundColor: Colors.surface,
    borderRadius: 12, alignItems: "center", justifyContent: "center", gap: 6,
    borderWidth: 1, borderColor: Colors.border,
  },
  linkLabel: { fontFamily: "Inter_500Medium", fontSize: 11, color: Colors.text, textAlign: "center" },
  warnCard: {
    flexDirection: "row", alignItems: "center", gap: 8, padding: 12,
    backgroundColor: Colors.warning + "18", borderRadius: 10, borderWidth: 1, borderColor: Colors.warning,
  },
  warnText: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.text, flex: 1 },
});
