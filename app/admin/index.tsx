import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Platform } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const BASE_SECTIONS = [
  { icon: "people" as const, label: "Gestione Utenti", route: "/admin/users", color: Colors.maleIcon },
  { icon: "settings" as const, label: "Impostazioni App", route: "/admin/settings", color: Colors.text },
  { icon: "gift" as const, label: "Easter Eggs", route: "/admin/easter-eggs", color: Colors.warning },
  { icon: "flag" as const, label: "Segnalazioni", route: "/admin/reports", color: Colors.accentRed },
  { icon: "chatbox-ellipses" as const, label: "Bug & Richieste", route: "/admin/feedback", color: Colors.warning, hasBadge: true },
  { icon: "eye" as const, label: "Log Moderatori", route: "/admin/moderator-logs", color: Colors.textSecondary },
  { icon: "bar-chart" as const, label: "Analytics & Export", route: "/admin/analytics", color: Colors.success },
  { icon: "location" as const, label: "Coppie Prossimità", route: "/admin/proximity", color: Colors.success },
  { icon: "key" as const, label: "Codici Invito", route: "/admin/invitation-codes", color: Colors.accent },
];

const SYNECO_SECTIONS = [
  { icon: "megaphone" as const, label: "Annunci Syneco", route: "/admin/ads", color: Colors.accent },
  { icon: "construct" as const, label: "Officine Syneco", route: "/admin/workshops", color: Colors.syneco },
];

export default function AdminIndexScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { data: feedbackCountData } = useQuery({ queryKey: ["/api/admin/feedback/count"] });
  const feedbackCount = (feedbackCountData as any)?.count || 0;
  const { data: synecoData } = useQuery({ queryKey: ["/api/settings/syneco-branding"] });
  const synecoEnabled = (synecoData as any)?.visible === true;
  const ADMIN_SECTIONS = synecoEnabled ? [...BASE_SECTIONS.slice(0, 1), ...SYNECO_SECTIONS, ...BASE_SECTIONS.slice(1)] : BASE_SECTIONS;

  if (user?.role !== "admin") {
    return <View style={styles.loading}><Text style={styles.errorText}>Accesso non autorizzato</Text></View>;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={[styles.content, { paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 16 }]}>
      <Text style={styles.title}>Pannello Amministrazione</Text>
      <Text style={styles.subtitle}>Gestisci BikerLink</Text>

      <View style={styles.grid}>
        {ADMIN_SECTIONS.map((section) => (
          <Pressable key={section.route} style={styles.card} onPress={() => router.push(section.route as any)}>
            <Ionicons name={section.icon} size={28} color={section.color} />
            <Text style={styles.cardLabel}>{section.label}</Text>
            {section.hasBadge && feedbackCount > 0 && (
              <View style={styles.badgeContainer}>
                <Text style={styles.badgeText}>! {feedbackCount}</Text>
              </View>
            )}
          </Pressable>
        ))}
      </View>

      <View style={styles.placeholders}>
        <View style={styles.placeholder}>
          <Ionicons name="card" size={20} color={Colors.textSecondary} />
          <Text style={styles.placeholderText}>PayPal - Coming Soon</Text>
        </View>
        <View style={styles.placeholder}>
          <Ionicons name="restaurant" size={20} color={Colors.textSecondary} />
          <Text style={styles.placeholderText}>Foodtracker - Coming Soon</Text>
        </View>
        <View style={styles.placeholder}>
          <Ionicons name="cloud-upload" size={20} color={Colors.textSecondary} />
          <Text style={styles.placeholderText}>Google Drive Backup - Coming Soon</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 24 },
  loading: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: Colors.background },
  errorText: { fontSize: 16, fontFamily: "Inter_400Regular", color: Colors.accentRed },
  title: { fontSize: 24, fontFamily: "Inter_700Bold", color: Colors.accent },
  subtitle: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.textSecondary, marginTop: 4, marginBottom: 24 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  card: { width: "47%", backgroundColor: Colors.surface, borderRadius: 12, padding: 20, gap: 8, position: "relative" as const },
  cardLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.text },
  badgeContainer: { position: "absolute" as const, top: 8, right: 8, backgroundColor: Colors.accentRed, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2, minWidth: 20, alignItems: "center" as const },
  badgeText: { fontSize: 11, fontFamily: "Inter_700Bold", color: "#fff" },
  placeholders: { marginTop: 24, gap: 8 },
  placeholder: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: Colors.surface, borderRadius: 10, padding: 14, opacity: 0.5 },
  placeholderText: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
});
