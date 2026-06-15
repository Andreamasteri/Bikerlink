import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, Alert, ActivityIndicator } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { SupportContactModal } from "@/components/SupportContactModal";
import { runAllTests } from "@/lib/diagnostic/runner";
import { apiRequest } from "@/lib/query-client";
import { useAuth } from "@/lib/auth-context";

export const ProfileSupportSection: React.FC = () => {
  const [showModal, setShowModal] = useState(false);
  const [diagRunning, setDiagRunning] = useState(false);
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const handleInviaDiagnostica = async () => {
    if (diagRunning) return;
    setDiagRunning(true);
    try {
      const report = await runAllTests({ isAdmin });
      await apiRequest("POST", "/api/diagnostic/report", {
        triggeredBy: "user",
        appVersion: report.appVersion,
        platform: report.platform,
        deviceModel: report.deviceModel,
        sentryEventId: report.sentryEventId,
        summary: report.summary,
        results: report.results,
      });
      const { failed, warned, passed } = report.summary;
      Alert.alert(
        "Diagnostica inviata ✓",
        `${passed} OK · ${warned} avvisi · ${failed} errori\n\nI dati sono stati inviati al team di supporto.`
      );
    } catch (err) {
      Alert.alert("Errore", err instanceof Error ? err.message : "Impossibile inviare la diagnostica");
    } finally {
      setDiagRunning(false);
    }
  };

  return (
    <View style={styles.section}>
      <Pressable style={styles.menuItem} onPress={() => setShowModal(true)} testID="profile-support">
        <Ionicons name="headset-outline" size={22} color={Colors.text} />
        <Text style={styles.menuLabel}>Supporto tecnico</Text>
        <Ionicons name="chevron-forward" size={18} color={Colors.textSecondary} />
      </Pressable>

      <Pressable
        style={[styles.menuItem, diagRunning && styles.menuItemDisabled]}
        onPress={handleInviaDiagnostica}
        disabled={diagRunning}
        testID="profile-send-diagnostic"
      >
        {diagRunning ? (
          <ActivityIndicator size="small" color={Colors.text} />
        ) : (
          <MaterialCommunityIcons name="stethoscope" size={22} color={Colors.text} />
        )}
        <Text style={styles.menuLabel}>
          {diagRunning ? "Analisi in corso…" : "Invia diagnostica"}
        </Text>
        {!diagRunning && <Ionicons name="chevron-forward" size={18} color={Colors.textSecondary} />}
      </Pressable>

      <SupportContactModal visible={showModal} onClose={() => setShowModal(false)} />
    </View>
  );
};

const styles = StyleSheet.create({
  section: {
    paddingHorizontal: 16,
    marginTop: 4,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  menuItemDisabled: {
    opacity: 0.6,
  },
  menuLabel: {
    flex: 1,
    fontSize: 16,
    fontFamily: "Inter_500Medium",
    color: Colors.text,
  },
});
